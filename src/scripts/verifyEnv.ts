/**
 * Vérifie que l'environnement est jugé avant le démarrage.
 *
 * Sans base de données : `validateEnv` ne lit que `process.env`. Ce script
 * existe parce que le garde précédent laissait passer trois choses — un
 * `NODE_ENV` absent, dont dépend l'ouverture de `/dev-login` ; un
 * `SESSION_SECRET` de cinq caractères ; et la valeur d'exemple du fichier
 * `.env.example`, que le contrôle ne connaissait plus.
 *
 *     npm run verify:env
 */
import { devRoutesEnabled, env, validateEnv } from '../shared/config/env';

let okCount = 0;
let failCount = 0;
const ok = (label: string, condition: boolean, proof = '') => {
  if (condition) okCount += 1;
  else failCount += 1;
  console.log(
    `${condition ? 'OK  ' : 'FAIL'}  ${label}${proof ? ' — ' + proof : ''}`
  );
};

/** Un environnement complet et valide, dont on fait varier une seule chose. */
const VALID = {
  NODE_ENV: 'production',
  MONGO_URI: 'mongodb+srv://u:p@cluster0.mongodb.net/db',
  SESSION_SECRET: 'x'.repeat(32),
  GOOGLE_CLIENT_ID: 'un-identifiant-google',
  GOOGLE_CLIENT_SECRET: 'un-secret-google',
  FRONTEND_URL: 'https://kettleapp.fr',
  PORT: '3000',
};

/** Rend le message de refus, ou `null` si l'environnement est accepté. */
const refusal = (
  changes: Record<string, string | undefined>
): string | null => {
  const saved = { ...process.env };
  try {
    for (const key of Object.keys(VALID)) delete process.env[key];
    for (const [key, value] of Object.entries({ ...VALID, ...changes })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      validateEnv();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
};

console.log("\n── ce que l'environnement doit refuser");

const cases: [string, Record<string, string | undefined>, RegExp][] = [
  [
    "un NODE_ENV absent — c'est lui qui ouvre /dev-login",
    { NODE_ENV: undefined },
    /NODE_ENV/,
  ],
  ['un NODE_ENV mal orthographié', { NODE_ENV: 'producton' }, /NODE_ENV/],
  ['un NODE_ENV vide', { NODE_ENV: '' }, /NODE_ENV/],
  [
    'un SESSION_SECRET trop court',
    { SESSION_SECRET: 'court' },
    /32 caractères/,
  ],
  [
    "le SESSION_SECRET du fichier d'exemple",
    { SESSION_SECRET: 'your-super-secret-session-key' },
    /valeur d'exemple/,
  ],
  [
    "l'ancienne valeur d'exemple, gardée dans la liste",
    { SESSION_SECRET: 'your_secret_key' },
    /valeur d'exemple/,
  ],
  [
    "l'identifiant Google laissé à sa valeur d'exemple",
    { GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID_HERE' },
    /valeur d'exemple/,
  ],
  [
    'un MONGO_URI qui ne pointe pas sur MongoDB',
    { MONGO_URI: 'postgres://u:p@host/db' },
    /mongodb/,
  ],
  ['un MONGO_URI absent', { MONGO_URI: undefined }, /MONGO_URI/],
  [
    "une FRONTEND_URL qui n'est pas une URL",
    { FRONTEND_URL: 'kettleapp' },
    /FRONTEND_URL/,
  ],
  [
    'une FRONTEND_URL absente — la liste CORS en dépend',
    { FRONTEND_URL: undefined },
    /FRONTEND_URL/,
  ],
  ["un PORT qui n'est pas un nombre", { PORT: 'abc' }, /PORT/],
  ['un PORT négatif', { PORT: '-1' }, /PORT/],
];

for (const [label, changes, pattern] of cases) {
  const message = refusal(changes);
  ok(label, message !== null && pattern.test(message), message ?? 'accepté');
}

console.log("\n── ce qu'il doit accepter");

ok('un environnement complet', refusal({}) === null, refusal({}) ?? '');
ok(
  '  → et un PORT absent prend 3000',
  refusal({ PORT: undefined }) === null && env().PORT === 3000,
  String(env().PORT)
);
for (const value of ['development', 'test', 'production']) {
  ok(`  → NODE_ENV=${value}`, refusal({ NODE_ENV: value }) === null);
}

console.log('\n── le garde de /dev-login');

// La vraie fonction, celle qu'`auth.routes.ts` appelle. Une copie de la
// condition ne prouverait rien : saboter le fichier de routes ne faisait
// tomber aucune assertion tant que l'assertion éprouvait sa propre copie.
ok('monté en développement', devRoutesEnabled('development'));
ok('  → et pour les tests', devRoutesEnabled('test'));
ok('  → fermé en production', !devRoutesEnabled('production'));
ok('  → fermé sans NODE_ENV du tout', !devRoutesEnabled(undefined));
ok('  → fermé sur une chaîne vide', !devRoutesEnabled(''));
ok('  → fermé sur une faute de frappe', !devRoutesEnabled('producton'));

console.log('\n── lire la configuration avant de la valider');

{
  const saved = { ...process.env };
  for (const key of Object.keys(VALID)) delete process.env[key];
  let thrown = '';
  try {
    // Le module garde la dernière valeur analysée : on ne peut pas revenir à
    // l'état « jamais validé » depuis ici. On vérifie donc le message, qui est
    // la seule chose qu'un appelant verrait.
    validateEnv();
  } catch (error) {
    thrown = error instanceof Error ? error.message : '';
  } finally {
    Object.assign(process.env, saved);
  }
  ok(
    'un environnement vide nomme ce qui manque, ligne par ligne',
    /NODE_ENV/.test(thrown) &&
      /MONGO_URI/.test(thrown) &&
      /SESSION_SECRET/.test(thrown),
    thrown.split('\n').length - 1 + ' variable(s) nommée(s)'
  );
}

console.log(`\n${okCount} OK · ${failCount} FAIL`);
process.exit(failCount > 0 ? 1 : 0);
