import { PipelineStage, Types } from 'mongoose';
import Client from '../../models/Client';
import CompletedSession from '../../models/CompletedSession';
import type { IUser } from '../../models/User';

/**
 * Combien de cartes le fil rend au plus.
 *
 * Chaque carte porte deux instantanés de séance — la séance et le passage
 * d'avant —, quelques kilo-octets chacun. Un coach de vingt clients revenu
 * de trois semaines en aurait plus de deux cents à lire ; cent suffisent à
 * le remettre à flot, et `total` lui dit qu'il en reste.
 */
export const INBOX_MAX = 100;

/** Jusqu'où « Déjà lues » remonte : trente jours, comme la maquette. */
export const READ_WINDOW_DAYS = 30;

/** Ce qu'un appel à « marquer lu » touche au plus : un client replié, ou un
 * « tout lire » — pas l'historique entier d'un coach. */
export const VIEWED_MAX = 200;

export type InboxState = 'unread' | 'read';

/**
 * Quelles séances entrent dans le fil.
 *
 * `clientId` est la borne de sécurité : sans elle, le fil d'un coach
 * mêlerait les séances de tous les clients de Kettle. `$ne: true` et non
 * `false`, pour qu'un bilan sans le champ compte comme non lu — c'est déjà
 * ainsi que la liste des clients les compte.
 */
export const inboxFilter = (
  state: InboxState,
  clientIds: readonly Types.ObjectId[],
  now: Date
) =>
  state === 'unread'
    ? { clientId: { $in: clientIds }, viewedByCoach: { $ne: true } }
    : {
        clientId: { $in: clientIds },
        viewedByCoach: true,
        completedAt: {
          $gte: new Date(now.getTime() - READ_WINDOW_DAYS * 86_400_000),
        },
      };

/**
 * Les séances du fil, chacune avec son passage d'avant.
 *
 * Une agrégation plutôt qu'une requête par carte : cent cartes, c'était cent
 * allers-retours. Le passage d'avant est la même séance (`originalSessionId`)
 * du même client, la plus récente avant celle-ci — pas la séance précédente
 * tout court : comparer un « Full body A » à un « Haut du corps » ne dirait
 * rien des charges.
 *
 * Les plus récentes d'abord. L'ordre de lecture — « Trop dure » et
 * « Douleur » en premier, les séances sans rien à signaler repliées — est
 * un choix d'écran, qui se fait sur ce que rend cette requête.
 */
export const inboxPipeline = (
  filter: ReturnType<typeof inboxFilter>
): PipelineStage[] => [
  { $match: filter },
  { $sort: { completedAt: -1 } },
  { $limit: INBOX_MAX },
  {
    $lookup: {
      from: 'completedsessions',
      let: {
        clientId: '$clientId',
        sessionId: '$originalSessionId',
        at: '$completedAt',
      },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$clientId', '$$clientId'] },
                { $eq: ['$originalSessionId', '$$sessionId'] },
                { $lt: ['$completedAt', '$$at'] },
              ],
            },
          },
        },
        { $sort: { completedAt: -1 } },
        { $limit: 1 },
      ],
      as: 'previous',
    },
  },
];

/** Ce que l'agrégation rend pour une carte, avant mise en forme. */
export interface RawInboxRow {
  clientId: Types.ObjectId;
  previous: unknown[];
  [field: string]: unknown;
}

/** Un client du coach, son compte peuplé — ou plus rien quand ce compte a
 * disparu. */
export interface LinkedClient {
  _id: Types.ObjectId;
  userId?: Pick<IUser, 'firstName' | 'lastName' | 'picture'> | null;
}

/**
 * Une carte, telle que le contrat l'attend.
 *
 * Le nom vient de la liste des clients déjà chargée pour borner la requête :
 * le chercher dans l'agrégation aurait été un `$lookup` de plus pour une
 * donnée qu'on tient. Un compte disparu laisse un client sans nom — la
 * maquette écrit alors « Client sans nom », et c'est à l'écran de le dire.
 */
export const inboxItem = (
  row: RawInboxRow,
  clients: ReadonlyMap<string, LinkedClient>
) => {
  const { previous, ...completed } = row;
  const user = clients.get(String(row.clientId))?.userId ?? undefined;
  return {
    client: {
      _id: row.clientId,
      firstName: user?.firstName,
      lastName: user?.lastName,
      picture: user?.picture,
    },
    completed,
    previous: previous[0],
  };
};

/** Les clients de ce coach, de quoi les nommer. */
const clientsOf = async (coachId: Types.ObjectId) => {
  const clients = await Client.find({ 'coaches.coachId': coachId })
    .select('_id userId')
    .populate<{
      userId: LinkedClient['userId'];
    }>('userId', 'firstName lastName picture')
    .lean();
  return new Map(clients.map((client) => [String(client._id), client]));
};

/**
 * Le fil « À lire », ou « Déjà lues ».
 *
 * Remplace l'ouverture du journal client par client : le coach lisait
 * « 3 séances à lire » dans la liste, puis ouvrait chaque fiche.
 */
export const inbox = async (
  coachId: Types.ObjectId,
  state: InboxState,
  now: Date = new Date()
) => {
  const clients = await clientsOf(coachId);
  const ids = [...clients.values()].map((client) => client._id);
  const filter = inboxFilter(state, ids, now);

  const [total, rows] = await Promise.all([
    CompletedSession.countDocuments(filter),
    CompletedSession.aggregate<RawInboxRow>(inboxPipeline(filter)),
  ]);
  return { total, items: rows.map((row) => inboxItem(row, clients)) };
};

/**
 * Marquer lues — ou non lues — des séances, une ou plusieurs à la fois.
 *
 * Remplace, pour le fil, « tout l'historique d'un client marqué lu d'un
 * coup » : le coach lit séance par séance. Plusieurs à la fois pour une
 * carte repliée, qui en tient plusieurs. Et dans les deux sens, parce que
 * glisser une carte affiche « Annuler » huit secondes : retarder l'envoi
 * jusque-là perdrait la lecture si l'écran se ferme entre-temps.
 *
 * Les séances d'un client qui n'est pas suivi par ce coach ne sont pas
 * touchées, et ne comptent pas.
 */
export const markViewed = async (
  coachId: Types.ObjectId,
  completedIds: readonly string[],
  viewed: boolean
) => {
  const clientIds = await Client.find({
    'coaches.coachId': coachId,
  }).distinct('_id');
  const result = await CompletedSession.updateMany(
    { _id: { $in: completedIds }, clientId: { $in: clientIds } },
    { $set: { viewedByCoach: viewed } }
  );
  return { count: result.matchedCount };
};
