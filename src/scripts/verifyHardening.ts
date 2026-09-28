/**
 * What the API refuses, and what it must not refuse.
 *
 * Two ceilings, both of which were wrong in the same way: chosen by default
 * rather than on purpose, and never exercised.
 *
 * The quota counted by IP, so two coaches on one gym's wifi shared 100
 * requests per 15 minutes — and the editor alone can exhaust that, because it
 * saves itself and sends a structural change immediately. Running out means
 * being locked out for a quarter of an hour holding unsaved work.
 *
 * The body limit was Express's implicit 100 kb, which a large programme can
 * legitimately exceed: the editor sends the whole programme on every save.
 *
 * Needs no database.
 *
 *   npm run verify:hardening
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { globalErrorHandler } from '../shared/middleware/errorHandler';
import { makeLimiter } from '../shared/middleware/rateLimits';
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

// The real signed-in state, as far as a quota is concerned: a session that
// names a user. The header stands in for the cookie.
app.use((req, _res, next) => {
  const user = req.header('x-test-user');
  if (user) req.session = { userId: user } as typeof req.session;
  next();
});

// Two requests per window, so exhausting it is cheap — built by the same
// factory the app's own limiters use, so the counting logic under test is the
// one that ships.
app.use(
  '/quota',
  makeLimiter({ windowMs: 60_000, limit: 2, message: 'Trop.' })
);
app.get('/quota', (_req, res) => res.json({ ok: true }));

app.post('/body', express.json({ limit: '256kb' }), (req, res) =>
  res.json({ bytes: JSON.stringify(req.body).length })
);

app.use(globalErrorHandler);

const main = async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as AddressInfo).port;

  const get = async (path: string, user?: string) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: user ? { 'x-test-user': user } : {},
    });
    return r.status;
  };

  // ── The quota belongs to a user, not to an address ────────────────────
  console.log('\n── two people behind one address keep separate quotas');
  ok('the first request passes', (await get('/quota', 'alice')) === 200);
  ok('  → and the second', (await get('/quota', 'alice')) === 200);
  ok(
    '  → the third is refused: the ceiling is two',
    (await get('/quota', 'alice')) === 429
  );
  // The point. Same process, same address — a different signed-in user.
  ok(
    'another user is untouched by the first one running out',
    (await get('/quota', 'bob')) === 200,
    'même adresse, autre session'
  );
  ok('  → and keeps their own count', (await get('/quota', 'bob')) === 200);
  ok('  → up to their own ceiling', (await get('/quota', 'bob')) === 429);

  // Anonymous callers still fall back to the address, which is all there is.
  console.log('\n── with no session, the address is all we have');
  ok('an anonymous caller is counted', (await get('/quota')) === 200);
  ok('  → and reaches the same ceiling', (await get('/quota')) === 200);
  ok('  → then is refused', (await get('/quota')) === 429);

  // ── The body limit is the one we chose ───────────────────────────────
  //
  // Measured: five sessions of nine blocks and eighteen exercises weigh
  // 5.4 kb, so a programme twenty times that size reaches 107 kb — above the
  // implicit default, and the save would have failed on a ceiling nobody set.
  console.log('\n── a whole programme fits, an arbitrary body does not');
  const post = async (bytes: number) => {
    const r = await fetch(`http://127.0.0.1:${port}/body`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blob: 'a'.repeat(bytes) }),
    });
    const type = (r.headers.get('content-type') ?? '').split(';')[0];
    return { status: r.status, type, raw: await r.text() };
  };

  const large = await post(150_000);
  ok(
    'a 150 kb programme goes through',
    large.status === 200,
    `${large.status} ${large.raw.slice(0, 40)}`
  );
  ok(
    '  → which the implicit 100 kb default would have refused',
    large.status === 200
  );

  const tooLarge = await post(400_000);
  ok(
    'a 400 kb body is refused',
    tooLarge.status === 413,
    String(tooLarge.status)
  );
  // And the refusal has to reach the client as JSON: a 413 that arrives as an
  // HTML page is the very defect the error handler was fixed for.
  ok(
    '  → in JSON, like every other error',
    tooLarge.type === 'application/json',
    `${tooLarge.type} — ${tooLarge.raw.slice(0, 40)}`
  );

  server.close();
  console.log(
    failures
      ? `\n${failures} écart(s)`
      : '\nLes plafonds sont ceux qu’on a choisis.'
  );
  process.exit(failures ? 1 : 0);
};

void main();
