import { z } from 'zod';
import { objectId } from '../../shared/schemas/params.schema';

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

/**
 * La connexion de confort, qui n'existe qu'en développement.
 *
 * Elle lisait `req.body.userId` sans schéma et le passait à `findById` : un
 * objet y produisait une erreur de cast, donc un 500. Aucune porte ouverte —
 * `findById` n'accepte pas d'opérateur — mais la règle du projet ne fait pas
 * d'exception pour une route de confort, et c'est Vitest qui l'a montrée :
 * sous `NODE_ENV=test` la route est montée, alors qu'elle ne l'était pas sous
 * le ts-node du script de vérification.
 */
export const devLoginSchema = z.object({
  body: z.object({
    userId: objectId.optional(),
  }),
});
