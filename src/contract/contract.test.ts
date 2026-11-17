/**
 * Ce qui sort de l'API, et ce qui ne sort plus.
 *
 * Avant le contrat, `res.json(history)` envoyait des documents Mongoose
 * entiers. Personne ne l'avait décidé : c'est simplement ce que fait
 * `JSON.stringify` d'un document. `clientId`, `programId`, `__v` et les dates
 * internes partaient à chaque appel, et aucun écran n'en lisait un seul.
 *
 * Un schéma appliqué à la sortie ne décrit pas la réponse, il la façonne. On
 * le vérifie dans les deux sens : ce que le contrat déclare survit, ce qu'il
 * ne déclare pas disparaît. Et `respond` refuse de tronquer — une réponse
 * incomplète est un défaut du serveur, donc un 500, pas un 200 auquel il
 * manque un champ.
 *
 * Était `verify:contract`. Aucune base de données : les documents sont
 * hydratés sans connexion, et c'est la seule façon de voir les chemins
 * imbriqués vides, qui n'existent que sur un document.
 */
import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import CompletedSession from '../models/CompletedSession';
import { globalErrorHandler } from '../shared/middleware/errorHandler';
import { catchAsync } from '../shared/utils/catchAsync';
import { respond } from '../shared/utils/respond';
import logger from '../shared/utils/logger';
import {
  completedSessionPayload,
  sessionPayload,
  programPayload,
  clientProgramPayload,
  exercisePayload,
  clientRowPayload,
  userPayload,
  createdCoachPayload,
} from './index';

const oid = () => new Types.ObjectId();
const keys = (o: unknown) => Object.keys(o as object).sort();

/**
 * Parser en nommant ce qui n'a pas passé : un échec dit le chemin du champ
 * qui a rompu le contrat, plutôt qu'une pile d'appels.
 */
const parsed = <S extends z.ZodType>(schema: S, data: unknown): z.infer<S> => {
  const r = schema.safeParse(data);
  expect(
    r.success,
    r.success ? '' : r.error.issues.map((i) => i.path.join('.')).join(', ')
  ).toBe(true);
  return r.data as z.infer<S>;
};

beforeAll(() => {
  logger.transports.forEach((t) => (t.silent = true));
});

describe('un identifiant sort en chaîne, une date en ISO', () => {
  const output = exercisePayload.parse({
    _id: oid(),
    name: 'Goblet Squat',
    createdBy: oid(),
    createdAt: new Date('2026-03-07T10:00:00.000Z'),
    updatedAt: new Date('2026-03-07T10:00:00.000Z'),
    __v: 3,
  });

  it('l’identifiant devient une chaîne de 24 caractères, la date une chaîne ISO', () => {
    expect(output._id).toMatch(/^[0-9a-f]{24}$/);
    expect(output.createdAt).toBe('2026-03-07T10:00:00.000Z');
  });

  it('une chaîne ISO déjà formée passe inchangée', () => {
    expect(
      exercisePayload.parse({
        _id: 'a'.repeat(24),
        name: 'x',
        createdBy: 'b'.repeat(24),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }).createdAt
    ).toBe('2026-01-01T00:00:00.000Z');
  });

  it('le `__v` de Mongoose ne sort pas', () => {
    expect(output).not.toHaveProperty('__v');
  });
});

describe('le bilan ne sort plus avec les clés qu’il ne déclare pas', () => {
  // Un vrai document, pas un objet ordinaire. Sur un document hydraté,
  // Mongoose matérialise les chemins imbriqués vides — `metrics`,
  // `customMetric` — comme des objets dont toutes les clés valent
  // `undefined`. Un jeu d'épreuve en objets littéraux ne les porte pas, et
  // laissait donc passer un contrat qui répondait 500 sur presque tout
  // l'historique.
  const document = CompletedSession.hydrate({
    _id: oid(),
    clientId: oid(),
    programId: oid(),
    originalSessionId: oid(),
    sessionOrder: 2,
    sessionName: 'Haut du corps',
    blocks: [
      {
        type: 'classic',
        order: 1,
        exercises: [
          {
            exercise: { _id: oid(), name: 'Goblet Squat' },
            order: 1,
            sets: 4,
            reps: 10,
            performed: { sets: [{ weight: 26, reps: 10 }] },
          },
        ],
      },
    ],
    coachNotes: 'On garde 2 reps en réserve.',
    feedback: { effort: 3, tags: ['fatigue'] },
    clientNotes: 'Bien passé.',
    viewedByCoach: false,
    completedAt: new Date('2026-09-28T18:30:00.000Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0,
  });

  it('un vrai document passe le contrat, sans ses clés internes', () => {
    const output = parsed(completedSessionPayload, document);
    for (const internal of [
      'clientId',
      'programId',
      '__v',
      'createdAt',
      'updatedAt',
    ])
      expect(output).not.toHaveProperty(internal);
  });

  it('ce que les écrans lisent survit, jusqu’à la charge notée', () => {
    const output = parsed(completedSessionPayload, document);
    expect(output.originalSessionId).toHaveLength(24);
    expect(output).toMatchObject({
      sessionOrder: 2,
      sessionName: 'Haut du corps',
      clientNotes: 'Bien passé.',
      completedAt: '2026-09-28T18:30:00.000Z',
    });
    expect(output.feedback?.effort).toBe(3);
    expect(output.blocks[0].exercises[0].performed?.sets[0].weight).toBe(26);
    // L'instantané de l'exercice reste un objet libre.
    expect(typeof output.blocks[0].exercises[0].exercise.name).toBe('string');
  });

  // Les deux chemins imbriqués que Mongoose ne laisse jamais absents.
  it('un `metrics` ou un `customMetric` vide n’en devient pas un', () => {
    const output = parsed(completedSessionPayload, document);
    expect(output.metrics).toBeUndefined();
    expect(output.blocks[0].exercises[0].customMetric).toBeUndefined();
  });

  // Et remplis, ils survivent : le filtre ne doit pas emporter la donnée.
  it('remplis, un ancien bilan à cinq axes et une mesure libre se relisent', () => {
    const filled = parsed(
      completedSessionPayload,
      CompletedSession.hydrate({
        _id: oid(),
        clientId: oid(),
        programId: oid(),
        originalSessionId: oid(),
        sessionOrder: 1,
        viewedByCoach: false,
        completedAt: new Date(),
        metrics: { stress: 2, mood: 4, energy: 3, sleep: 4, soreness: 2 },
        blocks: [
          {
            type: 'classic',
            order: 1,
            exercises: [
              {
                exercise: { name: 'Rameur' },
                order: 1,
                customMetric: { value: 400, unit: 'm' },
              },
            ],
          },
        ],
      })
    );
    expect(filled.metrics?.stress).toBe(2);
    expect(filled.blocks[0].exercises[0].customMetric?.unit).toBe('m');
  });
});

describe('la séance et le programme perdent leurs clés internes', () => {
  // Une séance ne voyage pas comme un document : elle sort par `.lean()`,
  // puis `formatSession` remplace `exerciseId` par l'exercice entier. C'est
  // donc un objet ordinaire qu'on éprouve ici — et un `customMetric` vide y
  // prend la forme qu'il a en base, `{}`.
  const session = {
    _id: oid(),
    programId: oid(),
    order: 1,
    name: 'Full body A',
    suggestedDays: [0, 3],
    blocks: [
      {
        _id: oid(),
        type: 'amrap',
        order: 1,
        durationMinutes: 12,
        exercises: [
          {
            exercise: {
              _id: oid(),
              name: 'Burpee',
              createdBy: oid(),
              createdAt: new Date(),
              updatedAt: new Date(),
              __v: 0,
            },
            order: 1,
            reps: 10,
            customMetric: {},
          },
        ],
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0,
  };

  it('`programId` ne sort pas de la séance ; le `_id` du bloc et les jours, si', () => {
    const output = parsed(sessionPayload, session);
    expect(output).not.toHaveProperty('programId');
    // L'atelier renvoie le `_id` du bloc tel quel.
    expect(typeof output.blocks[0]._id).toBe('string');
    expect(output.suggestedDays).toEqual([0, 3]);
  });

  it('ni le `__v` de l’exercice imbriqué, ni un `customMetric` vide', () => {
    const output = parsed(sessionPayload, session);
    expect(output.blocks[0].exercises[0].exercise).not.toHaveProperty('__v');
    expect(output.blocks[0].exercises[0].customMetric).toBeUndefined();
  });

  it('`clientId` ne sort pas du programme', () => {
    const program = parsed(programPayload, {
      _id: oid(),
      clientId: oid(),
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0,
      sessions: [session],
    });
    expect(program).not.toHaveProperty('clientId');
  });

  // Le service ne charge que le prénom, mais c'est le contrat qui répond de
  // ce qui quitte l'API — un `populate` élargi un jour ne doit pas faire
  // sortir une adresse.
  it('du coach du client, seul le prénom sort', () => {
    const withCoach = parsed(clientProgramPayload, {
      program: {
        _id: oid(),
        clientId: oid(),
        createdAt: new Date(),
        updatedAt: new Date(),
        sessions: [],
      },
      coaches: [
        {
          firstName: 'Julie',
          lastName: 'Martin',
          email: 'julie@exemple.fr',
          picture: 'https://exemple.fr/julie.jpg',
        },
      ],
    });
    expect(keys(withCoach.coaches[0])).toEqual(['firstName']);
  });
});

describe('une ligne de liste ne porte pas une adresse e-mail', () => {
  it('l’adresse ne sort pas, ce qui ordonne la liste survit', () => {
    const output = clientRowPayload.parse({
      _id: oid(),
      firstName: 'Sarah',
      lastName: 'Martin',
      email: 'sarah@example.com',
      unseenCount: 2,
      lastCompletedAt: new Date('2026-09-20T07:00:00.000Z'),
      lastEffort: 4,
      linkedAt: new Date('2026-06-01T09:00:00.000Z'),
    });
    expect(output).not.toHaveProperty('email');
    expect(output).toMatchObject({
      unseenCount: 2,
      lastEffort: 4,
      lastCompletedAt: '2026-09-20T07:00:00.000Z',
    });
  });

  it('une absence reste une absence', () => {
    expect(
      clientRowPayload.parse({
        _id: oid(),
        unseenCount: 0,
        linkedAt: new Date(),
      }).lastCompletedAt
    ).toBeUndefined();
  });
});

describe('la création d’un coach ne renvoie plus deux documents', () => {
  it('le coach créé ne porte que de quoi le nommer', () => {
    const output = createdCoachPayload.parse({
      status: 'success',
      message: 'Coach créé avec succès',
      coach: {
        _id: oid(),
        firstName: 'Léa',
        lastName: 'Durand',
        email: 'lea@example.com',
        isAdmin: false,
        __v: 0,
      },
    });
    expect(keys(output.coach)).toEqual([
      '_id',
      'email',
      'firstName',
      'lastName',
    ]);
  });
});

describe('un champ requis qui manque est un défaut, pas une réponse', () => {
  it('le schéma refuse un compte sans `isClient`, et le nomme', () => {
    const withoutRole = userPayload.safeParse({
      id: oid(),
      email: 'a@b.c',
      isAdmin: false,
      isCoach: true,
      healthConsent: null,
      needsHealthConsent: false,
    });
    expect(withoutRole.success).toBe(false);
    expect(withoutRole.error?.issues[0].path.join('.')).toBe('isClient');
  });
});

// `respond` dans un vrai serveur : c'est le comportement au bord qui compte,
// pas celui du schéma seul.
describe('au bord, dans un vrai serveur', () => {
  const app = express();
  app.get(
    '/conforme',
    catchAsync(async (_req, res) => {
      respond(res, 200, z.object({ a: z.string() }), { a: 'x', b: 'fuite' });
    })
  );
  app.get(
    '/hors-contrat',
    catchAsync(async (_req, res) => {
      respond(res, 200, z.object({ a: z.string() }), { a: 42 });
    })
  );
  app.use(globalErrorHandler);

  it('une réponse conforme part sans ce qui lui est étranger', async () => {
    const r = await request(app).get('/conforme');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ a: 'x' });
  });

  it('une réponse hors contrat donne 500, en JSON, sans rien dire du contrat', async () => {
    const r = await request(app).get('/hors-contrat');
    expect(r.status).toBe(500);
    expect(r.type).toBe('application/json');
    expect(r.body.message).toBe('Erreur interne');
    expect(JSON.stringify(r.body)).not.toContain('"a"');
  });
});
