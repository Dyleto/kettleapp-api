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

/**
 * La liste des clients d'un coach, avec de quoi la trier.
 *
 * Tout se fait en une agrégation plutôt qu'en une requête par client : la
 * liste s'ouvre à chaque passage dans l'espace coach, et une centaine de
 * requêtes pour une vingtaine de clients se paierait à chaque fois.
 *
 * Ce que chaque ligne porte n'est pas décoratif. Les bilans non lus et la date
 * de la dernière séance sont ce qui permet de classer par « à traiter » — sans
 * eux, le coach doit ouvrir chaque fiche pour savoir laquelle demande son
 * attention, ce qui est précisément le travail qu'on veut lui éviter.
 */
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

/**
 * Tout ce qu'il faut pour ouvrir l'atelier d'un client.
 *
 * Le programme est créé s'il n'existe pas : un client sans programme et un
 * programme vide sont la même chose pour un coach, et faire remonter la
 * différence obligerait l'écran à traiter un cas qui ne veut rien dire.
 *
 * `unseenCount` voyage avec le reste plutôt que par un appel séparé — c'est
 * l'information qui décide si la pastille du journal s'allume, et la demander
 * à part ferait clignoter cette pastille à chaque ouverture.
 */
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

/**
 * Les séances déjà faites par un client, de la plus récente à la plus ancienne.
 *
 * La pagination est plafonnée à 200 même si l'appelant demande plus : un
 * client qui s'entraîne depuis deux ans a des centaines de bilans, chacun
 * portant l'instantané complet de sa séance. Sans plafond, une seule requête
 * ramènerait plusieurs mégaoctets — et le plafond doit vivre ici, le client
 * n'ayant aucune raison d'être poli.
 */
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

/**
 * Marquer comme lus les bilans d'un client.
 *
 * L'autorisation est demandée pour son effet, pas pour sa valeur : sans le
 * `getAuthorizedClient`, connaître un identifiant suffirait à éteindre les
 * pastilles d'un coach qui n'est pas soi. C'est le genre d'appel dont
 * l'innocuité apparente fait oublier qu'il écrit.
 */
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
