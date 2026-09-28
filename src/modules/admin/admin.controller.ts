import { Request, Response } from 'express';
import User from '../../models/User';
import Coach from '../../models/Coach';
import Client from '../../models/Client';
import Exercise from '../../models/Exercise';
import CompletedSession from '../../models/CompletedSession';
import { catchAsync } from '../../shared/utils/catchAsync';
import { AppError } from '../../shared/utils/AppError';
import logger from '../../shared/utils/logger';

/**
 * Créer un coach, ou promouvoir un compte existant.
 *
 * C'est la seule porte d'entrée d'un coach dans Kettle : il n'y a pas
 * d'inscription, un administrateur le crée. Les deux cas sont traités parce
 * que les deux arrivent — quelqu'un peut être client depuis des mois avant de
 * devenir coach, et lui refuser la promotion parce qu'il a déjà un compte
 * l'obligerait à en créer un second avec une autre adresse.
 *
 * Le 409 sur un coach déjà existant, plutôt qu'un succès silencieux : créer
 * deux fois n'est pas anodin ici, et l'administrateur a probablement confondu
 * deux adresses.
 */
export const createCoach = catchAsync(async (req: Request, res: Response) => {
  const { email, firstName, lastName } = req.body;
  const rid = req.requestId ?? '?';

  logger.info(`[${rid}] createCoach: start`, { email });

  let user = await User.findOne({ email });

  if (user) {
    const existingCoach = await Coach.findOne({ userId: user._id });
    if (existingCoach) {
      logger.warn(`[${rid}] createCoach: user is already a coach`, { email });
      throw new AppError('Cet utilisateur est déjà coach', 409);
    }
    logger.info(`[${rid}] createCoach: existing user promoted to coach`, {
      email,
    });
  } else {
    user = await User.create({ email, firstName, lastName });
    logger.info(`[${rid}] createCoach: new user created`, { email });
  }

  const coach = await Coach.create({ userId: user._id });
  logger.info(`[${rid}] createCoach: coach profile created`, {
    coachId: coach._id,
    userId: user._id,
    email,
  });

  res.status(201).json({
    status: 'success',
    message: 'Coach créé avec succès',
    coach,
    user,
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

  res.status(200).json({
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

  res.status(200).json(coaches);
});
