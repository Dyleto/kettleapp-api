/**
 * Le gestionnaire d'erreurs répond, et il répond en JSON.
 *
 * Express décide qu'un middleware traite les erreurs à son arité :
 * `fn.length === 4`. `globalErrorHandler` en déclarait trois, il était donc
 * monté comme un middleware ordinaire et ne tournait jamais. Toutes les
 * erreurs tombaient sur le gestionnaire interne d'Express, qui répond en
 * HTML — et le front analyse du JSON.
 *
 * Rien ne plantait, aucun test n'échouait, et l'API renvoyait le mauvais
 * type de contenu pour chaque erreur qu'elle a jamais produite. C'est le
 * genre de défaut qu'une vérification qui s'exécute attrape et qu'une
 * lecture ne voit pas.
 *
 * Était `verify:errors`, un script à son propre `ok()` : les assertions sont
 * les mêmes, une par cas. Aucune base de données : le gestionnaire est monté
 * sur une application Express nue.
 */
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { globalErrorHandler } from './errorHandler';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import logger from '../utils/logger';

const app = express();
app.use(express.json());

// Les chemins par lesquels une erreur atteint le gestionnaire.
app.get('/app-error', (_req, _res, next) => {
  next(new AppError('Client introuvable', 404));
});
app.get('/thrown', () => {
  throw new Error('quelque chose a cassé');
});
app.get(
  '/async',
  catchAsync(async () => {
    await Promise.resolve();
    throw new AppError('Accès refusé', 403);
  })
);
app.get('/cast', (_req, _res, next) => {
  const err = new Error('Cast to ObjectId failed for value "abc"');
  err.name = 'CastError';
  next(err);
});
app.use(globalErrorHandler);

// Winston écrit sur la sortie standard ; les niveaux eux-mêmes sont
// couverts par le statut de la réponse.
beforeAll(() => {
  logger.transports.forEach((t) => (t.silent = true));
});

describe('Express le reconnaît comme gestionnaire d’erreurs', () => {
  // C'est tout l'enjeu. Express lit l'arité, l'assertion la lit donc aussi :
  // une régression ici est à un paramètre supprimé, et ne se verrait sinon
  // qu'en production.
  it('le gestionnaire déclare quatre paramètres', () => {
    expect(globalErrorHandler.length).toBe(4);
  });
});

describe('une erreur répond en JSON, jamais en HTML', () => {
  it.each([
    ['une AppError lancée', '/app-error'],
    ['une erreur lancée de façon synchrone', '/thrown'],
    ['une erreur asynchrone attrapée par catchAsync', '/async'],
  ])('%s répond en JSON, avec un identifiant de requête', async (_, path) => {
    const r = await request(app).get(path);
    expect(r.type).toBe('application/json');
    expect(r.body).toHaveProperty('requestId');
  });
});

describe('chaque erreur garde son statut', () => {
  it('une AppError garde son statut, son message, et se dit faute du client', async () => {
    const r = await request(app).get('/app-error');
    expect(r.status).toBe(404);
    expect(r.body.message).toBe('Client introuvable');
    expect(r.body.status).toBe('fail');
  });

  it('une erreur inattendue est un 500, marqué erreur serveur', async () => {
    const r = await request(app).get('/thrown');
    expect(r.status).toBe(500);
    expect(r.body.status).toBe('error');
  });

  it('une AppError asynchrone garde son statut', async () => {
    const r = await request(app).get('/async');
    expect(r.status).toBe(403);
  });
});

// Un CastError est un identifiant mal formé : une faute du client, et un
// 400. Il était journalisé en niveau erreur avec sa pile d'appels — le
// journal annonçait un plantage qui n'avait pas eu lieu.
describe('un identifiant mal formé est une faute du client, pas un plantage', () => {
  it('un CastError devient un 400 lisible, pas une erreur serveur', async () => {
    const r = await request(app).get('/cast');
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Ressource introuvable (ID invalide)');
    expect(r.body.status).toBe('fail');
  });
});
