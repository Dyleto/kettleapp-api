import { z } from 'zod';

/**
 * Ce sans quoi le serveur ne peut pas fonctionner, décrit une seule fois.
 *
 * Lu au démarrage et non à l'usage : une variable manquante ne se découvre
 * sinon qu'au premier appel qui en a besoin — donc en production, sur une
 * route au hasard, sous la forme d'une erreur qui ne dit pas son nom.
 *
 * En Zod comme le reste du projet, et pour la même raison : une description
 * écrite deux fois — la liste des noms d'un côté, les contrôles de l'autre —
 * finit par divergir. C'est arrivé ici. Le garde cherchait un
 * `SESSION_SECRET` laissé à `your_secret_key`, alors que `.env.example`
 * proposait `your-super-secret-session-key` depuis longtemps : copier le
 * fichier d'exemple tel quel passait le contrôle.
 */
const PLACEHOLDERS = [
  'your_secret_key',
  'your-super-secret-session-key',
  'GOOGLE_CLIENT_ID_HERE',
  'GOOGLE_CLIENT_SECRET_HERE',
  'changeme',
];

const notPlaceholder = (label: string) =>
  z
    .string()
    .min(1, { message: `${label} est requis` })
    .refine((value) => !PLACEHOLDERS.includes(value), {
      message: `${label} est resté à sa valeur d'exemple`,
    });

const schema = z.object({
  /**
   * Exigé, et sans valeur par défaut.
   *
   * `/api/auth/dev-login` n'est monté que si `NODE_ENV !== 'production'` :
   * une variable absente, ou écrite `producton`, ouvrait donc en production
   * une route de connexion sans mot de passe. Le défaut qui aurait l'air
   * prudent — « development » — est précisément celui qui ouvre la porte.
   */
  NODE_ENV: z.enum(['development', 'production', 'test'], {
    message: 'NODE_ENV doit valoir development, production ou test',
  }),

  MONGO_URI: z
    .string({ message: 'MONGO_URI est requis' })
    .min(1, { message: 'MONGO_URI est requis' })
    .refine((value) => /^mongodb(\+srv)?:\/\//.test(value), {
      message: 'MONGO_URI doit commencer par mongodb:// ou mongodb+srv://',
    }),

  /**
   * Trente-deux caractères au moins.
   *
   * Le contrôle précédent ne refusait qu'une valeur d'exemple nommément :
   * un secret de cinq caractères passait. Il signe les cookies de session de
   * tout le monde.
   */
  SESSION_SECRET: notPlaceholder('SESSION_SECRET').refine(
    (value) => value.length >= 32,
    { message: 'SESSION_SECRET doit faire au moins 32 caractères' }
  ),

  GOOGLE_CLIENT_ID: notPlaceholder('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: notPlaceholder('GOOGLE_CLIENT_SECRET'),

  /**
   * Exigé, parce que l'absence était pire que l'échec : la liste CORS
   * retombait sur `http://localhost:5173`, donc en production le navigateur
   * refusait toutes les requêtes du vrai domaine sans que rien ne le dise.
   */
  FRONTEND_URL: z.url({ message: 'FRONTEND_URL doit être une URL valide' }),

  PORT: z.coerce
    .number({ message: 'PORT doit être un nombre' })
    .int({ message: 'PORT doit être un entier' })
    .positive({ message: 'PORT doit être positif' })
    .default(3000),

  /** Ne sert qu'à `/dev-login`, qui n'existe pas en production. */
  DEV_LOGIN_USER_ID: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

/**
 * Les routes de confort sont-elles ouvertes ?
 *
 * Exportée plutôt qu'écrite dans `auth.routes.ts`, parce que son test la
 * recopiait : saboter la condition du fichier de routes ne faisait tomber
 * aucune assertion, puisque l'assertion éprouvait une copie. Un test qui
 * duplique le mécanisme n'éprouve pas le mécanisme.
 *
 * Le test est positif : ce qui n'est pas nommément un environnement de
 * travail reste fermé, y compris une variable absente ou vide.
 *
 * Prend `nodeEnv` sans valeur par défaut, et l'appelant lui passe
 * `process.env.NODE_ENV`. Avec un paramètre par défaut, passer `undefined`
 * explicitement le déclenchait : le cas « la variable est absente » était donc
 * inexprimable, et l'assertion qui prétendait le couvrir ne passait que
 * lorsque l'environnement d'exécution n'avait pas la variable. Vitest l'a
 * montré en la posant à `test`, comme il le fait toujours.
 */
export const devRoutesEnabled = (nodeEnv: string | undefined): boolean =>
  ['development', 'test'].includes(nodeEnv ?? '');

let parsed: Env | null = null;

/**
 * Vérifier l'environnement avant de démarrer, et garder ce qui en sort.
 *
 * Rend la valeur analysée au lieu de se contenter de lever : les appelants
 * lisaient `process.env.SESSION_SECRET!`, c'est-à-dire une assertion de type
 * sur une variable dont rien ne garantissait la présence à cet endroit-là.
 */
export const validateEnv = (): Env => {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `  ${issue.path.join('.') || '(racine)'} : ${issue.message}`
      )
      .join('\n');
    throw new Error(`Environnement invalide :\n${details}`);
  }
  parsed = result.data;
  return parsed;
};

/**
 * La configuration validée, pour le reste de l'application.
 *
 * Une fonction et non une constante de module : `dotenv.config()` tourne
 * dans `index.ts` avant `validateEnv()`, et une constante évaluée à
 * l'import lirait un environnement encore vide.
 */
export const env = (): Env => {
  if (!parsed) {
    throw new Error(
      'validateEnv() doit être appelé avant de lire la configuration'
    );
  }
  return parsed;
};
