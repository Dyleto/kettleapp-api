import { z } from "zod";

export const createUserSchema = z.object({
  body: z.object({
    email: z
      .string({ message: "L'email est requis" })
      .email("L'adresse email n'est pas valide"),

    firstName: z
      .string()
      .min(2, "Le prénom doit faire au moins 2 caractères")
      .optional(),

    lastName: z
      .string()
      .min(2, "Le nom doit faire au moins 2 caractères")
      .optional(),
  }),
});
