/**
 * Ce qui doit arrêter le démarrage.
 *
 * Le garde précédent laissait passer trois choses : un `NODE_ENV` absent —
 * dont dépend l'ouverture de `/dev-login`, et le défaut qui aurait l'air
 * prudent est celui qui ouvre la porte —, un `SESSION_SECRET` de cinq
 * caractères, et la valeur d'exemple du `.env.example`, que le contrôle ne
 * connaissait plus depuis qu'elle avait changé.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { devRoutesEnabled, env, validateEnv } from './env';

/** Un environnement complet et valide, dont on ne fait varier qu'une chose. */
const VALID = {
  NODE_ENV: 'production',
  MONGO_URI: 'mongodb+srv://u:p@cluster0.mongodb.net/db',
  SESSION_SECRET: 'x'.repeat(32),
  GOOGLE_CLIENT_ID: 'un-identifiant-google',
  GOOGLE_CLIENT_SECRET: 'un-secret-google',
  FRONTEND_URL: 'https://kettleapp.fr',
  PORT: '3000',
};

const saved = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, saved);
});

/** Pose l'environnement d'essai, avec les écarts demandés. */
const given = (changes: Record<string, string | undefined> = {}) => {
  for (const key of Object.keys(VALID)) delete process.env[key];
  for (const [key, value] of Object.entries({ ...VALID, ...changes })) {
    if (value !== undefined) process.env[key] = value;
  }
};

describe('ce que l’environnement refuse', () => {
  it.each([
    [
      'un NODE_ENV absent, dont dépend /dev-login',
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
      { MONGO_URI: 'postgres://u:p@h/d' },
      /mongodb/,
    ],
    ['un MONGO_URI absent', { MONGO_URI: undefined }, /MONGO_URI/],
    [
      "une FRONTEND_URL qui n'est pas une URL",
      { FRONTEND_URL: 'kettleapp' },
      /FRONTEND_URL/,
    ],
    [
      'une FRONTEND_URL absente, dont dépend la liste CORS',
      { FRONTEND_URL: undefined },
      /FRONTEND_URL/,
    ],
    ["un PORT qui n'est pas un nombre", { PORT: 'abc' }, /PORT/],
    ['un PORT négatif', { PORT: '-1' }, /PORT/],
  ])('%s', (_label, changes, pattern) => {
    given(changes);
    expect(() => validateEnv()).toThrow(pattern);
  });

  it('nomme tout ce qui manque, et non le premier venu', () => {
    for (const key of Object.keys(VALID)) delete process.env[key];
    // Un démarrage raté doit se réparer en une fois : une variable à la fois
    // demanderait six déploiements.
    expect(() => validateEnv()).toThrow(
      /NODE_ENV[\s\S]*MONGO_URI[\s\S]*SESSION_SECRET/
    );
  });
});

describe('ce qu’il accepte', () => {
  it('un environnement complet', () => {
    given();
    expect(() => validateEnv()).not.toThrow();
  });

  it('un PORT absent prend 3000', () => {
    given({ PORT: undefined });
    expect(validateEnv().PORT).toBe(3000);
  });

  it.each(['development', 'test', 'production'])('NODE_ENV=%s', (value) => {
    given({ NODE_ENV: value });
    expect(validateEnv().NODE_ENV).toBe(value);
  });

  it('et rend la configuration à qui la redemande', () => {
    given();
    validateEnv();
    expect(env().FRONTEND_URL).toBe('https://kettleapp.fr');
  });
});

describe('les routes de confort', () => {
  // La vraie fonction, celle qu'`auth.routes` appelle. Une copie de la
  // condition ne prouverait rien : saboter le fichier de routes ne faisait
  // tomber aucune assertion tant que l'assertion éprouvait sa propre copie.
  it.each([
    ['development', true],
    ['test', true],
    ['production', false],
    ['producton', false],
    ['', false],
  ])('NODE_ENV=%s → %s', (value, expected) => {
    expect(devRoutesEnabled(value)).toBe(expected);
  });

  it('restent fermées quand la variable est absente', () => {
    // Exprimable seulement parce que la fonction n'a plus de paramètre par
    // défaut : avec lui, passer `undefined` relisait `process.env.NODE_ENV`,
    // que ce coureur pose à `test`.
    expect(devRoutesEnabled(undefined)).toBe(false);
  });
});
