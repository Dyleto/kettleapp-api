import { z } from 'zod';
import { BLOCK_TYPES } from '../../models/Session';

/**
 * Pas de `.default(0)` sur ce que le coach peut simplement ne pas avoir réglé.
 *
 * Zéro et absent sont deux affirmations différentes — « zéro répétition »
 * n'est pas « aucune répétition prescrite » — et le code le dit déjà des
 * valeurs réalisées : une clé manquante veut dire « pas renseigné », jamais
 * zéro. Ces défauts n'étaient inoffensifs que parce qu'ils ne tournaient
 * pas : la valeur validée était jetée. Maintenant qu'elle est réécrite, ils
 * rempliraient la base de zéros que personne n'a tapés.
 */
const blockExerciseSchema = z.object({
  exerciseId: z.string().min(1),
  order: z.number().int().min(1),
  sets: z.number().int().min(0).optional(),
  restBetweenSets: z.number().min(0).optional(),
  reps: z.number().int().min(0).optional(),
  duration: z.number().min(0).optional(),
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
  // Le nom libre de la séance. Court par nature — « Full body A », pas une
  // phrase : c'est un titre de rail et de carte, lu à côté de son rang.
  name: z.string().max(60).optional(),
  notes: z.string().max(1000).optional(),
  // Lundi = 0. On dédoublonne et on trie ici plutôt qu'à l'affichage : la
  // liste est lue par deux clients (l'atelier du coach, la semaine du client)
  // et aucun des deux n'a de raison de la remettre en ordre.
  suggestedDays: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .optional()
    .transform((days) =>
      days === undefined ? undefined : [...new Set(days)].sort((a, b) => a - b)
    ),
  blocks: z.array(sessionBlockSchema).max(20),
});

/**
 * Le programme entier, tel que l'atelier l'envoie.
 *
 * Ce n'est pas une liste de modifications mais l'état complet : ce qui n'y
 * figure plus a été supprimé. Les plafonds — trente séances, vingt blocs,
 * trente exercices — ne sont pas des limites de produit mais de dégât : ils
 * bornent ce qu'un appel forgé peut faire écrire, bien au-delà de ce qu'un
 * coach construit réellement.
 */
export const updateProgramSessionsSchema = z.object({
  body: z.object({
    sessions: z.array(sessionInputSchema).max(30),
  }),
});

/**
 * Une séance telle qu'elle arrive — décrite une seule fois.
 *
 * Le contrôleur portait son propre `SessionInput` écrit à la main au milieu
 * d'une fonction, listant les mêmes champs avec `blocks?: unknown`. Deux
 * descriptions d'une même charge utile divergent en silence : le schéma gagne
 * un champ, le type non, et rien ne le dit.
 */
export type SessionInput = z.infer<typeof sessionInputSchema>;

/**
 * Copier une séance chez un autre client.
 *
 * Rien du contenu ne transite : seulement de quoi désigner la séance source.
 * Le serveur la relit dans la base, ce qui évite qu'un appel forgé n'écrive
 * un programme qu'il n'aurait pas le droit de lire.
 */
export const copySessionSchema = z.object({
  body: z.object({
    sourceClientId: z.string().min(1),
    sourceSessionId: z.string().min(1),
  }),
});
