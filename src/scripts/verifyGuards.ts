/**
 * Lire le contexte de la requête, et ce qui arrive quand il n'est pas là.
 *
 * Les contrôleurs écrivaient `res.locals.coach as ICoach`, dix-huit fois. Une
 * assertion est une promesse faite au compilateur que rien ne vérifie, et elle
 * ne tient qu'aussi longtemps que chaque route montant un contrôleur monte
 * aussi son garde.
 *
 * Le jour où l'une ne le fait pas, le contrôleur reçoit `undefined`, le cast le
 * masque, et le premier `coach._id` lève un TypeError : un 500 avec une pile
 * d'appels, sur ce qui est en réalité un 403. On vérifie ici que les
 * accesseurs rendent à cet échec ce qu'il est.
 *
 * Ne demande aucune base de données.
 *
 *   npm run verify:guards
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { globalErrorHandler } from '../shared/middleware/errorHandler';
import { coachOf, clientOf } from '../shared/middleware/roles';
import { catchAsync } from '../shared/utils/catchAsync';
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

const main = async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as AddressInfo).port;

  const call = async (path: string) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`);
    return {
      status: r.status,
      body: (await r.json()) as Record<string, string>,
    };
  };

  console.log('\n── avec son garde, le contrôleur lit le contexte');
  {
    const r = await call('/guarded');
    ok('la requête passe', r.status === 200, String(r.status));
    ok('  → et porte le coach', r.body.id === 'abc', JSON.stringify(r.body));
  }

  // L'enjeu : un garde manquant est un défaut d'autorisation, et doit se
  // lire comme tel. Avant, c'était un TypeError sur `undefined._id` — un 500.
  console.log('\n── sans lui, la réponse est un refus, pas un plantage');
  {
    const r = await call('/unguarded');
    ok('un garde manquant donne un 403', r.status === 403, String(r.status));
    ok('  → pas un 500', r.status !== 500, String(r.status));
    ok(
      '  → et dit de quel espace il s’agissait',
      /Espace Coach/.test(r.body.message ?? ''),
      r.body.message ?? '(rien)'
    );
    ok(
      '  → sans pile d’appels qui fuite la cause',
      !/TypeError|undefined/.test(JSON.stringify(r.body)),
      JSON.stringify(r.body).slice(0, 70)
    );
  }
  {
    const r = await call('/unguarded-client');
    ok('le côté client se comporte pareil', r.status === 403, String(r.status));
    ok(
      '  → et nomme son propre espace',
      /Espace Client/.test(r.body.message ?? ''),
      r.body.message ?? '(rien)'
    );
  }

  server.close();
  console.log(
    failures
      ? `\n${failures} écart(s)`
      : '\nUn garde oublié se dit, il ne plante pas.'
  );
  process.exit(failures ? 1 : 0);
};

void main();
