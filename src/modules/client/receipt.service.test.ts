/**
 * Un bilan reçu deux fois ne compte qu'une — sans base de données.
 *
 * Les lectures et l'écriture sont remplacées par ce qu'elles rendraient ;
 * ce qui est éprouvé, c'est ce que le serveur fait d'un renvoi : le
 * reconnaître, ne rien créer, et le dire à l'appareil comme un envoi réussi.
 */
import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import CompletedSession from '../../models/CompletedSession';
import Program from '../../models/Program';
import { completedSessionPayload } from '../../contract';
import { globalErrorHandler } from '../../shared/middleware/errorHandler';
import logger from '../../shared/utils/logger';
import { completeSession } from './client.controller';
import { completeSessionSchema } from './client.schema';
import { alreadyReceived, recordOnce } from './receipt.service';

// Des identifiants écrits, pas engendrés.
const SARAH = new Types.ObjectId('650000000000000000000001');
const SESSION = new Types.ObjectId('6500000000000000000000a1');
const KEY = '2f1c9a7e-4b6d-4e8a-9c3f-0d5e7b1a2c4f';

const received = () =>
  CompletedSession.hydrate({
    _id: new Types.ObjectId('6500000000000000000000b1'),
    clientId: SARAH,
    programId: new Types.ObjectId('6500000000000000000000c1'),
    originalSessionId: SESSION,
    sessionOrder: 1,
    blocks: [],
    viewedByCoach: false,
    completedAt: new Date('2026-11-17T08:00:00.000Z'),
    sendKey: KEY,
  });

beforeAll(() => {
  logger.transports.forEach((t) => (t.silent = true));
});

afterEach(() => vi.restoreAllMocks());

describe('reconnaître un bilan déjà reçu', () => {
  it('sans clé, rien à reconnaître : aucune requête', async () => {
    const find = vi.spyOn(CompletedSession, 'findOne');
    expect(await alreadyReceived(SARAH)).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  // La clé est celle de CE client : celle d'un autre ne retrouve rien.
  it('avec une clé : cherché pour ce client, sous cette clé', async () => {
    const find = vi
      .spyOn(CompletedSession, 'findOne')
      .mockResolvedValue(received() as never);
    expect(await alreadyReceived(SARAH, KEY)).not.toBeNull();
    expect(find).toHaveBeenCalledWith({ clientId: SARAH, sendKey: KEY });
  });
});

describe('enregistrer une fois', () => {
  // Ce qui tranche une course, c'est l'index et non le code : sans lui,
  // deux renvois croisés passent tous deux la recherche et écrivent deux
  // bilans. Partiel, pour que les bilans sans clé ne se heurtent pas.
  it('une clé, un bilan, par client : l’index est unique et partiel', () => {
    expect(CompletedSession.schema.indexes()).toContainEqual([
      { clientId: 1, sendKey: 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { sendKey: { $type: 'string' } },
      }),
    ]);
  });

  it('un premier envoi crée le bilan', async () => {
    vi.spyOn(CompletedSession, 'create').mockResolvedValue(received() as never);
    const result = await recordOnce({ clientId: SARAH, sendKey: KEY });
    expect(result.created).toBe(true);
  });

  // Deux renvois croisés : l'index unique refuse le second, qui rend le
  // bilan du premier — pour l'appareil, son bilan est parti.
  it('le perdant d’une course rend le bilan du gagnant', async () => {
    vi.spyOn(CompletedSession, 'create').mockRejectedValue({ code: 11000 });
    const winner = received();
    vi.spyOn(CompletedSession, 'findOne').mockResolvedValue(winner as never);
    const result = await recordOnce({ clientId: SARAH, sendKey: KEY });
    expect(result).toEqual({ completed: winner, created: false });
  });

  // Un doublon sans clé n'a rien à voir avec un renvoi : ce n'est pas à
  // cette fonction de l'avaler.
  it('un doublon sans clé reste une erreur', async () => {
    vi.spyOn(CompletedSession, 'create').mockRejectedValue({ code: 11000 });
    await expect(recordOnce({ clientId: SARAH })).rejects.toEqual({
      code: 11000,
    });
  });

  it('une autre erreur n’est pas maquillée en renvoi', async () => {
    vi.spyOn(CompletedSession, 'create').mockRejectedValue(new Error('base'));
    await expect(recordOnce({ clientId: SARAH, sendKey: KEY })).rejects.toThrow(
      'base'
    );
  });
});

describe('ce que la route accepte, ce qui sort', () => {
  const parse = (sendKey: unknown) =>
    completeSessionSchema.safeParse({
      params: { sessionId: String(SESSION) },
      body: { feedback: { effort: 3 }, sendKey },
    }).success;

  it('une clé comme celles que l’appareil pose', () => {
    expect(parse(KEY)).toBe(true);
    expect(parse(undefined)).toBe(true);
  });

  it('une clé trop courte, trop longue ou bizarre est refusée', () => {
    expect(parse('abc')).toBe(false);
    expect(parse('a'.repeat(65))).toBe(false);
    expect(parse('clé avec espaces')).toBe(false);
  });

  // La clé est une affaire entre l'appareil et le serveur : elle ne sort
  // pas, ni vers le client, ni vers le coach.
  it('la clé ne sort pas', () => {
    expect(completedSessionPayload.parse(received())).not.toHaveProperty(
      'sendKey'
    );
  });
});

describe('au bord, dans un vrai serveur', () => {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.client = { _id: SARAH } as never;
    next();
  });
  app.post('/sessions/:sessionId/complete', completeSession);
  app.use(globalErrorHandler);

  // L'enjeu : le renvoi d'un bilan déjà reçu ne crée rien, répond comme un
  // succès, et n'a pas besoin que la séance existe encore.
  it('un renvoi rend le bilan reçu, en 200, sans rien créer', async () => {
    vi.spyOn(CompletedSession, 'findOne').mockResolvedValue(
      received() as never
    );
    const create = vi.spyOn(CompletedSession, 'create');
    const program = vi.spyOn(Program, 'findOne');

    const r = await request(app)
      .post(`/sessions/${SESSION}/complete`)
      .send({ feedback: { effort: 3 }, sendKey: KEY });

    expect(r.status).toBe(200);
    expect(r.body.completed._id).toBe('6500000000000000000000b1');
    expect(create).not.toHaveBeenCalled();
    expect(program).not.toHaveBeenCalled();
  });
});
