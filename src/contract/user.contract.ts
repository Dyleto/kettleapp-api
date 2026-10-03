import { z } from 'zod';
import { id, isoDate } from './primitives';

/**
 * La décision du client sur le partage de son ressenti.
 *
 * `version` est celle du texte auquel il a répondu : le client la compare à
 * la version en vigueur pour savoir si la question se repose.
 */
export const healthConsentPayload = z.object({
  granted: z.boolean(),
  decidedAt: isoDate,
  version: z.string(),
});

/**
 * Le compte connecté.
 *
 * Les trois rôles sont des booléens : un même compte est souvent coach ET
 * client — un coach s'écrit ses propres séances.
 *
 * Ce que le contrat tient à l'écart : le hachage de session, les dates de
 * création du document, le `__v` de Mongoose. Rien de tout cela n'intéresse
 * un écran, et ce qui ne sort pas ne peut pas fuir.
 */
export const userPayload = z.object({
  id,
  email: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  picture: z.string().optional(),
  isAdmin: z.boolean(),
  isCoach: z.boolean(),
  isClient: z.boolean(),
  healthConsent: healthConsentPayload.nullable(),
  needsHealthConsent: z.boolean(),
});

/** Ce que rendent la connexion, `me` et la connexion de développement. */
export const authPayload = z.object({
  status: z.literal('success'),
  user: userPayload,
});

/**
 * Ce qu'un lien d'invitation révèle avant toute connexion.
 *
 * Le prénom et le nom du coach, rien de plus : c'est une page publique, et
 * quiconque devine un jeton ne doit pas y apprendre son adresse e-mail.
 */
export const inviteCheckPayload = z.object({
  valid: z.literal(true),
  coach: z.object({
    id,
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    picture: z.string().optional(),
  }),
});

/** Une réponse qui n'a qu'un message à donner — déconnexion, suppression. */
export const messagePayload = z.object({ message: z.string() });

/** Une réponse qui n'a qu'un acquittement à donner. */
export const successPayload = z.object({ status: z.literal('success') });

export type HealthConsentPayload = z.infer<typeof healthConsentPayload>;
export type UserPayload = z.infer<typeof userPayload>;
export type AuthPayload = z.infer<typeof authPayload>;
export type InviteCheckPayload = z.infer<typeof inviteCheckPayload>;
export type MessagePayload = z.infer<typeof messagePayload>;
export type SuccessPayload = z.infer<typeof successPayload>;
