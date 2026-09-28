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

/**
 * Ouvrir une session à partir du code renvoyé par Google.
 *
 * Le jeton d'invitation est facultatif et change tout : sans lui on se
 * reconnecte, avec lui on rejoint le suivi d'un coach. C'est le seul chemin
 * par lequel un client entre dans Kettle, et il doit rester franchissable
 * plusieurs fois — quelqu'un peut ouvrir le lien, abandonner, et recommencer.
 *
 * Le rattachement se fait avant la session, jamais après : une session ouverte
 * sur un compte qui n'a pas été rattaché laisserait la personne devant un
 * espace client vide, sans moyen de rejouer le lien qu'elle vient de
 * consommer.
 */
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

/**
 * La même ouverture de session, par le bandeau One Tap de Google.
 *
 * Google propose deux flux et ils n'échangent pas la même chose : ici la page
 * reçoit directement un jeton d'identité, là-bas un code à échanger côté
 * serveur. Seule la première étape diffère — d'où deux contrôleurs qui se
 * ressemblent, et une suite commune à partir du moment où l'on tient
 * l'identité.
 */
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

/**
 * Qui est connecté, et ce qu'il a le droit de voir.
 *
 * Le front s'en sert au démarrage pour savoir quel espace ouvrir : c'est
 * `buildUser` qui dit s'il y a un coach, un client, ou les deux derrière ce
 * compte. Un même compte peut tenir les deux rôles, ce qui interdit de déduire
 * l'espace d'un simple drapeau.
 *
 * Une session qui pointe vers un compte disparu donne un 404 plutôt qu'un 401 :
 * ce n'est pas un défaut d'authentification, la session est valide — c'est le
 * compte qui n'est plus là, et les deux cas appellent des suites différentes.
 */
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

/**
 * Dire ce que vaut un lien d'invitation, avant toute connexion.
 *
 * Appelé quand la personne ouvre le lien, donc avant qu'elle ne s'identifie :
 * découvrir qu'un lien est expiré après s'être connecté chez Google serait
 * un détour pour rien. Le nom du coach est renvoyé pour que l'écran puisse
 * dire qui invite, ce qui est la seule chose qui rende ce lien crédible.
 */
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

/**
 * Fermer la session, des deux côtés.
 *
 * Détruire la session en base et effacer le cookie : l'un sans l'autre laisse
 * soit un cookie qui ne correspond plus à rien, soit une session que le
 * navigateur continue de présenter. La destruction est attendue avant de
 * répondre, sinon le client pourrait rappeler l'API avant qu'elle n'ait eu
 * lieu.
 */
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

/**
 * Ouvrir une session sans passer par Google — développement seulement.
 *
 * Cette route n'est montée que hors production (voir `auth.routes.ts`), et
 * c'est ce montage conditionnel qui la rend acceptable : elle ouvre une
 * session sur un compte arbitraire à partir d'un simple identifiant.
 *
 * Elle existe parce que le banc d'essai en a besoin : mener une séance dans un
 * vrai navigateur suppose d'être connecté, et il n'est pas question de faire
 * passer une vérification automatisée par le flux OAuth de Google.
 */
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
