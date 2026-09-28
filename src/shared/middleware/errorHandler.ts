import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';

/** Ce qu'une erreur Mongoose ou JWT veut vraiment dire, côté HTTP. */
const normalize = (
  err: Error,
  statusCode: number,
  message: string
): { statusCode: number; message: string } => {
  if (err.name === 'CastError')
    return { statusCode: 400, message: 'Ressource introuvable (ID invalide)' };
  if (err.name === 'ValidationError')
    return { statusCode: 400, message: 'Données invalides' };
  if (err.name === 'JsonWebTokenError')
    return {
      statusCode: 401,
      message: 'Token invalide, veuillez vous reconnecter',
    };
  return { statusCode, message };
};

/**
 * La sortie unique de toutes les erreurs de l'API.
 *
 * `next` est déclaré et inutilisé volontairement. Express décide qu'un
 * middleware traite les erreurs à son arité — `fn.length === 4` — et avec
 * trois paramètres, cette fonction était montée comme un middleware ordinaire
 * et ne tournait jamais. Toutes les erreurs tombaient sur le gestionnaire
 * interne d'Express, qui répond en HTML : le front, qui analyse du JSON,
 * recevait une page web. Rien de ce fichier ne s'appliquait — ni le
 * `requestId`, ni le masquage des 500 en production, ni la normalisation
 * ci-dessous.
 *
 * Mesuré sur l'Express de ce projet (4.21.2) :
 *   3 paramètres → 500 text/html, « <!DOCTYPE html> » et une pile d'appels
 *   4 paramètres → 500 application/json, le corps écrit ici
 *
 * Le paramètre reste donc, quoi qu'en pense un linter.
 */
export const globalErrorHandler = (
  err: AppError | Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  // Normaliser d'abord, journaliser ensuite. Dans l'autre sens, un CastError
  // — un identifiant mal formé, soit une faute du client et un 400 — était
  // journalisé en niveau erreur avec sa pile d'appels comme si le serveur
  // avait cassé, puis rétrogradé en 400 dans la réponse. Le journal annonçait
  // un plantage qui n'avait pas eu lieu.
  const { statusCode, message } = normalize(
    err,
    (err as AppError).statusCode || 500,
    err.message
  );

  const requestId = req.requestId ?? '?';
  const userId = req.session?.userId ?? 'anonymous';

  const context = {
    requestId,
    userId,
    method: req.method,
    url: req.originalUrl,
    // Les clés du corps, jamais ses valeurs : un corps peut porter un secret.
    bodyKeys: req.body ? Object.keys(req.body) : [],
    params: req.params,
  };

  if (statusCode >= 500) {
    logger.error(`💥 [${requestId}] ${err.message}`, {
      ...context,
      stack: err.stack,
    });
  } else if (statusCode === 401 || statusCode === 403) {
    // Les échecs d'authentification méritent d'être vus en production.
    logger.warn(`🔒 [${requestId}] ${statusCode} ${err.message}`, context);
  } else {
    logger.warn(`⚠️  [${requestId}] ${statusCode} ${err.message}`, context);
  }

  const isProd = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    status: statusCode >= 500 ? 'error' : 'fail',
    // En production, le détail d'une 500 reste dans le journal : il peut
    // nommer une colonne, un hôte ou une requête. Le `requestId` est ce qui
    // relie la réponse au journal.
    message:
      isProd && statusCode === 500
        ? 'Une erreur interne est survenue'
        : message,
    requestId,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
