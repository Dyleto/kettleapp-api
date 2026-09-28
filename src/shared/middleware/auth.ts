import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';

/**
 * Exiger une session ouverte, et rien de plus.
 *
 * C'est de l'authentification, pas de l'autorisation : on vérifie qu'on sait
 * qui demande, pas ce qu'il a le droit de faire. Les rôles sont l'affaire de
 * `requireCoach`, `requireClient` et `requireAdmin`, qui se posent par-dessus.
 *
 * L'échec passe par `next(AppError)` et non par un `res.status(401).json()`
 * direct, comme c'était le cas : la réponse ne portait alors ni `status` ni
 * `requestId`, contrairement à toutes les autres erreurs de l'API. Un front
 * qui lit une forme unique recevait donc, sur ce seul cas, une forme
 * différente — et le seul identifiant qui aurait permis de relier cette
 * réponse à son journal manquait.
 */
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.session.userId;
  const rid = req.requestId ?? '?';

  if (!userId) {
    logger.warn(`[${rid}] authMiddleware: aucune session`, {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    });
    return next(new AppError('Accès non autorisé', 401));
  }

  next();
};
