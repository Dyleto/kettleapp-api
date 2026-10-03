import { Response } from 'express';
import { z } from 'zod';
import { AppError } from './AppError';
import logger from './logger';

/**
 * Répondre à travers le contrat.
 *
 * Le schéma n'est pas une vérification, c'est le filtre : Zod ne garde que
 * les clés déclarées, donc ce qui n'est pas au contrat ne sort pas. C'est ce
 * qui a retiré `clientId`, `programId` et `__v` de l'historique, sans qu'il
 * ait fallu les énumérer un par un dans chaque contrôleur.
 *
 * Un écart ne devient pas une réponse tronquée : c'est un défaut du serveur,
 * donc un 500, et le détail part dans le journal. Le contraire — envoyer ce
 * qui a pu être validé — ferait arriver au client une réponse à laquelle il
 * manque un champ, sans que rien ne le signale.
 */
export const respond = <S extends z.ZodType>(
  res: Response,
  status: number,
  schema: S,
  data: unknown
): void => {
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    logger.error(`[${res.req?.requestId ?? '?'}] réponse hors contrat`, {
      path: res.req?.originalUrl,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    throw new AppError('Erreur interne', 500);
  }

  res.status(status).json(parsed.data);
};
