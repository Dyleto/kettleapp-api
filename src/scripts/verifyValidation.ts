/**
 * What validation actually does to a request.
 *
 * It used to judge and forget. `validate` parsed the request, then handed
 * controllers the raw `req.body` — so the parsed, cleaned value was thrown
 * away on every call. Two consequences, both verified before being fixed:
 *
 *   — Extra fields survived. `POST /users` ran `new User(req.body)`, and
 *     since `isAdmin` is declared on the Mongoose schema, any signed-in user
 *     could hand themselves the admin flag. Zod had stripped it; nobody read
 *     the stripped copy.
 *
 *   — Every `.default()` and `.transform()` was dead code. The transform on
 *     `suggestedDays` de-duplicates and sorts the days, and carries a comment
 *     explaining why it belongs there. It had never run.
 *
 * And route parameters were not validated at all: `:id` went to Mongoose as
 * it arrived.
 *
 * Needs no database.
 *
 *   npm run verify:validation
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { globalErrorHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../schemas/paramsSchema';
import { updateProgramSessionsSchema } from '../schemas/programSchema';
import { createUserSchema } from '../schemas/userSchema';
import logger from '../utils/logger';

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

// Each route echoes back exactly what the controller would read.
app.post('/user', validate(createUserSchema), (req, res) =>
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

  // ── An extra field does not reach the controller ──────────────────────
  console.log('\n── what the schema did not ask for does not get through');
  {
    const r = await call('POST', '/user', {
      email: 'pirate@example.com',
      firstName: 'Ann',
      isAdmin: true,
    });
    const body = r.json.body as Record<string, unknown>;
    ok('the request is accepted', r.status === 200, String(r.status));
    ok(
      '  → but `isAdmin` never reaches the controller',
      !('isAdmin' in body),
      JSON.stringify(body)
    );
    ok('  → while the declared fields do', body.email === 'pirate@example.com');
  }

  // ── Transforms and defaults actually run ─────────────────────────────
  console.log('\n── the schema shapes the value, it does not only judge it');
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
      'the days are de-duplicated and sorted',
      JSON.stringify(session.suggestedDays) === '[0,3]',
      JSON.stringify(session.suggestedDays)
    );
    // And what the coach did not set stays unset: zero is a different claim
    // from absent, so the schema no longer invents zeroes.
    const exercise = (
      session.blocks as { exercises: Record<string, unknown>[] }[]
    )[0].exercises[0];
    ok(
      '  → and what was never set stays unset, not zero',
      !('sets' in exercise) && !('reps' in exercise),
      JSON.stringify(exercise)
    );
  }

  // ── Route parameters are checked before any query runs ───────────────
  console.log('\n── an identifier in the URL is checked, not forwarded');
  {
    const good = await call('GET', '/thing/507f1f77bcf86cd799439011');
    ok('a real ObjectId passes', good.status === 200, String(good.status));

    const bad = await call('GET', '/thing/pas-un-id');
    ok('a malformed one is refused', bad.status === 400, String(bad.status));
    const errors = bad.json.errors as { field: string; message: string }[];
    ok(
      '  → and the answer names the field',
      Array.isArray(errors) && errors[0]?.field === 'id',
      JSON.stringify(errors)
    );
  }

  // ── A query string is validated too, without being emptied ───────────
  console.log('\n── the query string keeps what the schema did not describe');
  {
    const r = await call('GET', '/search?q=squat&page=2');
    const query = r.json.query as Record<string, unknown>;
    ok('a valid query passes', r.status === 200, String(r.status));
    ok('  → the described field is there', query.q === 'squat');
    // Express 5 makes `req.query` a getter, so it is merged rather than
    // replaced. The consequence is worth stating: an undescribed parameter
    // survives, and a schema is not a filter for the query string.
    ok(
      '  → and an undescribed one is not dropped',
      query.page === '2',
      JSON.stringify(query)
    );
    const bad = await call('GET', '/search?q=a');
    ok('an invalid query is refused', bad.status === 400, String(bad.status));
  }

  server.close();
  console.log(
    failures ? `\n${failures} écart(s)` : '\nLa validation façonne la requête.'
  );
  process.exit(failures ? 1 : 0);
};

void main();
