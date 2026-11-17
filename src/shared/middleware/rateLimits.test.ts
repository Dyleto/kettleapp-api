/**
 * Ce que l'API refuse, et ce qu'elle ne doit pas refuser.
 *
 * Deux plafonds, faux tous les deux de la même façon : choisis par défaut
 * plutôt qu'à dessein, et jamais éprouvés.
 *
 * Le quota comptait par adresse, si bien que deux coachs sur le wifi d'une
 * même salle partageaient 100 requêtes par quart d'heure — que l'atelier
 * seul peut épuiser, puisqu'il s'enregistre tout seul. Arriver au bout,
 * c'est être bloqué un quart d'heure avec des modifications non
 * enregistrées.
 *
 * La limite de corps était le défaut implicite d'Express, 100 Ko, qu'un gros
 * programme peut légitimement dépasser.
 *
 * Était `verify:hardening`. Aucune base de données.
 */
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { globalErrorHandler } from './errorHandler';
import { makeLimiter } from './rateLimits';
import { BODY_LIMIT } from '../config/limits';
import logger from '../utils/logger';

/** Une application neuve à chaque cas : un quota épuisé ne déborde pas
 * sur le suivant. */
const makeApp = () => {
  const app = express();
  // L'état connecté, du point de vue d'un quota : une session qui nomme un
  // utilisateur. L'en-tête tient lieu de cookie.
  app.use((req, _res, next) => {
    const user = req.header('x-test-user');
    if (user) req.session = { userId: user } as typeof req.session;
    next();
  });
  // Deux requêtes par fenêtre, pour l'épuiser à peu de frais — construit par
  // la même fabrique que les limiteurs de l'application, si bien que la
  // logique de comptage éprouvée est celle qui est livrée.
  app.use(
    '/quota',
    makeLimiter({ windowMs: 60_000, limit: 2, message: 'Trop.' })
  );
  app.get('/quota', (_req, res) => res.json({ ok: true }));
  // La limite de l'application, et non une copie : changer l'une sans
  // l'autre faisait passer le test sur un plafond que personne ne livrait.
  app.post('/body', express.json({ limit: BODY_LIMIT }), (req, res) =>
    res.json({ bytes: JSON.stringify(req.body).length })
  );
  app.use(globalErrorHandler);
  return app;
};

beforeAll(() => {
  logger.transports.forEach((t) => (t.silent = true));
});

const statuses = async (
  app: express.Express,
  times: number,
  user?: string
): Promise<number[]> => {
  const seen: number[] = [];
  for (let i = 0; i < times; i++) {
    const r = user
      ? await request(app).get('/quota').set('x-test-user', user)
      : await request(app).get('/quota');
    seen.push(r.status);
  }
  return seen;
};

describe('deux personnes derrière une adresse gardent des quotas distincts', () => {
  it('le plafond est de deux, puis refus', async () => {
    expect(await statuses(makeApp(), 3, 'alice')).toEqual([200, 200, 429]);
  });

  // L'enjeu. Même process, même adresse — un autre utilisateur connecté.
  it('un autre utilisateur n’est pas touché par l’épuisement du premier', async () => {
    const app = makeApp();
    await statuses(app, 3, 'alice');
    expect(await statuses(app, 3, 'bob')).toEqual([200, 200, 429]);
  });
});

describe('sans session, l’adresse est tout ce qu’on a', () => {
  it('un appelant anonyme est compté, et atteint le même plafond', async () => {
    expect(await statuses(makeApp(), 3)).toEqual([200, 200, 429]);
  });
});

// Mesuré : cinq séances de neuf blocs et dix-huit exercices pèsent 5,4 Ko,
// donc un programme vingt fois plus chargé atteint 107 Ko — au-dessus du
// défaut implicite.
describe('un programme entier passe, un corps arbitraire non', () => {
  const post = (bytes: number) =>
    request(makeApp())
      .post('/body')
      .send({ blob: 'a'.repeat(bytes) });

  it('un programme de 150 Ko passe, ce que le défaut de 100 Ko aurait refusé', async () => {
    expect((await post(150_000)).status).toBe(200);
  });

  // Et le refus doit arriver au client en JSON : un 413 en page HTML est
  // précisément le défaut pour lequel le gestionnaire a été réparé.
  it('un corps de 400 Ko est refusé, en JSON comme toute autre erreur', async () => {
    const r = await post(400_000);
    expect(r.status).toBe(413);
    expect(r.type).toBe('application/json');
  });
});
