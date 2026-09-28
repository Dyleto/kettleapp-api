import { z } from 'zod';

/**
 * Ce que le front renvoie au retour de Google.
 *
 * `redirectUri` fait partie du corps et non d'une constante serveur parce que
 * le front connaît son propre domaine, qui diffère entre les environnements.
 * Google exige qu'elle soit identique à l'aller et au retour, au caractère
 * près.
 */
export const googleAuthSchema = z.object({
  body: z.object({
    code: z.string({ message: "Le code d'autorisation Google est requis" }),
    redirectUri: z.url({
      message: "L'URI de redirection doit être une URL valide",
    }),
    invitationToken: z.string().optional(),
  }),
});
