import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import logger from "../utils/logger";

export const globalErrorHandler = (
  err: AppError | Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Valeurs par défaut
  let statusCode = (err as AppError).statusCode || 500;
  let status = (err as AppError).status || "error";
  let message = err.message;

  if (statusCode === 500) {
    logger.error(`💥 ${err.message}`, {
      stack: err.stack,
      url: req.originalUrl,
    });
  } else {
    // Si c'est une erreur opérationnelle (4xx), un simple warning suffit
    logger.warn(`⚠️ ${err.message} (${req.originalUrl})`);
  }

  // Gestion spécifique de certaines erreurs (ex: Mongoose, JWT)
  if (err.name === "CastError") {
    message = "Ressource introuvable (ID invalide)";
    statusCode = 400;
  }
  if (err.name === "ValidationError") {
    message = "Données invalides";
    statusCode = 400;
  }
  if (err.name === "JsonWebTokenError") {
    message = "Token invalide, veuillez vous reconnecter";
    statusCode = 401;
  }

  // En prod, on ne veut pas fuiter les détails techniques des erreurs 500
  if (process.env.NODE_ENV === "production" && statusCode === 500) {
    message = "Une erreur interne est survenue";
  }

  res.status(statusCode).json({
    status,
    message,
    // On affiche la stack trace seulement en dev
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};
