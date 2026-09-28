import { z } from 'zod';

export const googleAuthSchema = z.object({
  body: z.object({
    code: z.string({ message: "Le code d'autorisation Google est requis" }),
    redirectUri: z.url({
      message: "L'URI de redirection doit être une URL valide",
    }),
    invitationToken: z.string().optional(),
  }),
});
