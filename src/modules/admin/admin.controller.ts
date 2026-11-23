import { Request, Response } from 'express';
import Coach from '../../models/Coach';
import Client from '../../models/Client';
import Exercise from '../../models/Exercise';
import CompletedSession from '../../models/CompletedSession';
import { catchAsync } from '../../shared/utils/catchAsync';
import logger from '../../shared/utils/logger';
import { respond } from '../../shared/utils/respond';
import {
  adminStatsPayload,
  adminCoachPayload,
  createdCoachPayload,
} from '../../contract';
import { z } from 'zod';
import { createCoach as createCoachAccount } from './admin.service';

/**
 * Ouvrir un compte de coach : le service décide, le contrôleur répond.
 *
 * Un compte trouvé sans `promote` répond 200 et non 409 : ce n'est pas une
 * erreur mais une question, et sa réponse est typée par le contrat — le
 * front n'a pas à reconnaître un message pour savoir quoi demander.
 */
export const createCoach = catchAsync(async (req: Request, res: Response) => {
  const rid = req.requestId ?? '?';
  const result = await createCoachAccount(req.body);

  if (result.outcome === 'exists') {
    logger.info(`[${rid}] createCoach: existing account, asking first`);
    respond(res, 200, createdCoachPayload, {
      status: 'exists',
      account: result.account,
    });
    return;
  }

  logger.info(`[${rid}] createCoach: ${result.outcome}`, {
    coachId: result.coach._id,
  });
  respond(res, 201, createdCoachPayload, {
    status: 'success',
    outcome: result.outcome,
    coach: result.coach,
  });
});

/**
 * Les compteurs du tableau de bord d'administration.
 *
 * Volontairement des nombres et rien d'autre : combien de coachs, de clients,
 * de séances. Aucun contenu de séance, aucun ressenti, aucun commentaire n'y
 * figure — c'est ce que la politique de confidentialité annonce, et cette
 * fonction est l'endroit où cette promesse se tient ou se rompt.
 */
export const getStats = catchAsync(async (_req: Request, res: Response) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    coachCount,
    clientCount,
    sessionCount,
    sessionTodayCount,
    exerciseCount,
  ] = await Promise.all([
    Coach.countDocuments(),
    Client.countDocuments(),
    CompletedSession.countDocuments(),
    CompletedSession.countDocuments({ completedAt: { $gte: todayStart } }),
    Exercise.countDocuments(),
  ]);

  respond(res, 200, adminStatsPayload, {
    coachCount,
    clientCount,
    sessionCount,
    sessionTodayCount,
    exerciseCount,
  });
});

/**
 * La liste des coachs, avec le nombre de clients de chacun.
 *
 * Même règle que les compteurs : on voit qui coache combien de personnes,
 * jamais ce qui se passe dans leurs séances.
 */
export const getCoaches = catchAsync(async (_req: Request, res: Response) => {
  const coaches = await Coach.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'userDoc',
      },
    },
    { $unwind: '$userDoc' },
    {
      $lookup: {
        from: 'clients',
        let: { coachId: '$_id' },
        pipeline: [
          { $match: { $expr: { $in: ['$$coachId', '$coaches.coachId'] } } },
          { $count: 'total' },
        ],
        as: 'clientData',
      },
    },
    {
      $lookup: {
        from: 'exercises',
        let: { coachId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$createdBy', '$$coachId'] } } },
          { $count: 'total' },
        ],
        as: 'exerciseData',
      },
    },
    {
      $project: {
        _id: 1,
        createdAt: 1,
        firstName: '$userDoc.firstName',
        lastName: '$userDoc.lastName',
        email: '$userDoc.email',
        picture: '$userDoc.picture',
        clientCount: {
          $ifNull: [{ $arrayElemAt: ['$clientData.total', 0] }, 0],
        },
        exerciseCount: {
          $ifNull: [{ $arrayElemAt: ['$exerciseData.total', 0] }, 0],
        },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  respond(res, 200, z.array(adminCoachPayload), coaches);
});
