import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import Coach from '../models/Coach';
import Client from '../models/Client';
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
