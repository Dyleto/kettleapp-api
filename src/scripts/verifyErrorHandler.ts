/**
 * The error handler answers, and answers in JSON.
 *
 * Express decides whether a middleware handles errors by its arity:
 * `fn.length === 4`. `globalErrorHandler` declared three parameters, so it
 * was mounted as an ordinary middleware and never ran. Every error fell
 * through to Express's built-in handler, which replies in HTML — and the
 * front end parses JSON.
 *
 * Nothing crashed, no test failed, and the API had been answering the wrong
 * content type for every error it ever produced. That is exactly the kind of
 * defect a running check catches and a reading does not.
 *
 * Needs no database: the handler is mounted on a bare Express app.
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

// Winston writes to stdout, and a verification's output has to stay
// readable. The levels themselves are covered by the response's status.
logger.transports.forEach((t) => (t.silent = true));

const app = express();
app.use(express.json());

// The three ways an error reaches the handler in this codebase.
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
    // A non-JSON answer is the very defect under test, so parsing has to
    // fail softly rather than throw: the assertion reads `type` and reports.
    const body = ((): Record<string, unknown> | null => {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    })();
    return { status: r.status, type, body, raw };
  };

  // ── The handler runs at all ─────────────────────────────────────────────
  //
  // This is the whole point. Express reads the arity, so the assertion reads
  // it too: a regression here is one deleted parameter away, and it would
  // otherwise only show in production.
  console.log('\n── Express recognises it as an error handler');
  ok(
    'the handler declares four parameters',
    globalErrorHandler.length === 4,
    `length = ${globalErrorHandler.length}`
  );

  console.log('\n── an error answers in JSON, never in HTML');
  for (const [label, path] of [
    ['a thrown AppError', '/app-error'],
    ['an error thrown synchronously', '/thrown'],
    ['an async error caught by catchAsync', '/async'],
  ] as const) {
    const r = await call(path);
    ok(
      `${label} answers in JSON`,
      r.type === 'application/json',
      `${r.type} — ${r.raw.slice(0, 48)}`
    );
    ok(
      '  → and carries a request id',
      r.body !== null && 'requestId' in r.body
    );
  }

  // ── The status codes the API promises ──────────────────────────────────
  console.log('\n── each error keeps its own status');
  {
    const r = await call('/app-error');
    ok('an AppError keeps its status', r.status === 404, String(r.status));
    ok(
      '  → and its message',
      r.body?.message === 'Client introuvable',
      String(r.body?.message)
    );
    ok(
      '  → marked as a client failure',
      r.body?.status === 'fail',
      String(r.body?.status)
    );
  }
  {
    const r = await call('/thrown');
    ok('an unexpected error is a 500', r.status === 500, String(r.status));
    ok(
      '  → marked as a server error',
      r.body?.status === 'error',
      String(r.body?.status)
    );
  }
  {
    const r = await call('/async');
    ok(
      'an async AppError keeps its status',
      r.status === 403,
      String(r.status)
    );
  }

  // ── Mongoose failures are normalised, and logged for what they are ─────
  //
  // A CastError is a malformed id: a client mistake, and a 400. It used to be
  // logged at error level with a stack trace — the logs claimed a crash that
  // never happened — and only then downgraded in the response.
  console.log('\n── a malformed id is a client mistake, not a crash');
  {
    const r = await call('/cast');
    ok('a CastError becomes a 400', r.status === 400, String(r.status));
    ok(
      '  → with a message the client can read',
      r.body?.message === 'Ressource introuvable (ID invalide)',
      String(r.body?.message)
    );
    ok(
      '  → and not a server error',
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
