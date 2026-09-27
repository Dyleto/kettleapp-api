import { z } from 'zod';

export const createExerciseSchema = z.object({
  body: z.object({
    name: z
      .string({ message: 'Le nom est requis' })
      .min(1, 'Le nom est requis'),
    description: z.string().optional(),
    videoUrl: z.string().optional(),
  }),
});

export const updateExerciseSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Le nom est requis').optional(),
    description: z.string().optional(),
    videoUrl: z.string().optional(),
  }),
});
