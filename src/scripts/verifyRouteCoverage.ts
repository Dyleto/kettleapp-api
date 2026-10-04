/**
 * Aucune route ne doit lire un corps ou un paramètre sans schéma.
 *
 * La règle du projet dit qu'un contrôleur lisant `req.body` lit quelque chose
 * qui a correspondu à un schéma. Rien ne le vérifiait, et trois routes y
 * échappaient : `POST /auth/google-onetap`, qui passait un jeton Google non
 * validé à `google-auth-library` ; `PUT /client/health-consent`, l'écriture
 * la plus sensible juridiquement de l'application ; et
 * `GET /auth/verify-invite-token`, qui lisait un jeton avec un `as string`.
 *
 * Le contrôle est structurel et non déclaratif : on parcourt la pile des vrais
 * routeurs, et on cherche le middleware `validateRequest` que `validate`
 * renvoie. Une route ajoutée demain sans schéma fait tomber ce script.
 *
 * Ne demande aucune base de données.
 *
 *     npm run verify:routes
 */
import type { Router } from 'express';
import apiRoutes from '../routes';
import authRoutes from '../modules/auth/auth.routes';
import logger from '../shared/utils/logger';

logger.transports.forEach((t) => (t.silent = true));

let okCount = 0;
let failCount = 0;
const ok = (label: string, condition: boolean, proof = '') => {
  if (condition) okCount += 1;
  else failCount += 1;
  console.log(
    `${condition ? 'OK  ' : 'FAIL'}  ${label}${proof ? ' — ' + proof : ''}`
  );
};

interface Found {
  method: string;
  path: string;
  validated: boolean;
}

/**
 * Parcourt un routeur Express et ses routeurs imbriqués.
 *
 * `layer.route` marque un point d'entrée, `layer.handle.stack` un routeur
 * monté. Les types d'Express ne décrivent pas cette pile : elle est interne,
 * et c'est assumé — l'alternative serait de déclarer les routes une seconde
 * fois dans une table, donc de pouvoir oublier la table.
 */
const walk = (router: Router, prefix = ''): Found[] => {
  interface Layer {
    route?: {
      path: string;
      methods: Record<string, boolean>;
      stack: { name?: string }[];
    };
    name?: string;
    handle?: { stack?: Layer[] };
    regexp?: RegExp;
  }
  const stack = (router as unknown as { stack: Layer[] }).stack ?? [];
  const out: Found[] = [];
  for (const layer of stack) {
    if (layer.route) {
      const validated = layer.route.stack.some(
        (s) => s.name === 'validateRequest'
      );
      for (const method of Object.keys(layer.route.methods)) {
        out.push({
          method: method.toUpperCase(),
          path: prefix + layer.route.path,
          validated,
        });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      // Le préfixe du montage n'est pas lisible proprement depuis la pile :
      // il est encodé dans `regexp`. On ne cherche pas à le reconstituer —
      // le chemin relatif suffit à nommer une route dans un rapport.
      out.push(...walk(layer.handle as unknown as Router, prefix));
    }
  }
  return out;
};

const routes = [...walk(authRoutes, '/api/auth'), ...walk(apiRoutes, '/api')];

console.log('\n── les routes qui lisent une entrée');

/**
 * Les routes qui n'ont aucune entrée à façonner, et pourquoi.
 *
 * Une liste, donc quelque chose qu'on peut allonger à tort — mais une liste
 * courte et justifiée vaut mieux qu'une heuristique qui devine si un
 * contrôleur lit `req.body`. Y ajouter une ligne demande de dire pourquoi.
 */
const NO_INPUT = new Set([
  // Détruit la session du porteur du cookie : rien à lire dans le corps.
  'POST /api/auth/logout',
]);

/** Un corps, ou un paramètre de chemin : les deux entrées à façonner. */
const readsInput = (r: Found) =>
  !NO_INPUT.has(`${r.method} ${r.path}`) &&
  (['POST', 'PUT', 'PATCH'].includes(r.method) || r.path.includes(':'));

const withInput = routes.filter(readsInput);
const naked = withInput.filter((r) => !r.validated);

ok(
  `${withInput.length} routes lisent une entrée, et toutes portent un schéma`,
  naked.length === 0,
  naked.length > 0
    ? naked.map((r) => `${r.method} ${r.path}`).join(', ')
    : withInput.map((r) => r.method + ' ' + r.path).join(', ')
);

// Sans ce garde, un parcours qui ne trouverait rien — une pile d'Express
// réorganisée, un import cassé — annoncerait « aucune route nue » et passerait
// pour un vert. C'est exactement le piège qu'on a vu ailleurs aujourd'hui.
ok(
  '  → et le parcours a bien trouvé les routes',
  routes.length >= 25 && withInput.length >= 10,
  `${routes.length} routes, dont ${withInput.length} avec entrée`
);

console.log('\n── les trois qui y échappaient');

for (const [method, path] of [
  ['POST', '/google-onetap'],
  ['PUT', '/health-consent'],
  ['GET', '/verify-invite-token'],
] as const) {
  const found = routes.find(
    (r) => r.method === method && r.path.endsWith(path)
  );
  ok(
    `${method} ${path}`,
    found !== undefined && found.validated,
    found ? (found.validated ? 'validée' : 'SANS SCHÉMA') : 'route introuvable'
  );
}

console.log(`\n${okCount} OK · ${failCount} FAIL`);
process.exit(failCount > 0 ? 1 : 0);
