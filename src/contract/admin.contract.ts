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

/**
 * Ce que rend la création d'un coach.
 *
 * Renvoyait les documents `coach` et `user` entiers — donc le `__v`, les
 * dates internes et tous les champs du compte, dont personne ne lisait un
 * seul. Le contrat rend ce que l'écran affiche : qui vient d'être créé.
 */
export const createdCoachPayload = z.object({
  status: z.literal('success'),
  message: z.string(),
  coach: z.object({
    _id: id,
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string(),
  }),
});

export type AdminStatsPayload = z.infer<typeof adminStatsPayload>;
export type AdminCoachPayload = z.infer<typeof adminCoachPayload>;
export type CreatedCoachPayload = z.infer<typeof createdCoachPayload>;
