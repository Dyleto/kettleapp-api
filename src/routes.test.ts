/**
 * Aucune route ne doit lire un corps ou un paramètre sans schéma.
 *
 * La règle du projet dit qu'un contrôleur lisant `req.body` lit quelque chose
 * qui a correspondu à un schéma. Rien ne le vérifiait, et quatre routes y
 * échappaient : `POST /auth/google-onetap`, qui passait un jeton Google non
 * validé à `google-auth-library` ; `PUT /client/health-consent`, l'écriture la
 * plus sensible juridiquement de l'application ; `GET
 * /auth/verify-invite-token` ; et `POST /coach/generate-invitation`, dont le
 * `req.body.expiresIn || 7` laissait demander un lien valide deux siècles.
 *
 * Le contrôle est structurel et non déclaratif : on parcourt la pile des vrais
 * routeurs et on cherche le middleware `validateRequest` que `validate`
 * renvoie. Une route ajoutée demain sans schéma fait tomber cette suite.
 */
import type { Router } from 'express';
import { beforeAll, describe, expect, it } from 'vitest';
import apiRoutes from './routes';
import authRoutes from './modules/auth/auth.routes';
import logger from './shared/utils/logger';

interface Found {
  method: string;
  path: string;
  validated: boolean;
}

/**
 * Parcourt un routeur Express et ses routeurs imbriqués.
 *
 * `layer.route` marque un point d'entrée, `layer.handle.stack` un routeur
 * monté. Les types d'Express ne décrivent pas cette pile : elle est interne, et
 * c'est assumé — l'alternative serait de déclarer les routes une seconde fois
 * dans une table, donc de pouvoir oublier la table.
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
      out.push(...walk(layer.handle as unknown as Router, prefix));
    }
  }
  return out;
};

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

let routes: Found[] = [];
let withInput: Found[] = [];

beforeAll(() => {
  logger.transports.forEach((t) => (t.silent = true));
  routes = [...walk(authRoutes, '/api/auth'), ...walk(apiRoutes, '/api')];
  withInput = routes.filter(readsInput);
});

describe('la couverture des routes par les schémas', () => {
  it('le parcours trouve bien les routes', () => {
    // Sans ce garde, un parcours qui ne trouverait rien — une pile d'Express
    // réorganisée, un import cassé — annoncerait « aucune route nue » et
    // passerait pour un vert.
    expect(routes.length).toBeGreaterThanOrEqual(25);
    expect(withInput.length).toBeGreaterThanOrEqual(10);
  });

  it('toute route qui lit une entrée porte un schéma', () => {
    const naked = withInput
      .filter((r) => !r.validated)
      .map((r) => `${r.method} ${r.path}`);
    expect(naked).toEqual([]);
  });
});

describe('les quatre qui y échappaient', () => {
  it.each([
    ['POST', '/google-onetap'],
    ['PUT', '/health-consent'],
    ['GET', '/verify-invite-token'],
    ['POST', '/generate-invitation'],
  ])('%s %s', (method, path) => {
    const found = routes.find(
      (r) => r.method === method && r.path.endsWith(path)
    );
    expect(found, 'route introuvable').toBeDefined();
    expect(found?.validated).toBe(true);
  });
});
