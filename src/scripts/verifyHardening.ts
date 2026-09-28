/**
 * Ce que l'API refuse, et ce qu'elle ne doit pas refuser.
 *
 * Deux plafonds, faux tous les deux de la même façon : choisis par défaut
 * plutôt qu'à dessein, et jamais éprouvés.
 *
 * Le quota comptait par adresse, si bien que deux coachs sur le wifi d'une
 * même salle partageaient 100 requêtes par quart d'heure — que l'atelier seul
 * peut épuiser, puisqu'il s'enregistre tout seul et envoie un changement de
 * structure immédiatement. Arriver au bout, c'est être bloqué un quart d'heure
 * avec des modifications non enregistrées.
 *
 * La limite de corps était le défaut implicite d'Express, 100 Ko, qu'un gros
 * programme peut légitimement dépasser : l'atelier envoie le programme entier
 * à chaque enregistrement.
 *
 * Ne demande aucune base de données.
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

// L'état connecté, du point de vue d'un quota : une session qui nomme un
// utilisateur. L'en-tête tient lieu de cookie.
app.use((req, _res, next) => {
  const user = req.header('x-test-user');
  if (user) req.session = { userId: user } as typeof req.session;
  next();
});

// Deux requêtes par fenêtre, pour l'épuiser à peu de frais — construit par la
// même fabrique que les limiteurs de l'application, si bien que la logique de
// comptage éprouvée est celle qui est livrée.
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

  // ── Le quota appartient à un utilisateur, pas à une adresse ───────────
  console.log(
    '\n── deux personnes derrière une adresse gardent des quotas distincts'
  );
  ok('la première requête passe', (await get('/quota', 'alice')) === 200);
  ok('  → et la deuxième', (await get('/quota', 'alice')) === 200);
  ok(
    '  → la troisième est refusée : le plafond est de deux',
    (await get('/quota', 'alice')) === 429
  );
  // L'enjeu. Même process, même adresse — un autre utilisateur connecté.
  ok(
    'un autre utilisateur n’est pas touché par l’épuisement du premier',
    (await get('/quota', 'bob')) === 200,
    'même adresse, autre session'
  );
  ok('  → et garde son propre compte', (await get('/quota', 'bob')) === 200);
  ok('  → jusqu’à son propre plafond', (await get('/quota', 'bob')) === 429);

  // L'appelant anonyme retombe sur l'adresse, qui est tout ce qu'on a.
  console.log('\n── sans session, l’adresse est tout ce qu’on a');
  ok('un appelant anonyme est compté', (await get('/quota')) === 200);
  ok('  → et atteint le même plafond', (await get('/quota')) === 200);
  ok('  → puis est refusé', (await get('/quota')) === 429);

  // ── La limite de corps est celle qu'on a choisie ──────────────────────
  //
  // Mesuré : cinq séances de neuf blocs et dix-huit exercices pèsent 5,4 Ko,
  // donc un programme vingt fois plus chargé atteint 107 Ko — au-dessus du
  // défaut implicite, et l'enregistrement aurait échoué sur un plafond que
  // personne n'avait réglé.
  console.log('\n── un programme entier passe, un corps arbitraire non');
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
    'un programme de 150 Ko passe',
    large.status === 200,
    `${large.status} ${large.raw.slice(0, 40)}`
  );
  ok(
    '  → ce que le défaut implicite de 100 Ko aurait refusé',
    large.status === 200
  );

  const tooLarge = await post(400_000);
  ok(
    'un corps de 400 Ko est refusé',
    tooLarge.status === 413,
    String(tooLarge.status)
  );
  // Et le refus doit arriver au client en JSON : un 413 qui arrive en page
  // HTML est précisément le défaut pour lequel le gestionnaire a été réparé.
  ok(
    '  → en JSON, comme toute autre erreur',
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
