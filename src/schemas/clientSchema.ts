import { z } from "zod";

const metricsSchema = z.object({
  stress: z.number().int().min(1).max(5),
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  sleep: z.number().int().min(1).max(5),
  soreness: z.number().int().min(1).max(5),
});

export const completeSessionSchema = z.object({
  params: z.object({
    sessionId: z.string().min(1),
  }),
  body: z.object({
    metrics: metricsSchema,
    clientNotes: z.string().optional(),
  }),
});
