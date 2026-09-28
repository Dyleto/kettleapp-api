/**
 * Reading the request's context, and what happens when it is not there.
 *
 * Controllers wrote `res.locals.coach as ICoach`, eighteen times. The
 * assertion is a promise to the compiler that nothing checks, and it holds
 * only as long as every route that mounts a controller also mounts its guard.
 *
 * The day one does not, the controller gets `undefined`, the cast hides it,
 * and the first `coach._id` throws a TypeError: a 500 with a stack trace, on
 * what is really a 403. This checks that the accessors turn that back into
 * what it is.
 *
 * Needs no database.
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

// A route whose guard ran: `res.locals.coach` is there, as in production.
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

// The same controller, mounted without its guard — the mistake this is for.
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

  console.log('\n── with its guard, the controller reads the context');
  {
    const r = await call('/guarded');
    ok('the request goes through', r.status === 200, String(r.status));
    ok(
      '  → and carries the coach',
      r.body.id === 'abc',
      JSON.stringify(r.body)
    );
  }

  // The point: a missing guard is an authorisation failure, and it has to
  // read as one. Before, this was a TypeError on `undefined._id` — a 500.
  console.log('\n── without it, the answer is a refusal, not a crash');
  {
    const r = await call('/unguarded');
    ok('a missing guard gives a 403', r.status === 403, String(r.status));
    ok('  → not a 500', r.status !== 500, String(r.status));
    ok(
      '  → and says which space it was about',
      /Espace Coach/.test(r.body.message ?? ''),
      r.body.message ?? '(rien)'
    );
    ok(
      '  → with no stack trace leaking the cause',
      !/TypeError|undefined/.test(JSON.stringify(r.body)),
      JSON.stringify(r.body).slice(0, 70)
    );
  }
  {
    const r = await call('/unguarded-client');
    ok('the client side behaves the same', r.status === 403, String(r.status));
    ok(
      '  → and names its own space',
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
