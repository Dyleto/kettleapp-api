import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.session.userId;
  const rid = req.requestId ?? '?';

  if (!userId) {
    logger.warn(`[${rid}] authMiddleware: no session`, {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    });
    return res.status(401).json({ message: 'Accès non autorisé' });
  }

  next();
};
