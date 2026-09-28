import { IUser } from '../../models/User';
import Coach from '../../models/Coach';
import Client from '../../models/Client';
import { HEALTH_CONSENT_VERSION } from '../../shared/constants/consent';

/**
 * Le compte tel que le front a besoin de le lire.
 *
 * Un même compte peut être coach, client, ou les deux : c'est ce qui interdit
 * de déduire l'espace d'un simple drapeau, et ce que cette fonction résout en
 * un seul endroit plutôt qu'à chaque écran.
 *
 * `needsHealthConsent` se calcule ici parce que le front ne connaît pas la
 * version courante du texte de consentement et n'a aucune raison de la
 * connaître. La question se repose si elle n'a jamais été posée, ou si le
 * texte a changé depuis la réponse — les deux cas se ramènent à une
 * comparaison de version, qu'il vaut mieux faire une fois du bon côté.
 */
export const buildUser = async (user: IUser) => {
  const [coach, client] = await Promise.all([
    Coach.findOne({ userId: user._id }),
    Client.findOne({ userId: user._id }),
  ]);

  const consent = client?.healthConsent;

  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    picture: user.picture,
    isAdmin: user.isAdmin,
    isCoach: !!coach,
    isClient: !!client,
    healthConsent: consent
      ? {
          granted: consent.granted,
          decidedAt: consent.decidedAt,
          version: consent.version,
        }
      : null,
    needsHealthConsent: !!client && consent?.version !== HEALTH_CONSENT_VERSION,
  };
};
