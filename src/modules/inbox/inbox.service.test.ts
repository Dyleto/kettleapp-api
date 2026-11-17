/**
 * Ce que décide le fil « À lire », sans base de données.
 *
 * L'agrégation ne s'éprouve pas sans MongoDB ; ce qui est ici, c'est ce
 * qu'elle reçoit et ce qu'on fait de ce qu'elle rend : quelles séances entrent
 * dans le fil, quel passage compte comme « d'avant », comment une carte se
 * nomme, et qui a le droit de marquer quoi.
 */
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Client from '../../models/Client';
import CompletedSession from '../../models/CompletedSession';
import { inboxItemPayload } from '../../contract';
import {
  INBOX_MAX,
  LinkedClient,
  RawInboxRow,
  inbox,
  inboxFilter,
  inboxItem,
  inboxPipeline,
  markViewed,
} from './inbox.service';
import { inboxQuerySchema, markViewedSchema } from './inbox.schema';

// Des identifiants et des dates écrits, pas engendrés.
const COACH = new Types.ObjectId('64d000000000000000000001');
const SARAH = new Types.ObjectId('64d0000000000000000000a1');
const JULIEN = new Types.ObjectId('64d0000000000000000000a2');
const NOW = new Date('2026-11-17T12:00:00.000Z');

const completedRow = (fields: Partial<RawInboxRow> = {}): RawInboxRow => ({
  _id: new Types.ObjectId('64d0000000000000000000b1'),
  clientId: SARAH,
  programId: new Types.ObjectId('64d0000000000000000000c1'),
  originalSessionId: new Types.ObjectId('64d0000000000000000000d1'),
  sessionOrder: 1,
  sessionName: 'Full body A',
  blocks: [],
  feedback: { effort: 5 },
  clientNotes: 'Dur sur la fin.',
  viewedByCoach: false,
  completedAt: new Date('2026-11-16T18:00:00.000Z'),
  previous: [],
  ...fields,
});

const linked = (
  id: Types.ObjectId,
  user: LinkedClient['userId']
): [string, LinkedClient] => [String(id), { _id: id, userId: user }];

describe('quelles séances entrent dans le fil', () => {
  it('à lire : celles de ses clients que le coach n’a pas lues', () => {
    expect(inboxFilter('unread', [SARAH, JULIEN], NOW)).toEqual({
      clientId: { $in: [SARAH, JULIEN] },
      viewedByCoach: { $ne: true },
    });
  });

  it('déjà lues : celles de ses clients, sur les trente derniers jours', () => {
    expect(inboxFilter('read', [SARAH], NOW)).toEqual({
      clientId: { $in: [SARAH] },
      viewedByCoach: true,
      completedAt: { $gte: new Date('2026-10-18T12:00:00.000Z') },
    });
  });
});

describe('ce que l’agrégation demande', () => {
  const pipeline = inboxPipeline(inboxFilter('unread', [SARAH], NOW));

  // L'étape qui borne le fil aux clients de ce coach vient en premier : tout
  // ce qui suit ne voit que ce qu'elle a laissé passer.
  it('la première étape est le filtre, tel quel', () => {
    expect(pipeline[0]).toEqual({
      $match: inboxFilter('unread', [SARAH], NOW),
    });
  });

  it('les plus récentes d’abord, et pas plus que le plafond', () => {
    expect(pipeline[1]).toEqual({ $sort: { completedAt: -1 } });
    expect(pipeline[2]).toEqual({ $limit: INBOX_MAX });
  });

  // Le passage d'avant : même client, même séance, strictement avant — et
  // le plus récent d'entre eux.
  it('le passage d’avant est la même séance du même client, juste avant', () => {
    const lookup = (pipeline[3] as { $lookup: Record<string, unknown> })
      .$lookup;
    const [match, sort, limit] = lookup.pipeline as Record<string, unknown>[];
    expect(match).toEqual({
      $match: {
        $expr: {
          $and: [
            { $eq: ['$clientId', '$$clientId'] },
            { $eq: ['$originalSessionId', '$$sessionId'] },
            { $lt: ['$completedAt', '$$at'] },
          ],
        },
      },
    });
    expect(sort).toEqual({ $sort: { completedAt: -1 } });
    expect(limit).toEqual({ $limit: 1 });
    expect(lookup.let).toEqual({
      clientId: '$clientId',
      sessionId: '$originalSessionId',
      at: '$completedAt',
    });
  });
});

describe('une carte', () => {
  const clients = new Map([
    linked(SARAH, { firstName: 'Sarah', lastName: 'Martin' }),
    linked(JULIEN, null),
  ]);

  it('porte le nom de son client, pris dans la liste du coach', () => {
    expect(inboxItem(completedRow(), clients).client).toEqual({
      _id: SARAH,
      firstName: 'Sarah',
      lastName: 'Martin',
      picture: undefined,
    });
  });

  // Un compte supprimé : la carte reste, sans nom. L'écran écrit « Client
  // sans nom ».
  it('un client dont le compte a disparu reste, sans nom', () => {
    const item = inboxItem(completedRow({ clientId: JULIEN }), clients);
    expect(item.client._id).toEqual(JULIEN);
    expect(item.client.firstName).toBeUndefined();
  });

  it('le passage d’avant est le premier trouvé, ou rien', () => {
    const before = completedRow({ completedAt: new Date('2026-11-10') });
    expect(
      inboxItem(completedRow({ previous: [before] }), clients).previous
    ).toBe(before);
    expect(inboxItem(completedRow(), clients).previous).toBeUndefined();
  });

  // `previous` est un champ de l'agrégation, pas de la séance.
  it('la séance ne garde pas la trace de l’agrégation', () => {
    expect(inboxItem(completedRow(), clients).completed).not.toHaveProperty(
      'previous'
    );
  });

  it('la carte passe le contrat, sans les clés internes de la séance', () => {
    const parsed = inboxItemPayload.parse(
      inboxItem(completedRow({ previous: [completedRow()] }), clients)
    );
    expect(parsed.completed).not.toHaveProperty('clientId');
    expect(parsed.completed).not.toHaveProperty('programId');
    expect(parsed.completed.replies).toEqual([]);
    expect(parsed.previous?.sessionName).toBe('Full body A');
  });
});

describe('ce que les routes acceptent', () => {
  const query = (q: unknown) => inboxQuerySchema.safeParse({ query: q });
  const body = (b: unknown) => markViewedSchema.safeParse({ body: b });

  it('sans précision, le fil est celui des séances à lire', () => {
    expect(query({}).data?.query.state).toBe('unread');
  });

  // Ramener une valeur inconnue au défaut afficherait l'un pour l'autre.
  it('un état inconnu est refusé, pas ramené au défaut', () => {
    expect(query({ state: 'lu' }).success).toBe(false);
  });

  it('marquer : au moins une séance, des identifiants valides, un état', () => {
    expect(
      body({ ids: ['64d0000000000000000000b1'], viewed: true }).success
    ).toBe(true);
    expect(body({ ids: [], viewed: true }).success).toBe(false);
    expect(body({ ids: ['pas-un-id'], viewed: true }).success).toBe(false);
    expect(body({ ids: ['64d0000000000000000000b1'] }).success).toBe(false);
  });

  it('pas plus de deux cents à la fois', () => {
    const ids = Array.from({ length: 201 }, () => '64d0000000000000000000b1');
    expect(body({ ids, viewed: true }).success).toBe(false);
  });
});

/**
 * Autour des requêtes : les lectures remplacées par ce qu'elles rendraient.
 * Ce qui est éprouvé, c'est ce que la fonction demande et ce qu'elle fait de
 * la réponse — pas MongoDB.
 */
describe('autour des requêtes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('le fil est borné aux clients de ce coach, et compte au-delà du plafond', async () => {
    const find = vi.spyOn(Client, 'find').mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => [{ _id: SARAH, userId: { firstName: 'Sarah' } }],
        }),
      }),
    } as never);
    const count = vi
      .spyOn(CompletedSession, 'countDocuments')
      .mockResolvedValue(240 as never);
    const aggregate = vi
      .spyOn(CompletedSession, 'aggregate')
      .mockResolvedValue([completedRow()] as never);

    const result = await inbox(COACH, 'unread', NOW);

    expect(find).toHaveBeenCalledWith({ 'coaches.coachId': COACH });
    const filter = inboxFilter('unread', [SARAH], NOW);
    expect(count).toHaveBeenCalledWith(filter);
    expect(aggregate).toHaveBeenCalledWith(inboxPipeline(filter));
    expect(result.total).toBe(240);
    expect(result.items[0].client.firstName).toBe('Sarah');
  });

  // Les séances d'un client d'un autre coach ne sont ni touchées ni
  // comptées : le filtre porte les clients de celui-ci.
  it('marquer ne touche que les séances de ses clients', async () => {
    vi.spyOn(Client, 'find').mockReturnValue({
      distinct: async () => [SARAH],
    } as never);
    const update = vi
      .spyOn(CompletedSession, 'updateMany')
      .mockResolvedValue({ matchedCount: 1 } as never);

    const ids = ['64d0000000000000000000b1', '64d0000000000000000000b2'];
    expect(await markViewed(COACH, ids, true)).toEqual({ count: 1 });
    expect(Client.find).toHaveBeenCalledWith({ 'coaches.coachId': COACH });
    expect(update).toHaveBeenCalledWith(
      { _id: { $in: ids }, clientId: { $in: [SARAH] } },
      { $set: { viewedByCoach: true } }
    );
  });

  // « Annuler » : la même route, dans l'autre sens.
  it('« Annuler » remet la séance à lire', async () => {
    vi.spyOn(Client, 'find').mockReturnValue({
      distinct: async () => [SARAH],
    } as never);
    const update = vi
      .spyOn(CompletedSession, 'updateMany')
      .mockResolvedValue({ matchedCount: 1 } as never);
    await markViewed(COACH, ['64d0000000000000000000b1'], false);
    expect(update.mock.calls[0][1]).toEqual({
      $set: { viewedByCoach: false },
    });
  });
});
