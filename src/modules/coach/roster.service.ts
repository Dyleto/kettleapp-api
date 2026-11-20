import { Types, PipelineStage } from 'mongoose';
import Client from '../../models/Client';
import { IUser } from '../../models/User';
import Session from '../../models/Session';
import CompletedSession from '../../models/CompletedSession';
import { getAuthorizedClient } from './coach.service';
import { getOrCreate } from '../program/program.service';
import { sharingAllowed } from '../client/healthConsent.service';
import {
  PopulatedSession,
  formatSession,
} from '../../shared/utils/sessionFormatter';

/**
 * Ce que l'agrégation rend pour un client, avant mise en forme.
 *
 * Les liens, les statistiques, les programmes et les ressentis restent
 * bruts : choisir le lien de CE coach, décider de ce qu'est une absence,
 * compter les jours conseillés se fait en JavaScript, où cela se teste sans
 * base.
 */
export interface RawClientRow {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  picture?: string;
  coaches: {
    coachId: Types.ObjectId | string;
    linkedAt: Date;
    tagIds?: Types.ObjectId[];
  }[];
  stats: {
    lastCompletedAt?: Date | null;
    lastEffort?: number | null;
    unseen?: number;
    weekDone?: number;
  }[];
  /** Le programme du client — un seul, mais `$lookup` rend une liste. */
  programs?: { sessions: { suggestedDays?: number[] | null }[] }[];
  /** Les derniers ressentis, du plus récent au plus ancien. */
  efforts?: { effort?: number | null }[];
}

/** Combien de ressentis la ligne montre : la maquette en dessine cinq. */
export const RECENT_EFFORTS = 5;

/**
 * Le lundi de la semaine de `now`, à minuit UTC.
 *
 * Le défaut seulement. La semaine d'un coach commence à son minuit à lui, et
 * le serveur n'en connaît pas le fuseau : l'écran envoie le sien
 * (`?weekStart=`), et compte ainsi comme l'accueil du client compte, sans
 * qu'une séance faite le dimanche à 23 h à Paris tombe dans la semaine
 * suivante.
 */
export const defaultWeekStart = (now: Date): Date => {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day;
};

/**
 * La requête de la liste, en une seule agrégation.
 *
 * Une requête par client se paierait à chaque passage dans l'espace coach :
 * une centaine pour une vingtaine de clients. Exportée pour qu'un test tienne
 * sa première étape — c'est elle qui borne la liste aux clients de ce coach,
 * et sans elle chaque coach verrait tous les clients de Kettle.
 */
export const clientRowsPipeline = (
  coachId: Types.ObjectId,
  weekStart: Date
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
            // L'anneau de la ligne : les séances de la semaine, comptées
            // dans le même passage.
            weekDone: {
              $sum: { $cond: [{ $gte: ['$completedAt', weekStart] }, 1, 0] },
            },
          },
        },
      ],
      as: 'stats',
    },
  },
  {
    // Les cinq derniers ressentis. Une recherche à part plutôt qu'un
    // `$push` dans le groupe : celui-ci empilerait tout l'historique du
    // client pour n'en garder que cinq. Une séance sans ressenti n'en est
    // pas un — un vieux bilan à cinq axes, une séance terminée sans se
    // prononcer — et ne prend pas de place.
    $lookup: {
      from: 'completedsessions',
      let: { clientId: '$_id' },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ['$clientId', '$$clientId'] },
            'feedback.effort': { $type: 'number' },
          },
        },
        { $sort: { completedAt: -1 } },
        { $limit: RECENT_EFFORTS },
        { $project: { _id: 0, effort: '$feedback.effort' } },
      ],
      as: 'efforts',
    },
  },
  {
    // Les jours conseillés du programme : l'objectif de la semaine. Les
    // séances seules, réduites à leurs jours — tout le reste est lourd.
    $lookup: {
      from: 'programs',
      let: { clientId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$clientId', '$$clientId'] } } },
        {
          $lookup: {
            from: 'sessions',
            let: { programId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$programId', '$$programId'] } } },
              { $project: { _id: 0, suggestedDays: 1 } },
            ],
            as: 'sessions',
          },
        },
        { $project: { _id: 0, sessions: 1 } },
      ],
      as: 'programs',
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
      efforts: 1,
      programs: 1,
    },
  },
];

/**
 * L'objectif de la semaine : les jours conseillés distincts du programme.
 *
 * La règle de l'accueil du client (`weekTarget` côté front), pour que
 * l'anneau du coach et celui du client disent la même chose : deux séances
 * conseillées le lundi se font l'une ou l'autre ce jour-là. Zéro sans jour
 * conseillé, ou sans programme — l'écran affiche alors un tiret.
 */
export const weekTarget = (programs: RawClientRow['programs']): number =>
  new Set(
    (programs ?? []).flatMap((program) =>
      program.sessions.flatMap((session) => session.suggestedDays ?? [])
    )
  ).size;

/** Combien de séances le programme compte : zéro, c'est « programme à
 * écrire ». */
export const sessionCount = (programs: RawClientRow['programs']): number =>
  (programs ?? []).reduce((sum, program) => sum + program.sessions.length, 0);

/**
 * Les derniers ressentis, du plus ancien au plus récent — l'ordre de
 * lecture des points, la tendance se lit de gauche à droite.
 */
export const recentEfforts = (efforts: RawClientRow['efforts']): number[] =>
  (efforts ?? [])
    .map((entry) => entry.effort)
    .filter((effort): effort is number => typeof effort === 'number')
    .reverse();

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
    // Les siennes seulement : le lien est celui de CE coach.
    tagIds: link?.tagIds ?? [],
    weekDone: stats?.weekDone ?? 0,
    weekTarget: weekTarget(raw.programs),
    sessionCount: sessionCount(raw.programs),
    recentEfforts: recentEfforts(raw.efforts),
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
export const listClients = async (
  coachId: Types.ObjectId,
  weekStart: Date = defaultWeekStart(new Date())
) => {
  const rows = await Client.aggregate<RawClientRow>(
    clientRowsPipeline(coachId, weekStart)
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
 *
 * `sharesHealthData` dit pourquoi un ressenti n'a ni étiquette ni mot. Sans
 * lui, l'écran des ressentis ne distinguait pas un client qui n'écrit rien
 * d'un client dont on n'a pas le droit de garder ce qu'il écrit — et le
 * coach relançait le second pour un silence que le serveur avait imposé.
 * C'est la même règle que celle qui filtre à l'écriture, pas une copie.
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
    sharesHealthData: sharingAllowed(client),
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
