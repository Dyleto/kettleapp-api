// Clés stables du ressenti de fin de séance.
// Elles sont stockées telles quelles en base : le libellé affiché vit côté
// front, on peut le retraduire sans toucher aux données déjà enregistrées.
export const FEEDBACK_TAGS = [
  'poor_sleep',
  'pain',
  'stress',
  'fatigue',
  'illness',
  'great_shape',
] as const;

export type FeedbackTag = (typeof FEEDBACK_TAGS)[number];
