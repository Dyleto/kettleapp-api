import { z } from "zod";
import { BLOCK_TYPES } from "../models/Session";

const blockExerciseSchema = z.object({
  exerciseId: z.string().min(1),
  order: z.number().int().min(1),
  sets: z.number().int().min(0).optional().default(0),
  restBetweenSets: z.number().min(0).optional().default(0),
  reps: z.number().int().min(0).optional().default(0),
  duration: z.number().min(0).optional().default(0),
  customMetric: z
    .object({
      value: z.number(),
      unit: z.string().min(1).max(20),
    })
    .optional(),
  // La consigne propre à cette pose de l'exercice. Plus courte que celle du
  // bloc : c'est un rappel — « épaule droite » — pas un paragraphe.
  note: z.string().max(500).optional(),
});

const sessionBlockSchema = z.object({
  _id: z.string().optional(),
  type: z.enum(BLOCK_TYPES as [string, ...string[]]),
  label: z.string().max(100).optional(),
  order: z.number().int().min(1),
  notes: z.string().max(1000).optional(),
  durationMinutes: z.number().int().min(1).max(180).optional(),
  intervalMinutes: z.number().int().min(1).max(60).optional(),
  rounds: z.number().int().min(1).max(100).optional(),
  restBetweenRounds: z.number().min(0).max(600).optional(),
  workDuration: z.number().int().min(1).max(3600).optional(),
  restDuration: z.number().int().min(0).max(3600).optional(),
  repsScheme: z.array(z.number().int().min(1)).max(30).optional(),
  exercises: z.array(blockExerciseSchema).max(30),
});

const sessionInputSchema = z.object({
  _id: z.string().optional(),
  order: z.number().int().min(1),
  notes: z.string().max(1000).optional(),
  // Lundi = 0. On dédoublonne et on trie ici plutôt qu'à l'affichage : la
  // liste est lue par deux clients (l'atelier du coach, la semaine du client)
  // et aucun des deux n'a de raison de la remettre en ordre.
  suggestedDays: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .optional()
    .transform((days) =>
      days === undefined ? undefined : [...new Set(days)].sort((a, b) => a - b),
    ),
  blocks: z.array(sessionBlockSchema).max(20),
});

export const updateProgramSessionsSchema = z.object({
  body: z.object({
    sessions: z.array(sessionInputSchema).max(30),
  }),
});
