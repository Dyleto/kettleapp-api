/**
 * Lire le contexte de la requête, et ce qui arrive quand il n'est pas là.
 *
 * Les contrôleurs écrivaient `res.locals.coach as ICoach`, dix-huit fois. Une
 * assertion est une promesse faite au compilateur que rien ne vérifie, et
 * elle ne tient qu'aussi longtemps que chaque route montant un contrôleur
 * monte aussi son garde.
 *
 * Le jour où l'une ne le fait pas, le contrôleur reçoit `undefined`, le cast
 * le masque, et le premier `coach._id` lève un TypeError : un 500 avec une
 * pile d'appels, sur ce qui est en réalité un 403. On vérifie ici que les
 * accesseurs rendent à cet échec ce qu'il est.
 *
 * Était `verify:guards`. Aucune base de données.
 */
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { globalErrorHandler } from './errorHandler';
import { coachOf, clientOf } from './roles';
import { catchAsync } from '../utils/catchAsync';
import logger from '../utils/logger';

const app = express();

// Une route dont le garde est passé : `res.locals.coach` est là, comme en
// production.
app.get(
  '/guarded',
  (_req, res, next) => {
    res.locals.coach = { _id: 'abc', userId: 'u1' } as never;
    next();
  },
  catchAsync(async (_req, res) => {
    res.json({ id: String(coachOf(res)._id) });
  })
);

// Le même contrôleur, monté sans son garde — la faute que ceci couvre.
app.get(
  '/unguarded',
  catchAsync(async (_req, res) => {
    res.json({ id: String(coachOf(res)._id) });
  })
);
app.get(
  '/unguarded-client',
  catchAsync(async (_req, res) => {
    res.json({ id: String(clientOf(res)._id) });
  })
);
app.use(globalErrorHandler);

beforeAll(() => {
  logger.transports.forEach((t) => (t.silent = true));
});

describe('avec son garde, le contrôleur lit le contexte', () => {
  it('la requête passe, et porte le coach', async () => {
    const r = await request(app).get('/guarded');
    expect(r.status).toBe(200);
    expect(r.body.id).toBe('abc');
  });
});

// L'enjeu : un garde manquant est un défaut d'autorisation, et doit se lire
// comme tel. Avant, c'était un TypeError sur `undefined._id` — un 500.
describe('sans lui, la réponse est un refus, pas un plantage', () => {
  it('un garde manquant donne un 403, qui dit de quel espace il s’agissait', async () => {
    const r = await request(app).get('/unguarded');
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/Espace Coach/);
  });

  it('sans pile d’appels qui fuite la cause', async () => {
    const r = await request(app).get('/unguarded');
    expect(JSON.stringify(r.body)).not.toMatch(/TypeError|undefined/);
  });

  it('le côté client se comporte pareil, et nomme son propre espace', async () => {
    const r = await request(app).get('/unguarded-client');
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/Espace Client/);
  });
});
