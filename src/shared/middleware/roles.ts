import { Request, Response, NextFunction } from 'express';
import type { ICoach } from '../../models/Coach';
import type { IClient } from '../../models/Client';
import User from '../../models/User';
import Coach from '../../models/Coach';
import Client from '../../models/Client';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import logger from '../utils/logger';

/**
 * Réserver la route aux administrateurs.
 *
 * Seul garde qui ne pose rien dans `res.locals` : il n'y a pas d'objet
 * « administrateur », juste un drapeau sur l'utilisateur.
 */
export const requireAdmin = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;
    const rid = req.requestId ?? '?';

    const user = await User.findById(userId);

    if (!user || !user.isAdmin) {
      logger.warn(`[${rid}] requireAdmin: denied`, {
        userId,
        isAdmin: user?.isAdmin ?? false,
      });
      throw new AppError('Accès refusé : Administrateur requis', 403);
    }

    next();
  }
);

/**
 * Réserver la route à l'espace coach, et poser le coach pour la suite.
 *
 * Le profil est relu à chaque requête plutôt que gardé en session : un coach
 * dont le profil vient d'être retiré perdrait sinon l'accès seulement à sa
 * prochaine connexion.
 */
export const requireCoach = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;
    const rid = req.requestId ?? '?';

    const coach = await Coach.findOne({ userId });

    if (!coach) {
      logger.warn(`[${rid}] requireCoach: no coach profile found`, { userId });
      throw new AppError('Accès refusé : Espace Coach uniquement', 403);
    }

    res.locals.coach = coach;
    next();
  }
);

/**
 * Réserver la route à l'espace client, et poser le client pour la suite.
 *
 * Un même compte peut être coach et client à la fois : les deux gardes ne
 * s'excluent pas, ils répondent simplement à deux questions différentes.
 */
export const requireClient = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;
    const rid = req.requestId ?? '?';

    const client = await Client.findOne({ userId });

    if (!client) {
      logger.warn(`[${rid}] requireClient: no client profile found`, {
        userId,
      });
      throw new AppError('Accès refusé : Espace Client uniquement', 403);
    }

    res.locals.client = client;
    next();
  }
);

/**
 * Lire ce que les gardes ci-dessus ont posé.
 *
 * `Express.Locals` déclare `coach` et `client` comme optionnels — à juste
 * titre, puisqu'une réponse ne les porte qu'une fois le garde correspondant
 * passé. Les contrôleurs répondaient à ça par `res.locals.coach as ICoach`,
 * dix-huit fois, et une assertion est une promesse faite au compilateur que
 * personne ne vérifie.
 *
 * La promesse ne tient qu'aussi longtemps que chaque route montant un
 * contrôleur monte aussi son garde. Le jour où l'une ne le fait pas, le
 * contrôleur reçoit `undefined`, l'assertion le masque, et le premier
 * `coach._id` lève un TypeError — un 500 sur ce qui est un 403, avec une pile
 * d'appels au lieu d'une explication.
 *
 * Celles-ci lisent la même valeur et la vérifient. Même type, plus de cast, et
 * un garde oublié dit maintenant ce qu'il est.
 */
const required = <T>(value: T | undefined, space: string): T => {
  if (!value) {
    throw new AppError(`Accès refusé : Espace ${space} uniquement`, 403);
  }
  return value;
};

/** Le coach de cette requête. 403 si `requireCoach` n'est pas passé. */
export const coachOf = (res: Response): ICoach =>
  required(res.locals.coach, 'Coach');

/** Le client de cette requête. 403 si `requireClient` n'est pas passé. */
export const clientOf = (res: Response): IClient =>
  required(res.locals.client, 'Client');
