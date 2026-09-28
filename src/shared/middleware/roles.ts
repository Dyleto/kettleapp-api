import { Request, Response, NextFunction } from 'express';
import type { ICoach } from '../../models/Coach';
import type { IClient } from '../../models/Client';
import User from '../../models/User';
import Coach from '../../models/Coach';
import Client from '../../models/Client';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import logger from '../utils/logger';

// Vérifie si l'utilisateur est Admin
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

// Vérifie si l'utilisateur est Coach
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

// Vérifie si l'utilisateur est Client
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
 * Reading what the guards above put there.
 *
 * `Express.Locals` declares `coach` and `client` as optional — correctly, since
 * a response only carries them once the matching guard has run. Controllers
 * answered that with `res.locals.coach as ICoach`, eighteen times over, and an
 * assertion is a promise to the compiler that nobody checks.
 *
 * The promise holds only as long as every route mounting a controller also
 * mounts its guard. The day one does not, the controller receives `undefined`,
 * the assertion hides it, and the first `coach._id` throws a TypeError — a 500
 * on what is really a 403, with a stack trace in place of an explanation.
 *
 * These read the same value and check it. Same type, no cast, and a missing
 * guard now says what it is.
 */
const required = <T>(value: T | undefined, space: string): T => {
  if (!value) {
    throw new AppError(`Accès refusé : Espace ${space} uniquement`, 403);
  }
  return value;
};

/** The coach this request belongs to. 403 if `requireCoach` did not run. */
export const coachOf = (res: Response): ICoach =>
  required(res.locals.coach, 'Coach');

/** The client this request belongs to. 403 if `requireClient` did not run. */
export const clientOf = (res: Response): IClient =>
  required(res.locals.client, 'Client');
