import { z } from 'zod';
import { id, isoDate } from './primitives';

/**
 * Les compteurs du tableau de bord d'administration.
 *
 * Des nombres et rien d'autre. Aucun contenu de séance, aucun ressenti,
 * aucun commentaire : c'est ce que la politique de confidentialité annonce,
 * et ce schéma est l'endroit où cette promesse se tient ou se rompt.
 */
export const adminStatsPayload = z.object({
  coachCount: z.number(),
  clientCount: z.number(),
  sessionCount: z.number(),
  sessionTodayCount: z.number(),
  exerciseCount: z.number(),
});

/** Un coach vu depuis l'administration : qui coache combien de personnes. */
export const adminCoachPayload = z.object({
  _id: id,
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string(),
  picture: z.string().optional(),
  clientCount: z.number(),
  exerciseCount: z.number(),
  createdAt: isoDate,
});

/** Qui est, ou devient, coach : ce que l'écran affiche. */
const coachIdentity = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string(),
});

/**
 * Ce que rend l'ouverture d'un compte de coach.
 *
 * Renvoyait les documents `coach` et `user` entiers — donc le `__v`, les
 * dates internes et tous les champs du compte, dont personne ne lisait un
 * seul. Le contrat rend ce que l'écran affiche : qui vient d'être créé.
 *
 * Deux formes, que `status` distingue. `success` : le compte est ouvert,
 * ou le rôle donné à un compte existant (`outcome`). `exists` : rien n'a
 * été écrit, l'adresse est celle d'un compte, et l'écran demande avant de
 * lui donner le rôle. Le `message` a disparu : l'écran composait le sien,
 * et une phrase du serveur ne disait pas lequel des deux cas avait eu lieu.
 */
export const createdCoachPayload = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    outcome: z.enum(['created', 'promoted']),
    coach: coachIdentity.extend({ _id: id }),
  }),
  z.object({
    status: z.literal('exists'),
    account: coachIdentity,
  }),
]);

export type AdminStatsPayload = z.infer<typeof adminStatsPayload>;
export type AdminCoachPayload = z.infer<typeof adminCoachPayload>;
export type CreatedCoachPayload = z.infer<typeof createdCoachPayload>;
