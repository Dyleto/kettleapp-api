/**
 * Le gestionnaire d'erreurs répond, et il répond en JSON.
 *
 * Express décide qu'un middleware traite les erreurs à son arité :
 * `fn.length === 4`. `globalErrorHandler` en déclarait trois, il était donc
 * monté comme un middleware ordinaire et ne tournait jamais. Toutes les
 * erreurs tombaient sur le gestionnaire interne d'Express, qui répond en HTML
 * — et le front analyse du JSON.
 *
 * Rien ne plantait, aucun test n'échouait, et l'API renvoyait le mauvais type
 * de contenu pour chaque erreur qu'elle a jamais produite. C'est exactement le
 * genre de défaut qu'une vérification qui s'exécute attrape et qu'une lecture
 * ne voit pas.
 *
 * Ne demande aucune base de données : le gestionnaire est monté sur une
 * application Express nue.
 *
 *   npm run verify:errors
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { globalErrorHandler } from '../shared/middleware/errorHandler';
import { AppError } from '../shared/utils/AppError';
import { catchAsync } from '../shared/utils/catchAsync';
import logger from '../shared/utils/logger';

let failures = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  if (!cond) failures++;
  console.log(
    `${cond ? 'OK  ' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`
  );
};

// Winston écrit sur la sortie standard, et le compte rendu d'une
// vérification doit rester lisible. Les niveaux eux-mêmes sont couverts par
// le statut de la réponse.
logger.transports.forEach((t) => (t.silent = true));

const app = express();
app.use(express.json());

// Les trois chemins par lesquels une erreur atteint le gestionnaire ici.
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

const main = async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as AddressInfo).port;

  const call = async (path: string) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`);
    const type = (r.headers.get('content-type') ?? '').split(';')[0];
    const raw = await r.text();
    // Une réponse non-JSON est précisément le défaut sous test : l'analyse
    // doit échouer en douceur plutôt que lancer, l'assertion lisant `type`.
    const body = ((): Record<string, unknown> | null => {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    })();
    return { status: r.status, type, body, raw };
  };

  // ── Le gestionnaire tourne, tout simplement ─────────────────────────────
  //
  // C'est tout l'enjeu. Express lit l'arité, l'assertion la lit donc aussi :
  // une régression ici est à un paramètre supprimé, et ne se verrait sinon
  // qu'en production.
  console.log('\n── Express le reconnaît comme gestionnaire d’erreurs');
  ok(
    'le gestionnaire déclare quatre paramètres',
    globalErrorHandler.length === 4,
    `length = ${globalErrorHandler.length}`
  );

  console.log('\n── une erreur répond en JSON, jamais en HTML');
  for (const [label, path] of [
    ['une AppError lancée', '/app-error'],
    ['une erreur lancée de façon synchrone', '/thrown'],
    ['une erreur asynchrone attrapée par catchAsync', '/async'],
  ] as const) {
    const r = await call(path);
    ok(
      `${label} répond en JSON`,
      r.type === 'application/json',
      `${r.type} — ${r.raw.slice(0, 48)}`
    );
    ok(
      '  → et porte un identifiant de requête',
      r.body !== null && 'requestId' in r.body
    );
  }

  // ── Les statuts que l'API promet ───────────────────────────────────────
  console.log('\n── chaque erreur garde son statut');
  {
    const r = await call('/app-error');
    ok('une AppError garde son statut', r.status === 404, String(r.status));
    ok(
      '  → et son message',
      r.body?.message === 'Client introuvable',
      String(r.body?.message)
    );
    ok(
      '  → marquée comme faute du client',
      r.body?.status === 'fail',
      String(r.body?.status)
    );
  }
  {
    const r = await call('/thrown');
    ok('une erreur inattendue est un 500', r.status === 500, String(r.status));
    ok(
      '  → marquée comme erreur serveur',
      r.body?.status === 'error',
      String(r.body?.status)
    );
  }
  {
    const r = await call('/async');
    ok(
      'une AppError asynchrone garde son statut',
      r.status === 403,
      String(r.status)
    );
  }

  // ── Les erreurs Mongoose sont normalisées, et journalisées pour ce
  // qu'elles sont ────────────────────────────────────────────────────────
  //
  // Un CastError est un identifiant mal formé : une faute du client, et un
  // 400. Il était journalisé en niveau erreur avec sa pile d'appels — le
  // journal annonçait un plantage qui n'avait pas eu lieu — puis rétrogradé
  // seulement dans la réponse.
  console.log(
    '\n── un identifiant mal formé est une faute du client, pas un plantage'
  );
  {
    const r = await call('/cast');
    ok('un CastError devient un 400', r.status === 400, String(r.status));
    ok(
      '  → avec un message lisible par le client',
      r.body?.message === 'Ressource introuvable (ID invalide)',
      String(r.body?.message)
    );
    ok(
      '  → et pas une erreur serveur',
      r.body?.status === 'fail',
      String(r.body?.status)
    );
  }

  server.close();
  console.log(
    failures
      ? `\n${failures} écart(s)`
      : '\nLe gestionnaire d’erreurs répond comme promis.'
  );
  process.exit(failures ? 1 : 0);
};

void main();
