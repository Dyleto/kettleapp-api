import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';

/** What a Mongoose or JWT failure really means, in HTTP terms. */
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
 * The single exit for every error the API produces.
 *
 * `next` is declared and unused on purpose. Express decides whether a
 * middleware is an error handler by its arity — `fn.length === 4` — and with
 * three parameters this function was mounted as an ordinary middleware and
 * never ran at all. Every error fell through to Express's own handler, which
 * answers in HTML: the front end, which parses JSON, received a web page.
 * With it, nothing here applied — not the request id, not the masking of
 * 500s in production, not the normalisation below.
 *
 * Measured on this project's own Express (4.21.2):
 *   3 parameters → 500 text/html, `<!DOCTYPE html>` and a stack trace
 *   4 parameters → 500 application/json, the body written here
 *
 * So the parameter stays, whatever a linter thinks of it.
 */
export const globalErrorHandler = (
  err: AppError | Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  // Normalising first, logging second. The other way round, a CastError — a
  // malformed id, which is a client mistake and a 400 — was logged at error
  // level with a full stack trace as though the server had broken, and only
  // then downgraded to 400 in the response. The logs claimed a crash that
  // never happened.
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
    // The body's keys, never its values: a body can carry a credential.
    bodyKeys: req.body ? Object.keys(req.body) : [],
    params: req.params,
  };

  if (statusCode >= 500) {
    logger.error(`💥 [${requestId}] ${err.message}`, {
      ...context,
      stack: err.stack,
    });
  } else if (statusCode === 401 || statusCode === 403) {
    // Auth failures are worth seeing in production.
    logger.warn(`🔒 [${requestId}] ${statusCode} ${err.message}`, context);
  } else {
    logger.warn(`⚠️  [${requestId}] ${statusCode} ${err.message}`, context);
  }

  const isProd = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    status: statusCode >= 500 ? 'error' : 'fail',
    // In production a 500's detail stays in the logs: it can name a column,
    // a host or a query. The request id is what ties the two together.
    message:
      isProd && statusCode === 500
        ? 'Une erreur interne est survenue'
        : message,
    requestId,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
