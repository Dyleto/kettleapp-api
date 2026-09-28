/**
 * Le message d'une valeur attrapée, quelle qu'elle soit.
 *
 * Une promesse rejetée peut porter n'importe quoi — une Error, une chaîne,
 * `undefined`. Lire `error.message` sur cette valeur est une supposition qui
 * se lit comme une certitude, et c'est `undefined` qui finit dans le journal
 * au moment précis où l'on aurait eu besoin de savoir.
 */
export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
