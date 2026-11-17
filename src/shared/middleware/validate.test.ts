/**
 * Ce que la validation fait réellement à une requête.
 *
 * Elle jugeait, puis oubliait. `validate` analysait la requête, puis rendait
 * aux contrôleurs le `req.body` brut — la valeur validée et nettoyée était
 * donc jetée à chaque appel. Deux conséquences, vérifiées avant d'être
 * corrigées :
 *
 *   — Les champs en trop survivaient. `POST /users` faisait
 *     `new User(req.body)`, et comme `isAdmin` est déclaré sur le schéma
 *     Mongoose, tout utilisateur connecté pouvait s'attribuer le drapeau
 *     administrateur. Zod l'avait retiré ; personne ne lisait la copie
 *     nettoyée.
 *
 *   — Chaque `.default()` et `.transform()` était du code mort. Le transform
 *     de `suggestedDays` dédoublonne et trie les jours ; il n'avait jamais
 *     tourné.
 *
 * Et les paramètres de route n'étaient pas validés du tout : `:id` partait
 * chez Mongoose tel qu'il arrivait.
 *
 * Était `verify:validation`. Aucune base de données.
 */
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { globalErrorHandler } from './errorHandler';
import { validate } from './validate';
import { idParamSchema } from '../schemas/params.schema';
import { updateProgramSessionsSchema } from '../../modules/program/program.schema';
import { createExerciseSchema } from '../../modules/exercise/exercise.schema';
import logger from '../utils/logger';

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
// Un schéma qui façonne la chaîne de requête : sans lui, la valeur validée
// et la brute sont identiques, et rien ne dit laquelle le contrôleur lit.
app.get(
  '/paged',
  validate(
    z.object({ query: z.object({ page: z.coerce.number().default(1) }) })
  ),
  (req, res) => res.json({ query: req.query })
);
app.use(globalErrorHandler);

beforeAll(() => {
  logger.transports.forEach((t) => (t.silent = true));
});

describe('ce que le schéma n’a pas demandé ne passe pas', () => {
  // Le champ en trop est celui qui comptait : `POST /users` faisait
  // `new User(req.body)`, et `isAdmin` est déclaré sur le schéma Mongoose.
  // Ces routes sont supprimées, mais le mécanisme se vérifie sur n'importe
  // quel schéma vivant — ici la création d'un exercice.
  it('la requête est acceptée, sans ce que le schéma n’a pas demandé', async () => {
    const r = await request(app).post('/exercise').send({
      name: 'Kettlebell Swing',
      createdBy: 'un-autre-coach',
      usageCount: 9999,
    });
    expect(r.status).toBe(200);
    expect(r.body.body).not.toHaveProperty('createdBy');
    expect(r.body.body).not.toHaveProperty('usageCount');
    expect(r.body.body.name).toBe('Kettlebell Swing');
  });
});

describe('le schéma façonne la valeur, il ne fait pas que la juger', () => {
  const sent = {
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
  };

  it('les jours sont dédoublonnés et triés', async () => {
    const r = await request(app).put('/program').send(sent);
    expect(r.body.body.sessions[0].suggestedDays).toEqual([0, 3]);
  });

  // Ce que le coach n'a pas réglé reste non réglé : zéro est une autre
  // affirmation qu'absent, donc le schéma n'invente plus de zéros.
  it('ce qui n’a jamais été réglé reste absent, pas zéro', async () => {
    const r = await request(app).put('/program').send(sent);
    const exercise = r.body.body.sessions[0].blocks[0].exercises[0];
    expect(exercise).not.toHaveProperty('sets');
    expect(exercise).not.toHaveProperty('reps');
  });
});

describe('un identifiant d’URL est contrôlé, pas transmis', () => {
  it('un vrai ObjectId passe', async () => {
    const r = await request(app).get('/thing/507f1f77bcf86cd799439011');
    expect(r.status).toBe(200);
  });

  it('un identifiant mal formé est refusé, et la réponse nomme le champ', async () => {
    const r = await request(app).get('/thing/pas-un-id');
    expect(r.status).toBe(400);
    expect(r.body.errors?.[0]?.field).toBe('id');
  });
});

describe('la chaîne de requête garde ce que le schéma n’a pas décrit', () => {
  it('une requête valide passe, avec le champ décrit', async () => {
    const r = await request(app).get('/search?q=squat&page=2');
    expect(r.status).toBe(200);
    expect(r.body.query.q).toBe('squat');
  });

  // `req.query` est fusionné et non remplacé : un paramètre non décrit
  // survit, et un schéma n'est pas un filtre pour la chaîne de requête.
  it('un paramètre non décrit n’est pas perdu', async () => {
    const r = await request(app).get('/search?q=squat&page=2');
    expect(r.body.query.page).toBe('2');
  });

  it('ce que le schéma façonne arrive façonné : un nombre, et son défaut', async () => {
    expect((await request(app).get('/paged?page=3')).body.query.page).toBe(3);
    expect((await request(app).get('/paged')).body.query.page).toBe(1);
  });

  it('une requête invalide est refusée', async () => {
    const r = await request(app).get('/search?q=a');
    expect(r.status).toBe(400);
  });
});
