/**
 * Ce que décide la liste des clients, sans base de données.
 *
 * L'agrégation reste éprouvée par l'usage ; ce qui est ici, c'est ce qu'elle
 * laissait à MongoDB et qui ne dépend pas de lui : quel lien de rattachement
 * lire, ce qu'est une absence, et les bornes d'une page d'historique.
 */
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Client, { type HealthConsent } from '../../models/Client';
import Program from '../../models/Program';
import Session from '../../models/Session';
import CompletedSession from '../../models/CompletedSession';
import { HEALTH_CONSENT_VERSION } from '../../shared/constants/consent';
import { clientDetailsPayload, clientRowPayload } from '../../contract';
import { clientsQuerySchema } from './roster.schema';
import {
  HISTORY_PAGE,
  RECENT_EFFORTS,
  defaultWeekStart,
  recentEfforts,
  sessionCount,
  weekTarget,
  RawClientRow,
  clientRow,
  clientRowsPipeline,
  clientDetails,
  historyWindow,
} from './roster.service';

// Des identifiants écrits plutôt qu'engendrés : deux décors identiques
// doivent l'être vraiment.
const JULIE = new Types.ObjectId('64b000000000000000000001');
const MARC = new Types.ObjectId('64b000000000000000000002');
const SARAH = new Types.ObjectId('64b0000000000000000000aa');

const row = (overrides: Partial<RawClientRow> = {}): RawClientRow => ({
  _id: SARAH,
  firstName: 'Sarah',
  lastName: 'Martin',
  coaches: [{ coachId: JULIE, linkedAt: new Date('2026-06-01T09:00:00Z') }],
  stats: [
    {
      lastCompletedAt: new Date('2026-09-20T07:00:00Z'),
      lastEffort: 4,
      unseen: 2,
    },
  ],
  ...overrides,
});

// Le lundi de la semaine du 16 novembre 2026, minuit à Paris.
const MONDAY = new Date('2026-11-15T23:00:00.000Z');

describe('la liste ne montre que les clients de ce coach', () => {
  // Tout le reste de l'agrégation est de la présentation ; cette étape est
  // une autorisation. Sans elle, chaque coach lirait tous les clients.
  it('la première étape borne la liste aux liens de ce coach', () => {
    expect(clientRowsPipeline(JULIE, MONDAY)[0]).toEqual({
      $match: { 'coaches.coachId': JULIE },
    });
  });
});

describe('le rattachement est celui de ce coach', () => {
  const twoCoaches = row({
    coaches: [
      { coachId: MARC, linkedAt: new Date('2025-01-10T09:00:00Z') },
      { coachId: JULIE, linkedAt: new Date('2026-06-01T09:00:00Z') },
    ],
  });

  it('suivi par deux coachs, chacun lit sa propre date', () => {
    expect(clientRow(twoCoaches, JULIE).linkedAt).toEqual(
      new Date('2026-06-01T09:00:00Z')
    );
    expect(clientRow(twoCoaches, MARC).linkedAt).toEqual(
      new Date('2025-01-10T09:00:00Z')
    );
  });

  // Un lien relu depuis la base porte un ObjectId, un coach tenu par la
  // session aussi, mais pas forcément la même instance : `===` les dirait
  // différents.
  it('deux instances du même identifiant désignent le même coach', () => {
    const same = new Types.ObjectId(JULIE.toHexString());
    expect(clientRow(twoCoaches, same).linkedAt).toEqual(
      new Date('2026-06-01T09:00:00Z')
    );
  });
});

describe('une absence reste une absence', () => {
  it('sans séance terminée : rien de lu, rien à dater', () => {
    const shaped = clientRow(row({ stats: [] }), JULIE);
    expect(shaped.unseenCount).toBe(0);
    expect(shaped.lastCompletedAt).toBeUndefined();
    expect(shaped.lastEffort).toBeUndefined();
  });

  // `$first` rend `null` pour un champ manquant : la dernière séance
  // terminée sans se prononcer.
  it('un ressenti que MongoDB rend nul devient absent', () => {
    const stats = [{ ...row().stats[0], lastEffort: null }];
    expect(clientRow(row({ stats }), JULIE).lastEffort).toBeUndefined();
  });

  // L'enjeu de la précédente : le contrat refuse `null`, et `respond`
  // aurait fait répondre 500 à toute la liste pour un seul client.
  it('la ligne passe le contrat', () => {
    const stats = [{ ...row().stats[0], lastEffort: null }];
    expect(
      clientRowPayload.safeParse(clientRow(row({ stats }), JULIE)).success
    ).toBe(true);
  });

  it('ce qui est là passe tel quel', () => {
    expect(clientRow(row(), JULIE)).toMatchObject({
      unseenCount: 2,
      lastEffort: 4,
      lastCompletedAt: new Date('2026-09-20T07:00:00Z'),
    });
  });
});

describe('une page d’historique a ses bornes', () => {
  it('sans rien demander : la première page, à la taille par défaut', () => {
    expect(historyWindow({})).toEqual({
      skip: 0,
      limit: HISTORY_PAGE.default,
    });
  });

  it('la page avance d’autant de séances qu’elle en rend', () => {
    expect(historyWindow({ page: '3', limit: '20' })).toEqual({
      skip: 40,
      limit: 20,
    });
  });

  it('demander plus que le plafond rend le plafond', () => {
    expect(historyWindow({ limit: '5000' }).limit).toBe(HISTORY_PAGE.max);
  });

  // MongoDB lit une limite négative comme « tant, puis ferme le curseur » :
  // rien ne devait l'atteindre.
  it('une limite nulle ou négative rend au moins une séance', () => {
    expect(historyWindow({ limit: '-5' }).limit).toBe(1);
    expect(historyWindow({ limit: '0' }).limit).toBe(1);
  });

  it('une page nulle, négative ou illisible est la première', () => {
    expect(historyWindow({ page: '0' }).skip).toBe(0);
    expect(historyWindow({ page: '-2' }).skip).toBe(0);
    expect(historyWindow({ page: 'deux' }).skip).toBe(0);
  });
});

/** L'étape `$lookup` qui range son résultat sous `as`. */
const lookupAs = (name: string) =>
  clientRowsPipeline(JULIE, MONDAY).find(
    (stage) =>
      '$lookup' in stage && (stage.$lookup as { as: string }).as === name
  ) as unknown as {
    $lookup: { pipeline: Record<string, Record<string, unknown>>[] };
  };

describe('la semaine de la ligne', () => {
  // Ce que l'agrégation compte : une séance faite depuis le début de la
  // semaine que l'écran a envoyée — son minuit, pas celui du serveur.
  it('compte depuis le début de semaine reçu', () => {
    const stats = lookupAs('stats');
    const group = stats.$lookup.pipeline.find((step) => '$group' in step);
    expect(group?.$group.weekDone).toEqual({
      $sum: { $cond: [{ $gte: ['$completedAt', MONDAY] }, 1, 0] },
    });
  });

  it('sans séance cette semaine : zéro, pas une absence', () => {
    expect(clientRow(row({ stats: [] }), JULIE).weekDone).toBe(0);
  });

  it('par défaut, le lundi à minuit UTC', () => {
    // Un mardi.
    expect(defaultWeekStart(new Date('2026-11-17T12:00:00Z'))).toEqual(
      new Date('2026-11-16T00:00:00Z')
    );
    // Un dimanche soir : encore la même semaine.
    expect(defaultWeekStart(new Date('2026-11-22T23:59:00Z'))).toEqual(
      new Date('2026-11-16T00:00:00Z')
    );
    // Le lundi à minuit est déjà la semaine qui commence.
    expect(defaultWeekStart(new Date('2026-11-16T00:00:00Z'))).toEqual(
      new Date('2026-11-16T00:00:00Z')
    );
  });

  it('la route lit un début de semaine avec son décalage', () => {
    const parsed = clientsQuerySchema.safeParse({
      query: { weekStart: '2026-11-16T00:00:00+01:00' },
    });
    expect(parsed.data?.query.weekStart).toEqual(MONDAY);
  });

  it('une date illisible est refusée, une absente laisse le défaut', () => {
    expect(
      clientsQuerySchema.safeParse({ query: { weekStart: 'lundi' } }).success
    ).toBe(false);
    expect(
      clientsQuerySchema.safeParse({ query: {} }).data?.query.weekStart
    ).toBeUndefined();
  });
});

describe('l’objectif de la semaine', () => {
  const program = (...days: (number[] | undefined)[]) => [
    { sessions: days.map((suggestedDays) => ({ suggestedDays })) },
  ];

  // La règle de l'accueil du client : deux séances le lundi se font l'une
  // ou l'autre ce jour-là.
  it('les jours conseillés distincts du programme', () => {
    expect(weekTarget(program([0, 3], [0], [5]))).toBe(3);
  });

  it('sans jour conseillé, ou sans programme : zéro', () => {
    expect(weekTarget(program(undefined, []))).toBe(0);
    expect(weekTarget([])).toBe(0);
    expect(weekTarget(undefined)).toBe(0);
  });

  it('le nombre de séances dit si le programme est à écrire', () => {
    expect(sessionCount(program([0], undefined))).toBe(2);
    expect(sessionCount([])).toBe(0);
  });

  it('la ligne porte l’un et l’autre', () => {
    const shaped = clientRow(row({ programs: program([1], [1, 4]) }), JULIE);
    expect(shaped.weekTarget).toBe(2);
    expect(shaped.sessionCount).toBe(2);
  });
});

describe('les derniers ressentis', () => {
  // L'agrégation les rend du plus récent au plus ancien ; les points se
  // lisent de gauche à droite.
  it('du plus ancien au plus récent', () => {
    expect(
      recentEfforts([{ effort: 5 }, { effort: 4 }, { effort: 2 }])
    ).toEqual([2, 4, 5]);
  });

  it('ce qui n’est pas un ressenti ne prend pas de place', () => {
    expect(recentEfforts([{ effort: 3 }, { effort: null }, {}])).toEqual([3]);
  });

  it('aucun : une liste vide', () => {
    expect(recentEfforts(undefined)).toEqual([]);
  });

  // Le tri, le plafond et le filtre vivent dans la requête : la ligne n'en
  // reçoit jamais plus de cinq, les plus récents, tous des ressentis.
  it('la requête prend les cinq derniers qui en sont', () => {
    const efforts = lookupAs('efforts');
    const [match, sort, limit] = efforts.$lookup.pipeline;
    expect(match).toEqual({
      $match: {
        $expr: { $eq: ['$clientId', '$$clientId'] },
        'feedback.effort': { $type: 'number' },
      },
    });
    expect(sort).toEqual({ $sort: { completedAt: -1 } });
    expect(limit).toEqual({ $limit: RECENT_EFFORTS });
    expect(RECENT_EFFORTS).toBe(5);
  });

  it('la ligne complète passe le contrat', () => {
    const shaped = clientRow(
      row({ efforts: [{ effort: 4 }], programs: [] }),
      JULIE
    );
    expect(clientRowPayload.safeParse(shaped).success).toBe(true);
  });
});

describe('la fiche dit si le client partage ses données de santé', () => {
  afterEach(() => vi.restoreAllMocks());

  // Les lectures sont remplacées par ce qu'elles rendraient : c'est le
  // service entier qui tourne, du lien de rattachement à la réponse.
  const detailsFor = async (healthConsent?: HealthConsent) => {
    const client = { _id: SARAH, healthConsent };
    vi.spyOn(Client, 'findOne').mockResolvedValue({
      ...client,
      populate: async () => ({
        ...client,
        userId: { firstName: 'Sarah', email: 'sarah@example.com' },
      }),
    } as never);
    vi.spyOn(Program, 'findOneAndUpdate').mockResolvedValue({
      toObject: () => ({
        _id: SARAH,
        createdAt: new Date('2026-06-01T09:00:00Z'),
        updatedAt: new Date('2026-06-01T09:00:00Z'),
      }),
    } as never);
    vi.spyOn(Session, 'find').mockReturnValue({
      sort: () => ({ populate: () => ({ lean: async () => [] }) }),
    } as never);
    vi.spyOn(CompletedSession, 'countDocuments').mockResolvedValue(0 as never);
    return clientDetails(JULIE, SARAH.toHexString());
  };
  const decided = (granted: boolean, version = HEALTH_CONSENT_VERSION) => ({
    granted,
    version,
    decidedAt: new Date('2026-09-02T08:00:00Z'),
  });

  it('un accord au texte en vigueur : il partage', async () => {
    const details = await detailsFor(decided(true));
    expect(details.sharesHealthData).toBe(true);
    expect(clientDetailsPayload.safeParse(details).success).toBe(true);
  });

  // Le cas que l'écran doit dire : ses ressentis n'ont ni étiquette ni mot,
  // et ce n'est pas lui qui se tait.
  it('un refus, ou jamais de réponse : il ne partage pas', async () => {
    expect((await detailsFor(decided(false))).sharesHealthData).toBe(false);
    expect((await detailsFor(undefined)).sharesHealthData).toBe(false);
  });

  // La même règle qu'à l'écriture : un accord à un ancien texte ne vaut
  // plus, et le serveur ne garde déjà plus ce qu'il écrit.
  it('un accord à un ancien texte ne vaut plus', async () => {
    const details = await detailsFor(decided(true, '2025-01'));
    expect(details.sharesHealthData).toBe(false);
  });
});
