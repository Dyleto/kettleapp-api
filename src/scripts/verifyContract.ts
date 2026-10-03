/**
 * Ce qui sort de l'API, et ce qui ne sort plus.
 *
 * Avant le contrat, `res.json(history)` envoyait des documents Mongoose
 * entiers. Personne ne l'avait décidé : c'est simplement ce que fait
 * `JSON.stringify` d'un document. `clientId`, `programId`, `__v` et les dates
 * internes partaient à chaque appel, et aucun écran n'en lisait un seul.
 *
 * Un schéma appliqué à la sortie ne décrit pas la réponse, il la façonne.
 * Cette suite le vérifie dans les deux sens : ce que le contrat déclare
 * survit, ce qu'il ne déclare pas disparaît. Et elle vérifie que `respond`
 * refuse de tronquer — une réponse incomplète est un défaut du serveur, donc
 * un 500, pas un 200 auquel il manque un champ.
 *
 * Ne demande aucune base de données.
 *
 *   npm run verify:contract
 */
import express from 'express';
import { Types } from 'mongoose';
import CompletedSession from '../models/CompletedSession';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { globalErrorHandler } from '../shared/middleware/errorHandler';
import { catchAsync } from '../shared/utils/catchAsync';
import { respond } from '../shared/utils/respond';
import logger from '../shared/utils/logger';
import {
  completedSessionPayload,
  sessionPayload,
  programPayload,
  exercisePayload,
  clientRowPayload,
  userPayload,
  createdCoachPayload,
} from '../contract';

logger.transports.forEach((t) => (t.silent = true));

let failures = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  if (!cond) failures++;
  console.log(
    `${cond ? 'OK  ' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`
  );
};

const oid = () => new Types.ObjectId();
const keys = (o: unknown) => Object.keys(o as object).sort();

/**
 * Parser en nommant ce qui n'a pas passé.
 *
 * `.parse` lève, et une suite qui lève s'arrête : la sortie devient une pile
 * d'appels et plus aucune assertion ne dit lequel des champs a rompu le
 * contrat. Ici l'échec est une assertion comme une autre, et elle porte le
 * chemin du champ.
 */
const parses = <S extends z.ZodType>(
  label: string,
  schema: S,
  data: unknown
): z.infer<S> | undefined => {
  const r = schema.safeParse(data);
  ok(
    label,
    r.success,
    r.success ? '' : r.error.issues.map((i) => i.path.join('.')).join(', ')
  );
  return r.success ? r.data : undefined;
};

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── un identifiant sort en chaîne, une date en ISO');

{
  const output = exercisePayload.parse({
    _id: oid(),
    name: 'Goblet Squat',
    createdBy: oid(),
    createdAt: new Date('2026-03-07T10:00:00.000Z'),
    updatedAt: new Date('2026-03-07T10:00:00.000Z'),
    __v: 3,
  });
  ok(
    "l'identifiant devient une chaîne de 24 caractères",
    typeof output._id === 'string' && /^[0-9a-f]{24}$/.test(output._id),
    String(output._id)
  );
  ok(
    '  → la date devient une chaîne ISO',
    output.createdAt === '2026-03-07T10:00:00.000Z',
    String(output.createdAt)
  );
  ok(
    '  → une chaîne ISO déjà formée passe inchangée',
    exercisePayload.parse({
      _id: 'a'.repeat(24),
      name: 'x',
      createdBy: 'b'.repeat(24),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }).createdAt === '2026-01-01T00:00:00.000Z'
  );
  ok(
    '  → et le `__v` de Mongoose ne sort pas',
    !('__v' in output),
    keys(output).join(' ')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── le bilan ne sort plus avec les clés qu'il ne déclare pas");

{
  // Un vrai document, pas un objet ordinaire.
  //
  // C'est la différence qui compte : sur un document hydraté, Mongoose
  // matérialise les chemins imbriqués vides — `metrics`, `customMetric` —
  // comme des objets dont toutes les clés valent `undefined`. Un jeu
  // d'épreuve en objets littéraux ne les porte pas, et laissait donc passer
  // un contrat qui répondait 500 sur presque tout l'historique.
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

  const output = parses(
    'un vrai document passe le contrat',
    completedSessionPayload,
    document
  );
  if (!output) throw new Error('le bilan ne passe pas : le reste est muet');
  for (const internal of [
    'clientId',
    'programId',
    '__v',
    'createdAt',
    'updatedAt',
  ]) {
    ok(
      `  \`${internal}\` ne sort pas`,
      !(internal in output),
      keys(output).join(' ')
    );
  }
  ok(
    'ce que les écrans lisent survit',
    output.originalSessionId.length === 24 &&
      output.sessionOrder === 2 &&
      output.sessionName === 'Haut du corps' &&
      output.feedback?.effort === 3 &&
      output.clientNotes === 'Bien passé.' &&
      output.completedAt === '2026-09-28T18:30:00.000Z',
    keys(output).join(' ')
  );
  ok(
    '  → y compris la charge notée, au fond de deux tableaux',
    output.blocks[0].exercises[0].performed?.sets[0].weight === 26,
    JSON.stringify(output.blocks[0].exercises[0].performed)
  );
  ok(
    "  → et l'instantané de l'exercice, qui reste un objet libre",
    typeof output.blocks[0].exercises[0].exercise.name === 'string',
    JSON.stringify(output.blocks[0].exercises[0].exercise)
  );

  // Les deux chemins imbriqués que Mongoose ne laisse jamais absents.
  ok(
    'un `metrics` vide ne devient pas un bilan à cinq axes',
    output.metrics === undefined,
    JSON.stringify(output.metrics)
  );
  ok(
    '  → un `customMetric` vide non plus',
    output.blocks[0].exercises[0].customMetric === undefined,
    JSON.stringify(output.blocks[0].exercises[0].customMetric)
  );

  // Et remplis, ils survivent : le filtre ne doit pas emporter la donnée.
  const filled = parses(
    'un bilan rempli passe aussi',
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
  ok(
    '  → un ancien bilan à cinq axes se relit toujours',
    filled?.metrics?.stress === 2,
    JSON.stringify(filled?.metrics)
  );
  ok(
    '  → et une mesure libre aussi',
    filled?.blocks[0].exercises[0].customMetric?.unit === 'm',
    JSON.stringify(filled?.blocks[0].exercises[0].customMetric)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── la séance et le programme perdent leurs clés internes');

{
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

  // Une séance ne voyage pas comme un document : elle sort par `.lean()`,
  // puis `formatSession` remplace `exerciseId` par l'exercice entier. C'est
  // donc un objet ordinaire qu'il faut éprouver ici — et un `customMetric`
  // vide y prend la forme qu'il a en base, `{}`.
  const output = parses('une séance passe le contrat', sessionPayload, session);
  if (!output) throw new Error('la séance ne passe pas : le reste est muet');
  ok(
    '`programId` ne sort pas de la séance',
    !('programId' in output),
    keys(output).join(' ')
  );
  ok(
    "  → le `_id` du bloc sort, lui : l'atelier le renvoie tel quel",
    typeof output.blocks[0]._id === 'string',
    String(output.blocks[0]._id)
  );
  ok(
    '  → les jours conseillés survivent',
    JSON.stringify(output.suggestedDays) === '[0,3]',
    JSON.stringify(output.suggestedDays)
  );
  ok(
    "  → et le `__v` de l'exercice imbriqué non plus",
    !('__v' in output.blocks[0].exercises[0].exercise),
    keys(output.blocks[0].exercises[0].exercise).join(' ')
  );

  ok(
    "  → et le `customMetric` vide d'un exercice prescrit disparaît",
    output.blocks[0].exercises[0].customMetric === undefined,
    JSON.stringify(output.blocks[0].exercises[0].customMetric)
  );

  const program = parses('le programme passe le contrat', programPayload, {
    _id: oid(),
    clientId: oid(),
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0,
    sessions: [session],
  });
  ok(
    '`clientId` ne sort pas du programme',
    !!program && !('clientId' in program),
    keys(program).join(' ')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── une ligne de liste ne porte pas une adresse e-mail');

{
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
  ok(
    "l'adresse e-mail ne sort pas de la liste des clients",
    !('email' in output),
    keys(output).join(' ')
  );
  ok(
    '  → ce qui ordonne la liste survit',
    output.unseenCount === 2 &&
      output.lastEffort === 4 &&
      output.lastCompletedAt === '2026-09-20T07:00:00.000Z',
    JSON.stringify(output)
  );
  ok(
    '  → une absence reste une absence',
    clientRowPayload.parse({
      _id: oid(),
      unseenCount: 0,
      linkedAt: new Date(),
    }).lastCompletedAt === undefined
  );
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── la création d'un coach ne renvoie plus deux documents");

{
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
  ok(
    'le coach créé ne porte que de quoi le nommer',
    keys(output.coach).join(' ') === '_id email firstName lastName',
    keys(output.coach).join(' ')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── un champ requis qui manque est un défaut, pas une réponse');

{
  const withoutRole = userPayload.safeParse({
    id: oid(),
    email: 'a@b.c',
    isAdmin: false,
    isCoach: true,
    healthConsent: null,
    needsHealthConsent: false,
  });
  ok(
    'le schéma refuse un compte sans `isClient`',
    !withoutRole.success,
    withoutRole.success ? 'accepté' : withoutRole.error.issues[0].path.join('.')
  );
  ok(
    '  → et nomme le champ qui manque',
    !withoutRole.success &&
      withoutRole.error.issues[0].path.join('.') === 'isClient',
    withoutRole.success ? '' : withoutRole.error.issues[0].path.join('.')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// `respond` dans un vrai serveur : c'est le comportement au bord qui compte,
// pas celui du schéma seul.
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

const main = async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  console.log('\n── au bord, dans un vrai serveur');

  {
    const r = await fetch(`${base}/conforme`);
    const body = await r.json();
    ok(
      'une réponse conforme part sans ce qui lui est étranger',
      r.status === 200 && JSON.stringify(body) === '{"a":"x"}',
      `${r.status} ${JSON.stringify(body)}`
    );
  }

  {
    const r = await fetch(`${base}/hors-contrat`);
    const body = (await r.json()) as { status?: string; message?: string };
    ok(
      'une réponse hors contrat donne 500, pas un 200 tronqué',
      r.status === 500,
      String(r.status)
    );
    ok(
      '  → en JSON, comme toute autre erreur',
      (r.headers.get('content-type') ?? '').includes('application/json'),
      r.headers.get('content-type') ?? '(aucun)'
    );
    ok(
      '  → sans rien dire du contrat au client',
      body.message === 'Erreur interne' &&
        !JSON.stringify(body).includes('"a"'),
      JSON.stringify(body)
    );
  }

  server.close();

  console.log(
    failures === 0
      ? "\nCe qui sort de l'API est ce que le contrat déclare."
      : `\n${failures} assertion(s) en échec.`
  );
  process.exit(failures ? 1 : 0);
};

main();
