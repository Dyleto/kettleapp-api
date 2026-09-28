/**
 * Ce que la validation fait réellement à une requête.
 *
 * Elle jugeait, puis oubliait. `validate` analysait la requête, puis rendait
 * aux contrôleurs le `req.body` brut — la valeur validée et nettoyée était donc
 * jetée à chaque appel. Deux conséquences, vérifiées avant d'être corrigées :
 *
 *   — Les champs en trop survivaient. `POST /users` faisait
 *     `new User(req.body)`, et comme `isAdmin` est déclaré sur le schéma
 *     Mongoose, tout utilisateur connecté pouvait s'attribuer le drapeau
 *     administrateur. Zod l'avait retiré ; personne ne lisait la copie
 *     nettoyée.
 *
 *   — Chaque `.default()` et `.transform()` était du code mort. Le transform de
 *     `suggestedDays` dédoublonne et trie les jours, et porte un commentaire
 *     qui explique pourquoi il a sa place là. Il n'avait jamais tourné.
 *
 * Et les paramètres de route n'étaient pas validés du tout : `:id` partait chez
 * Mongoose tel qu'il arrivait.
 *
 * Ne demande aucune base de données.
 *
 *   npm run verify:validation
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { globalErrorHandler } from '../shared/middleware/errorHandler';
import { validate } from '../shared/middleware/validate';
import { idParamSchema } from '../shared/schemas/params.schema';
import { updateProgramSessionsSchema } from '../modules/program/program.schema';
import { createExerciseSchema } from '../modules/exercise/exercise.schema';
import logger from '../shared/utils/logger';

logger.transports.forEach((t) => (t.silent = true));

let failures = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  if (!cond) failures++;
  console.log(
    `${cond ? 'OK  ' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`
  );
};

const app = express();
app.use(express.json());

// Chaque route renvoie exactement ce que le contrôleur lirait.
app.post('/exercise', validate(createExerciseSchema), (req, res) =>
  res.json({ body: req.body })
);
app.put('/program', validate(updateProgramSessionsSchema), (req, res) =>
  res.json({ body: req.body })
);
app.get('/thing/:id', validate(idParamSchema), (req, res) =>
  res.json({ params: req.params })
);
app.get(
  '/search',
  validate(z.object({ query: z.object({ q: z.string().min(2) }) })),
  (req, res) => res.json({ query: req.query })
);
app.use(globalErrorHandler);

const main = async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as AddressInfo).port;

  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      json: (await r.json()) as Record<string, never>,
    };
  };

  // ── Un champ en trop n'atteint pas le contrôleur ──────────────────────
  console.log('\n── ce que le schéma n’a pas demandé ne passe pas');
  {
    // Le champ en trop est celui qui comptait : `POST /users` faisait
    // `new User(req.body)`, et `isAdmin` est déclaré sur le schéma Mongoose.
    // Ces routes sont supprimées, mais le mécanisme se vérifie sur n'importe
    // quel schéma vivant — ici la création d'un exercice.
    const r = await call('POST', '/exercise', {
      name: 'Kettlebell Swing',
      createdBy: 'un-autre-coach',
      usageCount: 9999,
    });
    const body = r.json.body as Record<string, unknown>;
    ok('la requête est acceptée', r.status === 200, String(r.status));
    ok(
      "  → mais ce que le schéma n'a pas demandé n'atteint pas le contrôleur",
      !('createdBy' in body) && !('usageCount' in body),
      JSON.stringify(body)
    );
    ok(
      '  → alors que les champs déclarés arrivent',
      body.name === 'Kettlebell Swing'
    );
  }

  // ── Les transforms et les défauts tournent vraiment ───────────────────
  console.log('\n── le schéma façonne la valeur, il ne fait pas que la juger');
  {
    const r = await call('PUT', '/program', {
      sessions: [
        {
          order: 1,
          suggestedDays: [3, 0, 3],
          blocks: [
            {
              type: 'classic',
              order: 1,
              exercises: [{ exerciseId: 'ex1', order: 1 }],
            },
          ],
        },
      ],
    });
    const session = (r.json.body as { sessions: Record<string, unknown>[] })
      .sessions[0];
    ok(
      'les jours sont dédoublonnés et triés',
      JSON.stringify(session.suggestedDays) === '[0,3]',
      JSON.stringify(session.suggestedDays)
    );
    // Et ce que le coach n'a pas réglé reste non réglé : zéro est une autre
    // affirmation qu'absent, donc le schéma n'invente plus de zéros.
    const exercise = (
      session.blocks as { exercises: Record<string, unknown>[] }[]
    )[0].exercises[0];
    ok(
      '  → et ce qui n’a jamais été réglé reste absent, pas zéro',
      !('sets' in exercise) && !('reps' in exercise),
      JSON.stringify(exercise)
    );
  }

  // ── Les paramètres de route sont contrôlés avant toute requête ────────
  console.log('\n── un identifiant d’URL est contrôlé, pas transmis');
  {
    const good = await call('GET', '/thing/507f1f77bcf86cd799439011');
    ok('un vrai ObjectId passe', good.status === 200, String(good.status));

    const bad = await call('GET', '/thing/pas-un-id');
    ok(
      'un identifiant mal formé est refusé',
      bad.status === 400,
      String(bad.status)
    );
    const errors = bad.json.errors as { field: string; message: string }[];
    ok(
      '  → et la réponse nomme le champ',
      Array.isArray(errors) && errors[0]?.field === 'id',
      JSON.stringify(errors)
    );
  }

  // ── La chaîne de requête est validée aussi, sans être vidée ───────────
  console.log(
    '\n── la chaîne de requête garde ce que le schéma n’a pas décrit'
  );
  {
    const r = await call('GET', '/search?q=squat&page=2');
    const query = r.json.query as Record<string, unknown>;
    ok('une requête valide passe', r.status === 200, String(r.status));
    ok('  → le champ décrit est là', query.q === 'squat');
    // `req.query` est fusionné et non remplacé. La conséquence mérite d'être
    // écrite : un paramètre non décrit survit, et un schéma n'est pas un
    // filtre pour la chaîne de requête.
    ok(
      '  → et un paramètre non décrit n’est pas perdu',
      query.page === '2',
      JSON.stringify(query)
    );
    const bad = await call('GET', '/search?q=a');
    ok(
      'une requête invalide est refusée',
      bad.status === 400,
      String(bad.status)
    );
  }

  server.close();
  console.log(
    failures ? `\n${failures} écart(s)` : '\nLa validation façonne la requête.'
  );
  process.exit(failures ? 1 : 0);
};

void main();
