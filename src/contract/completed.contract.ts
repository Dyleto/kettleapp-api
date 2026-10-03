import { z } from 'zod';
import { id, isoDate, customMetric, vacant } from './primitives';
import { FEEDBACK_TAGS } from '../shared/constants/feedback';

/**
 * Ce que le client a fait sur UNE série.
 *
 * Une clé absente veut dire « non renseigné » — jamais zéro. C'est pour cela
 * qu'aucun champ n'a de valeur par défaut ici : en poser une effacerait la
 * différence entre « j'ai fait zéro » et « je n'ai rien noté ».
 */
export const performedSetPayload = z.object({
  weight: z.number().optional(),
  reps: z.number().optional(),
  duration: z.number().optional(),
});

/** Ce qui a réellement été fait sur un exercice, série par série. */
export const performedPayload = z.object({
  sets: z.array(performedSetPayload),
});

/**
 * Un exercice figé le jour où la séance a été faite.
 *
 * `exercise` reste un objet libre : c'est une copie de ce que le mouvement
 * portait à l'époque, champs d'alors compris. Le contraindre ici rendrait
 * illisible un bilan enregistré avant un changement de modèle — ce qui est
 * exactement ce que l'instantané existe pour empêcher.
 */
export const blockExerciseSnapshotPayload = z.object({
  exercise: z.record(z.string(), z.unknown()),
  order: z.number(),
  sets: z.number().optional(),
  restBetweenSets: z.number().optional(),
  reps: z.number().optional(),
  duration: z.number().optional(),
  customMetric: vacant(customMetric),
  note: z.string().optional(),
  performed: performedPayload.optional(),
});

/**
 * Un bloc figé : ce qui était demandé, et ce qui en a été fait.
 *
 * `type` est une chaîne et non l'énumération des formats : un bilan de l'an
 * dernier peut porter un format qui n'existe plus, et il doit rester lisible.
 */
export const blockSnapshotPayload = z.object({
  type: z.string(),
  label: z.string().optional(),
  order: z.number(),
  notes: z.string().optional(),
  durationMinutes: z.number().optional(),
  intervalMinutes: z.number().optional(),
  /** Les tours prescrits par le coach. */
  rounds: z.number().optional(),
  /** Les tours réellement bouclés — le score, quand le format en a un. */
  performedRounds: z.number().optional(),
  restBetweenRounds: z.number().optional(),
  workDuration: z.number().optional(),
  restDuration: z.number().optional(),
  repsScheme: z.array(z.number()).optional(),
  exercises: z.array(blockExerciseSnapshotPayload),
});

/** Le ressenti d'une séance : une note, et deux compléments facultatifs. */
export const feedbackPayload = z.object({
  effort: z.number(),
  tags: z.array(z.enum(FEEDBACK_TAGS)).optional(),
  note: z.string().optional(),
});

/**
 * L'ancien bilan à cinq axes.
 *
 * Encore lu, plus jamais écrit. Il reste au contrat parce que l'historique en
 * contient : le retirer ferait disparaître de l'écran des bilans que le
 * client a bel et bien remplis.
 */
export const legacyMetricsPayload = z.object({
  stress: z.number(),
  mood: z.number(),
  energy: z.number(),
  sleep: z.number(),
  soreness: z.number(),
});

/**
 * Une séance terminée.
 *
 * Trois identifiants internes ne sortent plus : `clientId` et `programId`,
 * que le demandeur connaît déjà — c'est son historique, ou celui du client
 * qu'il vient de nommer — et le `__v` de Mongoose. Ils partaient avec le
 * document entier, parce que `res.json(history)` envoyait les documents tels
 * quels.
 *
 * `originalSessionId` reste : c'est lui qui relie un bilan à la séance du
 * programme dont il vient.
 */
export const completedSessionPayload = z.object({
  _id: id,
  originalSessionId: id,
  sessionOrder: z.number(),
  /** Le nom que la séance portait ce jour-là, figé comme son rang. */
  sessionName: z.string().optional(),
  blocks: z.array(blockSnapshotPayload),
  coachNotes: z.string().optional(),
  feedback: feedbackPayload.optional(),
  /** @deprecated remplacé par `feedback`. */
  metrics: vacant(legacyMetricsPayload),
  clientNotes: z.string().optional(),
  viewedByCoach: z.boolean(),
  completedAt: isoDate,
  editedAt: isoDate.optional(),
});

/** Ce que rendent `complete` et la correction d'un bilan. */
export const completedWrapperPayload = z.object({
  completed: completedSessionPayload,
});

/** Ce que rend `GET /api/client/history`. */
export const clientHistoryPayload = z.object({
  history: z.array(completedSessionPayload),
});

export type PerformedSetPayload = z.infer<typeof performedSetPayload>;
export type PerformedPayload = z.infer<typeof performedPayload>;
export type BlockExerciseSnapshotPayload = z.infer<
  typeof blockExerciseSnapshotPayload
>;
export type BlockSnapshotPayload = z.infer<typeof blockSnapshotPayload>;
export type FeedbackPayload = z.infer<typeof feedbackPayload>;
export type LegacyMetricsPayload = z.infer<typeof legacyMetricsPayload>;
export type CompletedSessionPayload = z.infer<typeof completedSessionPayload>;
export type CompletedWrapperPayload = z.infer<typeof completedWrapperPayload>;
export type ClientHistoryPayload = z.infer<typeof clientHistoryPayload>;
