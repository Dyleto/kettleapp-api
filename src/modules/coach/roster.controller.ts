import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { coachOf } from '../../shared/middleware/roles';
import Client from '../../models/Client';
import { IUser } from '../../models/User';
import Session from '../../models/Session';
import CompletedSession from '../../models/CompletedSession';
import { getAuthorizedClient } from './coach.service';
import { getOrCreate } from '../program/program.service';
import {
  PopulatedSession,
  formatSession,
} from '../../shared/utils/sessionFormatter';

export const getClients = catchAsync(async (req: Request, res: Response) => {
  const coach = coachOf(res);

  const clients = await Client.aggregate([
    { $match: { 'coaches.coachId': coach._id } },
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
      // Un seul passage sur les séances du client : les bilans non lus et la
      // date de la dernière séance. Le $match tape l'index
      // { clientId: 1, completedAt: -1 }.
      $lookup: {
        from: 'completedsessions',
        let: { clientId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$clientId', '$$clientId'] } } },
          // Décroissant : `$first` donne la séance la plus récente, donc son
          // ressenti, sans un second passage sur la collection.
          { $sort: { completedAt: -1 } },
          {
            $group: {
              _id: null,
              lastCompletedAt: { $first: '$completedAt' },
              lastEffort: { $first: '$feedback.effort' },
              unseen: {
                $sum: {
                  $cond: [{ $ne: ['$viewedByCoach', true] }, 1, 0],
                },
              },
            },
          },
        ],
        as: 'sessionStats',
      },
    },
    {
      $project: {
        _id: 1,
        firstName: '$userDoc.firstName',
        lastName: '$userDoc.lastName',
        picture: '$userDoc.picture',
        unseenCount: {
          $ifNull: [{ $arrayElemAt: ['$sessionStats.unseen', 0] }, 0],
        },
        // Absent tant que le client n'a jamais terminé de séance.
        lastCompletedAt: {
          $arrayElemAt: ['$sessionStats.lastCompletedAt', 0],
        },
        // Le ressenti de cette dernière séance — absent si elle n'en portait
        // pas (bilan ancienne formule, ou terminée sans se prononcer).
        lastEffort: {
          $arrayElemAt: ['$sessionStats.lastEffort', 0],
        },
        // Depuis quand ce client est suivi par CE coach : sans une seule
        // séance terminée, c'est la seule mesure honnête de son inactivité.
        linkedAt: {
          $arrayElemAt: [
            {
              $map: {
                input: {
                  $filter: {
                    input: '$coaches',
                    as: 'link',
                    cond: { $eq: ['$$link.coachId', coach._id] },
                  },
                },
                as: 'link',
                in: '$$link.linkedAt',
              },
            },
            0,
          ],
        },
      },
    },
  ]);

  res.status(200).json(clients);
});

export const getClientDetails = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const clientId = req.params.id as string;

    const rawClient = await getAuthorizedClient(coach._id, clientId);
    const client = await rawClient.populate<{ userId: IUser }>('userId');

    const program = await getOrCreate(client._id);

    const rawSessions = await Session.find({ programId: program._id })
      .sort({ order: 1 })
      .populate('blocks.exercises.exerciseId')
      .lean();

    const sessions = (rawSessions as unknown as PopulatedSession[]).map(
      formatSession
    );

    const unseenCount = await CompletedSession.countDocuments({
      clientId: client._id,
      viewedByCoach: { $ne: true },
    });

    res.status(200).json({
      _id: client._id,
      firstName: client.userId.firstName,
      lastName: client.userId.lastName,
      email: client.userId.email,
      picture: client.userId.picture,
      program: {
        ...program.toObject(),
        sessions,
      },
      unseenCount,
    });
  }
);

export const getClientHistory = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const clientId = req.params.id as string;

    const client = await getAuthorizedClient(coach._id, clientId);

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);

    const history = await CompletedSession.find({ clientId: client._id })
      .sort({ completedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json(history);
  }
);

export const markHistoryAsViewed = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const clientId = req.params.id as string;

    await getAuthorizedClient(coach._id, clientId);

    await CompletedSession.updateMany(
      { clientId, viewedByCoach: { $ne: true } },
      { $set: { viewedByCoach: true } }
    );

    res.status(200).json({ status: 'success' });
  }
);
