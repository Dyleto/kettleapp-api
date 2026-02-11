import { z } from "zod";

export const createCoachSchema = z.object({
  body: z.object({
    email: z
      .string({ message: "L'email est requis" })
      .email("Format d'email invalide"),
    firstName: z
      .string({ message: "Le prénom est requis" })
      .min(2, "Minimum 2 caractères"),
    lastName: z
      .string({ message: "Le nom est requis" })
      .min(2, "Minimum 2 caractères"),
  }),
});
