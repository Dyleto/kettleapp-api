import { Request, Response } from 'express';
import { Types } from 'mongoose';
import User from '../../models/User';
import Coach from '../../models/Coach';
import { IUser } from '../../models/User';
import { catchAsync } from '../../shared/utils/catchAsync';
import { AppError } from '../../shared/utils/AppError';
import { buildUser } from '../user/user.service';
import {
  exchangeGoogleCode,
  verifyGoogleCredential,
  findOrCreateUser,
  linkClientToCoach,
  validateInvitationToken,
} from './auth.service';
import logger from '../../shared/utils/logger';
import { TokenPayload } from 'google-auth-library';
import { getErrorMessage } from '../../shared/utils/errors';

// ─── Google OAuth (code flow) ─────────────────────────────────────────────────

export const googleAuthCallback = catchAsync(
  async (req: Request, res: Response) => {
    const { code, redirectUri, invitationToken } = req.body;
    const rid = req.requestId ?? '?';

    logger.info(`[${rid}] googleAuthCallback: start`, {
      hasCode: !!code,
      redirectUri,
      hasInvitationToken: !!invitationToken,
    });

    let payload: TokenPayload;

    try {
      payload = await exchangeGoogleCode(code, redirectUri);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`[${rid}] googleAuthCallback: exchangeGoogleCode failed`, {
          error: getErrorMessage(error),
          redirectUri,
        });
      }

      throw error;
    }

    logger.info(`[${rid}] googleAuthCallback: google token exchanged`, {
      email: payload.email,
    });

    if (invitationToken) {
      logger.info(`[${rid}] googleAuthCallback: processing invitation`, {
        email: payload.email,
      });
      try {
        const invToken = await validateInvitationToken(invitationToken);
        const user = await findOrCreateUser(payload);
        await linkClientToCoach(
          user._id as Types.ObjectId,
          invToken.coachId as Types.ObjectId
        );
        logger.info(`[${rid}] googleAuthCallback: client linked to coach`, {
          email: payload.email,
          coachId: invToken.coachId,
        });
      } catch (error) {
        if (error instanceof Error) {
          logger.error(
            `[${rid}] googleAuthCallback: invitation processing failed`,
            {
              error: getErrorMessage(error),
              email: payload.email,
            }
          );
        }

        throw error;
      }
    }

    const user = await User.findOne({ email: payload.email });
    if (!user) {
      logger.warn(`[${rid}] googleAuthCallback: user not found after login`, {
        email: payload.email,
      });
      throw new AppError('Utilisateur inconnu. Contactez votre coach.', 401);
    }

    if (payload.picture && payload.picture !== user.picture) {
      user.picture = payload.picture;
      await user.save();
    }

    req.session.userId = (user._id as string).toString();
    try {
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`[${rid}] googleAuthCallback: session save failed`, {
          userId: req.session.userId,
          error: getErrorMessage(error),
        });
      }

      throw new AppError('Erreur de session, veuillez réessayer', 500);
    }

    const builtUser = await buildUser(user);
    logger.info(`[${rid}] googleAuthCallback: success`, {
      userId: user._id,
      email: user.email,
    });
    res.status(200).json({ status: 'success', user: builtUser });
  }
);

// ─── Google One Tap ───────────────────────────────────────────────────────────

export const googleOneTapCallback = catchAsync(
  async (req: Request, res: Response) => {
    const { credential } = req.body;
    const rid = req.requestId ?? '?';

    logger.info(`[${rid}] googleOneTapCallback: start`);

    let payload;
    try {
      payload = await verifyGoogleCredential(credential);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          `[${rid}] googleOneTapCallback: credential verification failed`,
          {
            error: getErrorMessage(error),
          }
        );
      }

      throw error;
    }

    logger.info(`[${rid}] googleOneTapCallback: credential verified`, {
      email: payload.email,
    });

    const user = await User.findOne({ email: payload.email });
    if (!user) {
      logger.warn(`[${rid}] googleOneTapCallback: user not found`, {
        email: payload.email,
      });
      throw new AppError('Utilisateur inconnu. Contactez votre coach.', 401);
    }

    if (payload.picture && payload.picture !== user.picture) {
      user.picture = payload.picture;
      await user.save();
    }

    req.session.userId = (user._id as string).toString();
    try {
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`[${rid}] googleOneTapCallback: session save failed`, {
          userId: req.session.userId,
          error: getErrorMessage(error),
        });
      }

      throw new AppError('Erreur de session, veuillez réessayer', 500);
    }

    const builtUser = await buildUser(user);
    logger.info(`[${rid}] googleOneTapCallback: success`, {
      userId: user._id,
      email: user.email,
    });
    res.status(200).json({ status: 'success', user: builtUser });
  }
);

// ─── /me ─────────────────────────────────────────────────────────────────────

export const getMe = catchAsync(async (req: Request, res: Response) => {
  const userId = req.session.userId;
  const rid = req.requestId ?? '?';

  if (!userId) {
    logger.debug(`[${rid}] getMe: no session userId`);
    throw new AppError('Non authentifié', 401);
  }

  const user = await User.findById(userId);
  if (!user) {
    logger.warn(`[${rid}] getMe: userId in session but user not in DB`, {
      userId,
    });
    throw new AppError('Utilisateur introuvable', 404);
  }

  const builtUser = await buildUser(user);
  res.status(200).json({ status: 'success', user: builtUser });
});

// ─── Invitation ───────────────────────────────────────────────────────────────

export const verifyInviteToken = catchAsync(
  async (req: Request, res: Response) => {
    const token = req.query.token as string;
    const rid = req.requestId ?? '?';

    if (!token) throw new AppError('Token manquant', 400);

    let invitationToken;
    try {
      invitationToken = await validateInvitationToken(token);
    } catch (error) {
      if (error instanceof Error) {
        logger.warn(`[${rid}] verifyInviteToken: invalid/expired token`, {
          error: getErrorMessage(error),
        });
      }
      throw error;
    }

    const coach = await Coach.findById(invitationToken.coachId).populate<{
      userId: IUser;
    }>('userId', 'firstName lastName picture');

    if (!coach || !coach.userId) {
      logger.error(`[${rid}] verifyInviteToken: coach not found`, {
        coachId: invitationToken.coachId,
      });
      throw new AppError('Coach introuvable', 500);
    }

    res.status(200).json({
      valid: true,
      coach: {
        id: coach._id,
        firstName: coach.userId.firstName,
        lastName: coach.userId.lastName,
        picture: coach.userId.picture,
      },
    });
  }
);

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logout = catchAsync(async (req: Request, res: Response) => {
  const userId = req.session.userId;
  const rid = req.requestId ?? '?';

  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });

  res.clearCookie('connect.sid');
  logger.info(`[${rid}] logout: success`, { userId });
  res.status(200).json({ message: 'Déconnexion réussie' });
});

// ─── Connexion de développement (jamais en production) ──────────────────────

export const devLogin = catchAsync(async (req: Request, res: Response) => {
  const userId = req.body.userId || process.env.DEV_LOGIN_USER_ID;
  const rid = req.requestId ?? '?';

  if (!userId) {
    throw new AppError('userId requis (body ou DEV_LOGIN_USER_ID)', 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    logger.warn(`[${rid}] devLogin: user not found`, { userId });
    throw new AppError('Utilisateur introuvable', 404);
  }

  req.session.userId = (user._id as string).toString();
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  const builtUser = await buildUser(user);
  logger.info(`[${rid}] devLogin: success`, { userId: user._id });
  res.status(200).json({ status: 'success', user: builtUser });
});
