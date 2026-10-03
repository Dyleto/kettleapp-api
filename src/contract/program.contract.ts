import { z } from 'zod';
import { id, isoDate, customMetric, vacant } from './primitives';
import { BLOCK_TYPES } from '../models/Session';
import { exercisePayload } from './exercise.contract';

/**
 * Un exercice tel qu'il est prescrit dans un bloc.
 *
 * `exercise` est l'objet entier et non un identifiant : c'est `formatSession`
 * qui fait le remplacement, et c'est ce qui évite au client une requête par
 * mouvement. Le `_id` du sous-document ne sort pas — rien ne le lit, et le
 * schéma de requête ne l'accepte pas non plus.
 */
export const blockExercisePayload = z.object({
  exercise: exercisePayload,
  order: z.number(),
  sets: z.number().optional(),
  restBetweenSets: z.number().optional(),
  reps: z.number().optional(),
  duration: z.number().optional(),
  customMetric: vacant(customMetric),
  /**
   * La consigne du coach pour cet exercice, dans cette séance-là. Distincte
   * de `exercise.description`, qui décrit le mouvement en général.
   */
  note: z.string().optional(),
});

/**
 * Un bloc : un format, et les exercices qu'il enchaîne.
 *
 * Son `_id` sort, et il doit sortir : l'atelier le renvoie tel quel à
 * l'enregistrement. Sans lui, l'API en recréait un à chaque envoi et toute la
 * séance se reconstruisait à l'écran.
 */
export const sessionBlockPayload = z.object({
  _id: id,
  type: z.enum(BLOCK_TYPES as [string, ...string[]]),
  label: z.string().optional(),
  order: z.number(),
  notes: z.string().optional(),
  durationMinutes: z.number().optional(),
  intervalMinutes: z.number().optional(),
  rounds: z.number().optional(),
  restBetweenRounds: z.number().optional(),
  workDuration: z.number().optional(),
  restDuration: z.number().optional(),
  repsScheme: z.array(z.number()).optional(),
  exercises: z.array(blockExercisePayload),
});

/**
 * Une séance du programme, telle que le coach l'a écrite.
 *
 * `programId` ne sort pas. Il sortait — `formatSession` étalait le document
 * entier — et il ne servait à rien : le client sait de quel programme il
 * s'agit, il vient de le demander.
 */
export const sessionPayload = z.object({
  _id: id,
  order: z.number(),
  name: z.string().optional(),
  notes: z.string().optional(),
  /** Lundi = 0. Indicatif : un jour manqué ne crée aucune dette. */
  suggestedDays: z.array(z.number()).optional(),
  blocks: z.array(sessionBlockPayload),
  createdAt: isoDate,
  updatedAt: isoDate,
});

/**
 * Le programme d'un client : une enveloppe, et ses séances.
 *
 * `clientId` ne sort pas. Le client qui demande son programme est celui dont
 * la session l'identifie, et le coach qui l'ouvre vient de nommer son client
 * dans l'URL : le répéter dans la réponse n'informait personne et sortait un
 * identifiant interne de plus.
 */
export const programPayload = z.object({
  _id: id,
  createdAt: isoDate,
  updatedAt: isoDate,
  sessions: z.array(sessionPayload),
});

/** Ce que rend `GET /api/client/program`. */
export const clientProgramPayload = z.object({ program: programPayload });

export type BlockExercisePayload = z.infer<typeof blockExercisePayload>;
export type SessionBlockPayload = z.infer<typeof sessionBlockPayload>;
export type SessionPayload = z.infer<typeof sessionPayload>;
export type ProgramPayload = z.infer<typeof programPayload>;
export type ClientProgramPayload = z.infer<typeof clientProgramPayload>;
