import { z } from 'zod';
import { FEEDBACK_TAGS } from '../constants/feedback';

// Legacy : ancien bilan en 5 axes. Encore accepté le temps que le front
// bascule sur `feedback`, jamais exigé.
const metricsSchema = z.object({
  stress: z.number().int().min(1).max(5),
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  sleep: z.number().int().min(1).max(5),
  soreness: z.number().int().min(1).max(5),
});

const feedbackSchema = z.object({
  effort: z.number().int().min(1).max(5),
  tags: z.array(z.enum(FEEDBACK_TAGS)).max(FEEDBACK_TAGS.length).optional(),
  note: z.string().trim().max(2000).optional(),
});

// Ce que le client a fait sur une série. Une clé absente veut dire « non
// renseignée » — jamais zéro.
const performedSetSchema = z.object({
  weight: z.number().min(0).max(10000).optional(),
  reps: z.number().min(0).max(10000).optional(),
  duration: z.number().min(0).max(100000).optional(),
});

// La liste remplace intégralement le réalisé de cet exercice : `[]` l'efface.
// Plus de protocole « null efface, clé absente ne touche pas » — il portait
// une valeur par exercice, il ne saurait pas dire quelle série corriger.
const performedEntrySchema = z.object({
  blockOrder: z.number().int().min(0),
  exerciseOrder: z.number().int().min(0),
  sets: z.array(performedSetSchema).max(50),
});

const performedSchema = z.array(performedEntrySchema).max(500);

// Les tours bouclés d'un bloc qui se compte en tours — le score d'un AMRAP.
// Borné haut : personne ne boucle mille tours, et un nombre absurde en base
// fausserait toute comparaison avec les séances précédentes.
const roundsDoneSchema = z
  .array(
    z.object({
      blockOrder: z.number().int().min(0),
      rounds: z.number().int().min(0).max(999),
    })
  )
  .max(50);

const pastDate = z.coerce.date().refine((date) => date <= new Date(), {
  message: 'La date de complétion ne peut pas être dans le futur',
});

export const completeSessionSchema = z.object({
  params: z.object({
    sessionId: z.string().min(1),
  }),
  body: z
    .object({
      feedback: feedbackSchema.optional(),
      metrics: metricsSchema.optional(),
      performed: performedSchema.optional(),
      roundsDone: roundsDoneSchema.optional(),
      clientNotes: z.string().max(5000).optional(),
      completedAt: pastDate.optional(),
    })
    .refine(
      (body) => body.feedback !== undefined || body.metrics !== undefined,
      {
        message: 'Le ressenti de fin de séance est obligatoire',
        path: ['feedback'],
      }
    ),
});

export const updateCompletedSessionSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z
    .object({
      feedback: feedbackSchema.optional(),
      performed: performedSchema.optional(),
      roundsDone: roundsDoneSchema.optional(),
      clientNotes: z.string().max(5000).optional(),
      completedAt: pastDate.optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'Aucune modification fournie',
    }),
});
