import axios from 'axios';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { Types } from 'mongoose';
import User, { IUser } from '../../models/User';
import Client from '../../models/Client';
import InvitationToken from '../../models/InvitationToken';
import { AppError } from '../../shared/utils/AppError';
import logger from '../../shared/utils/logger';
import {
  getErrorMessage,
  httpErrorBody,
} from '../../shared/utils/unknownError';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Vérifier le jeton que Google One Tap dépose dans la page.
 *
 * Le vérifier auprès de Google est le seul moyen de savoir qu'il vient bien de
 * lui : un jeton est du texte, et rien n'empêche d'en fabriquer un qui ait
 * l'air correct. L'`audience` compte tout autant que la signature — un jeton
 * valide émis pour une autre application ouvrirait sinon une session ici.
 *
 * Deux échecs possibles, un seul message : que Google refuse le jeton ou qu'il
 * réponde sans adresse, l'appelant n'a rien à en faire de différent, et le
 * détail appartient au journal plutôt qu'à la réponse.
 */
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
      error: getErrorMessage(err),
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

/**
 * Échanger le code d'autorisation de Google contre l'identité de la personne.
 *
 * Le second temps du flux OAuth : le navigateur revient avec un code à usage
 * unique, que seul le serveur peut échanger — il est le seul à détenir le
 * secret client.
 *
 * `redirect_uri` doit être exactement celle annoncée à l'aller, au caractère
 * près. Google refuse sinon avec `redirect_uri_mismatch`, et c'est la panne
 * la plus fréquente de ce flux : elle survient au moindre écart de domaine
 * entre les environnements. D'où la raison lue dans le corps de l'erreur et
 * journalisée — sans elle, cet échec ne se diagnostique pas.
 */
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
    // Google nomme la raison dans le corps — `invalid_grant`,
    // `redirect_uri_mismatch` — et c'est la seule chose qui rende un tel
    // échec diagnosticable.
    const { status, error, errorDescription } = httpErrorBody(err);
    logger.error('exchangeGoogleCode: Google token exchange failed', {
      status,
      error,
      errorDescription,
      redirectUri,
    });
    throw new AppError(
      `Échange de code Google échoué: ${errorDescription ?? getErrorMessage(err)}`,
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
      error: getErrorMessage(err),
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

/**
 * Retrouver le compte de cette adresse, ou le créer.
 *
 * Il n'y a pas d'inscription dans Kettle : on arrive par Google, et le compte
 * naît de la première connexion. C'est ce qui explique qu'aucune route ne
 * crée d'utilisateur — celles qui existaient ont d'ailleurs été supprimées,
 * personne ne les appelait.
 *
 * La photo est rafraîchie à chaque passage, le nom non : Google renvoie le nom
 * tel que la personne l'a réglé chez lui, et l'écraser à chaque connexion
 * effacerait une correction faite ici.
 */
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

/**
 * Rattacher un client à un coach, sans jamais le rattacher deux fois.
 *
 * Deux écritures atomiques plutôt qu'un lire-puis-écrire : un lien
 * d'invitation peut être ouvert deux fois en même temps — deux onglets, un
 * double clic — et la version en deux temps créerait alors deux entrées pour
 * le même coach, que plus rien ne distinguerait ensuite.
 *
 * Le filtre `'coaches.coachId': { $ne: coachId }` fait le travail : si le lien
 * existe déjà, la mise à jour ne correspond à rien et ne fait rien. C'est
 * l'idempotence, obtenue par la requête et non par une vérification préalable.
 */
export const linkClientToCoach = async (
  userId: Types.ObjectId,
  coachId: Types.ObjectId
): Promise<void> => {
  // Créer le client s'il n'existe pas, en une seule écriture.
  await Client.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, coaches: [] } },
    { upsert: true }
  );

  // N'ajouter le coach que s'il n'est pas déjà lié : le filtre porte la
  // condition, donc un second appel ne fait rien plutôt que de doubler.
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

/**
 * Contrôler un jeton d'invitation avant de s'en servir.
 *
 * Deux refus distincts — inconnu, expiré — parce qu'ils n'appellent pas la
 * même suite : un jeton expiré se redemande au coach, un jeton inconnu veut
 * dire que le lien a été mal recopié. Les confondre laisserait la personne
 * sans rien à faire.
 */
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
