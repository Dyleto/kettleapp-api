import { defineConfig } from 'vitest/config';

/**
 * Ce qui éprouve l'API sans base de données.
 *
 * Neuf scripts `verify:*` tenaient ce rôle, et chacun portait sa propre copie
 * d'un `ok(label, condition)` : 1 865 lignes dont neuf harnais identiques. Un
 * coureur de tests les remplace, et il apporte ce qu'aucune de ces copies
 * n'avait — l'isolement entre cas, une API asynchrone, et un rapport d'échec
 * qui montre l'écart au lieu de le résumer.
 *
 * C'est son absence qui a laissé passer le défaut de `verify:copy` : un
 * `await` sur un `catchAsync` qui rend `void`, donc seize assertions mesurant
 * un état vide, dont cinq vertes à tort.
 *
 * `environment: 'node'` et non jsdom : rien ici ne touche à un navigateur.
 * Les suites qui exigent un vrai MongoDB restent dehors — voir
 * `verify:copy` dans `CLAUDE.md`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    reporters: ['dot'],
    // Les suites qui montent une application Express écoutent sur un port
    // éphémère. En parallèle, deux d'entre elles se marchaient dessus sur
    // les variables d'environnement, qu'elles modifient pour de bon.
    fileParallelism: false,
  },
});
