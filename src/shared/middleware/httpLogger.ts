import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import logger from '../utils/logger';

/**
 * Middleware HTTP : log chaque requête avec un request-id unique.
 * Permet de corréler les logs d'une même requête.
 */
export const httpLogger = (req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID().slice(0, 8); // 8 chars suffisent pour identifier la requête
  const start = Date.now();

  // On stocke le requestId dans req pour que les controllers puissent l'utiliser
  req.requestId = requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = req.session?.userId ?? 'anonymous';
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';

    const meta = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId,
      ip,
    };

    const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms [${requestId}]`;

    if (res.statusCode >= 500) {
      logger.error(message, meta);
    } else if (res.statusCode >= 400) {
      logger.warn(message, meta);
    } else {
      logger.http(message, meta);
    }
  });

  next();
};
