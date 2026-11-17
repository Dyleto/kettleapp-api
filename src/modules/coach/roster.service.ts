import { Types, PipelineStage } from 'mongoose';
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
 * Ce que l'agrégation rend pour un client, avant mise en forme.
 *
 * Les liens et les statistiques restent bruts : choisir le lien de CE coach
 * et décider de ce qu'est une absence se fait en JavaScript, où cela se
 * teste sans base — le reste de la liste en dépendra (D6 y ajoute la
 * semaine et les cinq derniers ressentis).
 */
export interface RawClientRow {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  picture?: string;
  coaches: { coachId: Types.ObjectId | string; linkedAt: Date }[];
  stats: {
    lastCompletedAt?: Date | null;
    lastEffort?: number | null;
    unseen?: number;
  }[];
}

/**
 * La requête de la liste, en une seule agrégation.
 *
 * Une requête par client se paierait à chaque passage dans l'espace coach :
 * une centaine pour une vingtaine de clients. Exportée pour qu'un test tienne
 * sa première étape — c'est elle qui borne la liste aux clients de ce coach,
 * et sans elle chaque coach verrait tous les clients de Kettle.
 */
export const clientRowsPipeline = (
  coachId: Types.ObjectId
): PipelineStage[] => [
  { $match: { 'coaches.coachId': coachId } },
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
              $sum: { $cond: [{ $ne: ['$viewedByCoach', true] }, 1, 0] },
            },
          },
        },
      ],
      as: 'stats',
    },
  },
  {
    $project: {
      _id: 1,
      firstName: '$userDoc.firstName',
      lastName: '$userDoc.lastName',
      picture: '$userDoc.picture',
      coaches: 1,
      stats: 1,
    },
  },
];

/**
 * Une ligne de la liste, telle que le contrat l'attend.
 *
 * Deux décisions vivaient dans l'agrégation, où rien ne les éprouvait :
 *
 *   — Le lien est celui de CE coach. Un client suivi par deux coachs porte
 *     deux dates de rattachement, et prendre la première venue dirait à l'un
 *     depuis quand l'autre le suit. Sans séance terminée, c'est la seule
 *     mesure honnête de l'inactivité d'un client.
 *
 *   — Une absence est une absence. `$first` sur un champ manquant rend
 *     `null` (comportement documenté de MongoDB), et le contrat refuse
 *     `null` pour un ressenti : la dernière séance terminée sans se
 *     prononcer aurait fait répondre 500 à toute la liste.
 */
export const clientRow = (raw: RawClientRow, coachId: Types.ObjectId) => {
  const stats = raw.stats[0];
  const link = raw.coaches.find(
    (candidate) => String(candidate.coachId) === String(coachId)
  );
  return {
    _id: raw._id,
    firstName: raw.firstName,
    lastName: raw.lastName,
    picture: raw.picture,
    unseenCount: stats?.unseen ?? 0,
    lastCompletedAt: stats?.lastCompletedAt ?? undefined,
    lastEffort:
      typeof stats?.lastEffort === 'number' ? stats.lastEffort : undefined,
    linkedAt: link?.linkedAt,
  };
};

/**
 * La liste des clients d'un coach, avec de quoi la trier.
 *
 * Les bilans non lus et la date de la dernière séance ne sont pas
 * décoratifs : ce sont eux qui classent par « à traiter ». Sans eux, le
 * coach ouvre chaque fiche pour savoir laquelle demande son attention — le
 * travail qu'on veut lui éviter.
 */
export const listClients = async (coachId: Types.ObjectId) => {
  const rows = await Client.aggregate<RawClientRow>(
    clientRowsPipeline(coachId)
  );
  return rows.map((row) => clientRow(row, coachId));
};

/** Ce qu'une page d'historique saute, et ce qu'elle rend au plus. */
export const HISTORY_PAGE = { default: 50, max: 200 } as const;

/**
 * La fenêtre d'une page d'historique, depuis ce que l'appelant a demandé.
 *
 * Le plafond vit ici, le client n'ayant aucune raison d'être poli : un
 * client qui s'entraîne depuis deux ans a des centaines de bilans, chacun
 * portant l'instantané complet de sa séance, et une seule requête en
 * ramènerait plusieurs mégaoctets.
 *
 * Le plancher aussi. Le contrôleur écrivait `Math.min(limit, 200)` sans
 * borne basse : `?limit=-5` partait chez MongoDB, qui lit une limite
 * négative comme « cinq, puis ferme le curseur ».
 */
export const historyWindow = (query: { page?: unknown; limit?: unknown }) => {
  const asked = parseInt(String(query.limit), 10);
  const limit = Number.isNaN(asked)
    ? HISTORY_PAGE.default
    : Math.min(Math.max(asked, 1), HISTORY_PAGE.max);
  const page = Math.max(parseInt(String(query.page), 10) || 1, 1);
  return { skip: (page - 1) * limit, limit };
};

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
export const clientDetails = async (
  coachId: Types.ObjectId,
  clientId: string
) => {
  const rawClient = await getAuthorizedClient(coachId, clientId);
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

  return {
    _id: client._id,
    firstName: client.userId.firstName,
    lastName: client.userId.lastName,
    email: client.userId.email,
    picture: client.userId.picture,
    program: { ...program.toObject(), sessions },
    unseenCount,
  };
};

/**
 * Les séances déjà faites par un client, de la plus récente à la plus
 * ancienne, une page à la fois — voir `historyWindow` pour ses bornes.
 */
export const clientHistory = async (
  coachId: Types.ObjectId,
  clientId: string,
  query: { page?: unknown; limit?: unknown }
) => {
  const client = await getAuthorizedClient(coachId, clientId);
  const { skip, limit } = historyWindow(query);
  return CompletedSession.find({ clientId: client._id })
    .sort({ completedAt: -1 })
    .skip(skip)
    .limit(limit);
};

/**
 * Marquer comme lus les bilans d'un client.
 *
 * L'autorisation est demandée pour son effet, pas pour sa valeur : sans le
 * `getAuthorizedClient`, connaître un identifiant suffirait à éteindre les
 * pastilles d'un coach qui n'est pas soi. C'est le genre d'appel dont
 * l'innocuité apparente fait oublier qu'il écrit.
 */
export const markHistoryViewed = async (
  coachId: Types.ObjectId,
  clientId: string
): Promise<void> => {
  const client = await getAuthorizedClient(coachId, clientId);
  await CompletedSession.updateMany(
    { clientId: client._id, viewedByCoach: { $ne: true } },
    { $set: { viewedByCoach: true } }
  );
};
