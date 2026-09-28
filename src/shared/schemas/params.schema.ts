import { z } from 'zod';

/**
 * Un identifiant dans l'URL.
 *
 * Rien ne validait les paramètres de route : `:id` partait directement chez
 * Mongoose, et un identifiant mal formé revenait en CastError — un 500 dans le
 * journal tant que le gestionnaire d'erreurs n'était pas réparé, et dans tous
 * les cas un aller-retour en base pour une requête qui ne pouvait correspondre
 * à rien.
 *
 * Vingt-quatre caractères hexadécimaux, c'est ce qu'est un ObjectId. Le
 * vérifier ici donne un 400 qui nomme le champ, avant toute requête.
 */
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "L'identifiant n'est pas valide");

/** `:id` — la graphie habituelle. */
export const idParamSchema = z.object({
  params: z.object({ id: objectId }),
});

/**
 * Un corps ET un `:clientId`, pour les routes qui portent les deux.
 *
 * Les schémas Zod ne se fusionnent pas d'eux-mêmes par-dessus la séparation
 * `body` / `params` : une route qui a les deux doit les déclarer ensemble.
 */
export const withClientIdParam = <T extends z.ZodTypeAny>(body: T) =>
  z.object({
    params: z.object({ clientId: objectId }),
    body,
  });
