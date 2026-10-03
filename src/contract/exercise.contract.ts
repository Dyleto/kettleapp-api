import { z } from 'zod';
import { id, isoDate } from './primitives';

/**
 * Un mouvement de la bibliothèque du coach.
 *
 * `createdBy` sort parce que la bibliothèque appartient au coach et que la
 * fiche le dit. `__v` ne sort pas : c'est un compteur de révision interne à
 * Mongoose, qui n'a jamais eu de raison de voyager.
 */
export const exercisePayload = z.object({
  _id: id,
  name: z.string(),
  description: z.string().optional(),
  videoUrl: z.string().optional(),
  createdBy: id,
  createdAt: isoDate,
  updatedAt: isoDate,
  /**
   * Dans combien de séances du coach l'exercice apparaît.
   *
   * Calculé par l'API, jamais enregistré : c'est ce qui dit quels exercices
   * se suppriment sans casser un programme. Absent sur les réponses qui ne
   * portent qu'un exercice — la fiche n'en a pas besoin.
   */
  usageCount: z.number().optional(),
});

export type ExercisePayload = z.infer<typeof exercisePayload>;
