import User, { IUser } from "../models/User";
import Coach from "../models/Coach";
import Client from "../models/Client";
import { HEALTH_CONSENT_VERSION } from "../constants/consent";

export const createUserService = async (data: IUser): Promise<IUser> => {
  const newUser = new User(data);
  return await newUser.save();
};

export const getUsersService = async (): Promise<IUser[]> => {
  return await User.find();
};

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
    // La question se repose si elle n'a jamais été posée, ou si le texte a
    // changé depuis la réponse. Le calcul reste ici : le front ne connaît pas
    // la version courante et n'a pas à la connaître.
    needsHealthConsent:
      !!client && consent?.version !== HEALTH_CONSENT_VERSION,
  };
};
