import { z } from 'zod';

/**
 * Un prénom ou un nom saisi par l'administrateur : facultatif, et vide vaut
 * absent. Un champ laissé blanc arrive en chaîne vide ; l'enregistrer
 * telle quelle écrirait « » sur la ligne du coach, à la place du nom que
 * Google donnera à la première connexion.
 */
const optionalName = z
  .string()
  .trim()
  .max(60, 'Soixante caractères au plus')
  .optional()
  .transform((value) => value || undefined);

/**
 * Ce qu'il faut pour ouvrir un compte de coach.
 *
 * Seule l'adresse est exigée : le nom et le prénom viendront de Google à la
 * première connexion. Le schéma réclamait les deux, deux caractères au
 * moins, alors que ce commentaire disait déjà le contraire — et « Lu » ou
 * « Bo » ne passaient pas.
 *
 * L'adresse est ramenée en minuscules, sans espaces, dès le schéma : le
 * modèle l'enregistre ainsi, et le service compare la même chose que ce
 * qui est rangé sans dépendre des transformations que Mongoose applique, ou
 * non, à un filtre.
 */
export const createCoachSchema = z.object({
  body: z.object({
    email: z
      .string({ message: "L'adresse est requise" })
      .trim()
      .toLowerCase()
      .email("Cette adresse n'est pas valide"),
    firstName: optionalName,
    lastName: optionalName,
    promote: z.boolean().optional(),
  }),
});
