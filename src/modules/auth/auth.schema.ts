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

/**
 * Le jeton que Google One Tap remet au front.
 *
 * Cette route n'avait aucun schéma, contrairement à sa voisine
 * `/google-callback` : `credential` partait tel quel dans
 * `verifyGoogleCredential`, donc dans `google-auth-library`, qui attend une
 * chaîne. Un objet ou un tableau y produisait un comportement non défini sur
 * la route la plus sensible de l'application.
 */
export const googleOneTapSchema = z.object({
  body: z.object({
    credential: z
      .string({ message: 'Le jeton Google est requis' })
      .min(1, { message: 'Le jeton Google est requis' }),
  }),
});

/**
 * Le jeton d'invitation qu'on vérifie avant d'afficher le nom du coach.
 *
 * Il arrive par la requête et non par le corps : le front ouvre cette page
 * depuis un lien. Le contrôleur le lisait avec un `as string` suivi d'un
 * `if (!token)` — ce que le schéma dit mieux, et une fois.
 */
export const verifyInviteTokenSchema = z.object({
  query: z.object({
    token: z
      .string({ message: "Le jeton d'invitation est requis" })
      .min(1, { message: "Le jeton d'invitation est requis" }),
  }),
});
