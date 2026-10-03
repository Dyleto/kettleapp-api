/**
 * Le contrat de l'API : ce que chaque réponse contient, et rien d'autre.
 *
 * Il existe pour trois raisons, dans cet ordre.
 *
 * D'abord, ce qui sortait n'était pas décidé. `res.json(history)` envoyait
 * des documents Mongoose entiers : `clientId`, `programId`, `__v`, les dates
 * internes. Personne ne les lisait, et ils partaient quand même. Un schéma
 * appliqué à la sortie ne documente pas la réponse, il la façonne — Zod ne
 * garde que les clés déclarées.
 *
 * Ensuite, les types du front étaient une seconde description de la même
 * chose, écrite à la main. Deux descriptions divergent : le front annonçait
 * un `endDate` sur le programme que l'API n'a jamais envoyé, et des `Date` là
 * où arrivent des chaînes. Les types se dérivent maintenant de ces schémas.
 *
 * Enfin, `verif/mock-server.mjs` en est une troisième. Il réimplémente les
 * réponses de l'API pour que le banc tourne sans base : tant qu'il n'est
 * vérifié contre rien, le banc peut rester vert sur des formes que l'API
 * n'envoie plus.
 */
export * from './primitives';
export * from './user.contract';
export * from './exercise.contract';
export * from './program.contract';
export * from './completed.contract';
export * from './coach.contract';
export * from './admin.contract';
