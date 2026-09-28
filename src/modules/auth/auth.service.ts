import axios from 'axios';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { Types } from 'mongoose';
import User, { IUser } from '../../models/User';
import Client from '../../models/Client';
import InvitationToken from '../../models/InvitationToken';
import { AppError } from '../../shared/utils/AppError';
import logger from '../../shared/utils/logger';
import { errorMessage, httpErrorBody } from '../../shared/utils/unknownError';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const verifyGoogleCredential = async (
  credential: string
): Promise<TokenPayload> => {
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (err) {
    logger.error('verifyGoogleCredential: Google token verification failed', {
      error: errorMessage(err),
    });
    throw new AppError('Token Google One Tap invalide', 401);
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    logger.error('verifyGoogleCredential: empty payload from Google');
    throw new AppError('Token Google One Tap invalide', 401);
  }
  return payload;
};

export const exchangeGoogleCode = async (
  code: string,
  redirectUri: string
): Promise<TokenPayload> => {
  logger.debug('exchangeGoogleCode: calling Google token endpoint', {
    redirectUri,
  });

  let tokenResponse;
  try {
    tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
  } catch (err) {
    // Google names the reason in the body — `invalid_grant`,
    // `redirect_uri_mismatch` — and that reason is the only thing that makes
    // such a failure diagnosable.
    const { status, error, errorDescription } = httpErrorBody(err);
    logger.error('exchangeGoogleCode: Google token exchange failed', {
      status,
      error,
      errorDescription,
      redirectUri,
    });
    throw new AppError(
      `Échange de code Google échoué: ${errorDescription ?? errorMessage(err)}`,
      401
    );
  }

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken: tokenResponse.data.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (err) {
    logger.error('exchangeGoogleCode: id_token verification failed', {
      error: errorMessage(err),
    });
    throw new AppError('Token Google invalide', 401);
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    logger.error('exchangeGoogleCode: empty payload after token exchange');
    throw new AppError('Token Google invalide', 401);
  }

  return payload;
};

export const findOrCreateUser = async (
  payload: TokenPayload
): Promise<IUser> => {
  const { email, name, given_name, family_name, picture } = payload;

  let user = await User.findOne({ email });
  if (!user) {
    logger.info('findOrCreateUser: creating new user', { email });
    user = await User.create({
      email,
      firstName: given_name || name?.split(' ')[0] || '',
      lastName: family_name || name?.split(' ')[1] || '',
      picture,
    });
  } else {
    logger.debug('findOrCreateUser: existing user found', { email });
    if (picture && picture !== user.picture) {
      user.picture = picture;
      await user.save();
    }
  }
  return user;
};

export const linkClientToCoach = async (
  userId: Types.ObjectId,
  coachId: Types.ObjectId
): Promise<void> => {
  // Crée le client s'il n'existe pas (upsert atomique)
  await Client.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, coaches: [] } },
    { upsert: true }
  );

  // Ajoute le coach seulement s'il n'est pas déjà lié (atomique, idempotent)
  const result = await Client.updateOne(
    { userId, 'coaches.coachId': { $ne: coachId } },
    { $push: { coaches: { coachId, linkedAt: new Date() } } }
  );

  if (result.modifiedCount > 0) {
    logger.info('linkClientToCoach: coach linked', { userId, coachId });
  } else {
    logger.debug('linkClientToCoach: already linked (no-op)', {
      userId,
      coachId,
    });
  }
};

export const validateInvitationToken = async (token: string) => {
  const invToken = await InvitationToken.findOne({ token });

  if (!invToken) {
    logger.warn('validateInvitationToken: token not found');
    throw new AppError("Token d'invitation invalide", 400);
  }

  if (new Date() > invToken.expiresAt) {
    logger.warn('validateInvitationToken: token expired', {
      expiresAt: invToken.expiresAt,
      coachId: invToken.coachId,
    });
    throw new AppError("Token d'invitation expiré", 400);
  }

  return invToken;
};
