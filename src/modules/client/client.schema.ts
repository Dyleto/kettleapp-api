import { z } from 'zod';
import { FEEDBACK_TAGS } from '../../shared/constants/feedback';

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

/**
 * Ce qu'on accepte à la fin d'une séance.
 *
 * Le ressenti est le seul champ obligatoire, et le `refine` accepte aussi
 * `metrics` — l'ancien bilan à cinq axes — pour ne pas refuser les envois d'une
 * application qui n'aurait pas encore été rechargée. Sans cette tolérance, une
 * séance terminée sur un onglet ouvert depuis la veille serait perdue au
 * moment précis où l'on demande à la personne son effort.
 *
 * `completedAt` ne peut pas être dans le futur : la date se saisit à la main
 * quand la séance a eu lieu un autre jour, et une faute de frappe placerait
 * sinon la séance en tête de l'historique pour toujours.
 */
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

/**
 * Corriger un bilan déjà envoyé.
 *
 * Tout est facultatif : on corrige une charge mal saisie, pas la séance
 * entière. La liste de séries d'un exercice part cependant complète — elle
 * remplace celle enregistrée, et un tableau vide l'efface. C'est l'absence de
 * l'exercice dans le corps qui veut dire « n'y touche pas ».
 */
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

/**
 * L'accord — ou le refus — de partager ce qu'on déclare de son état.
 *
 * C'est l'écriture la plus sensible juridiquement de l'application, et elle
 * n'avait aucun schéma : le contrôleur rattrapait avec un
 * `typeof granted !== 'boolean'` écrit à la main. La règle du projet veut
 * qu'un contrôleur lise ce qui a correspondu à un schéma, et le refus doit
 * être aussi net que l'accord — un `"false"` en chaîne n'est pas un refus,
 * c'est une requête mal formée.
 */
export const setHealthConsentSchema = z.object({
  body: z.object({
    granted: z.boolean({ message: 'Réponse attendue : accepté ou refusé' }),
  }),
});

/**
 * Le corps d'une fin de séance, tel que le schéma l'a façonné.
 *
 * Dérivé et non réécrit : le contrôleur lisait `req.body` en vrac, donc ses
 * champs arrivaient en `unknown` alors que le schéma connaissait déjà leur
 * forme. Mongoose 9, qui ne caste plus un `unknown` vers un champ typé, a
 * rendu l'écart visible — mais c'était déjà une entorse à la règle du projet
 * avant qu'il ne refuse.
 */
export type CompleteSessionBody = z.infer<typeof completeSessionSchema>['body'];

/** Le ressenti, quand il y en a un. */
export type Feedback = NonNullable<CompleteSessionBody['feedback']>;
