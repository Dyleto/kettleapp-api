import { z } from 'zod';

/**
 * Ce qu'il faut pour créer un coach.
 *
 * Seule l'adresse est exigée : le nom et le prénom viendront de Google à la
 * première connexion, et les réclamer ici obligerait l'administrateur à les
 * saisir pour rien — ou à les saisir faux.
 */
export const createCoachSchema = z.object({
  body: z.object({
    email: z
      .string({ message: "L'email est requis" })
      .email("Format d'email invalide"),
    firstName: z
      .string({ message: 'Le prénom est requis' })
      .min(2, 'Minimum 2 caractères'),
    lastName: z
      .string({ message: 'Le nom est requis' })
      .min(2, 'Minimum 2 caractères'),
  }),
});
