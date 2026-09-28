import { z } from 'zod';

/**
 * Créer un exercice : un nom, et rien d'obligatoire d'autre.
 *
 * La description et la vidéo s'ajoutent après coup, depuis la fiche. Les
 * exiger à la création ferait de chaque ajout un formulaire, alors que le
 * geste courant est d'écrire un nom au milieu de la construction d'une séance.
 */
export const createExerciseSchema = z.object({
  body: z.object({
    name: z
      .string({ message: 'Le nom est requis' })
      .min(1, 'Le nom est requis'),
    description: z.string().optional(),
    videoUrl: z.string().optional(),
  }),
});

/**
 * Modifier un exercice : tout est facultatif.
 *
 * On envoie ce qui change, pas la fiche entière. Le nom reste contraint à au
 * moins un caractère quand il est présent — un exercice sans nom n'existe pas,
 * même s'il est possible de ne pas y toucher.
 */
export const updateExerciseSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Le nom est requis').optional(),
    description: z.string().optional(),
    videoUrl: z.string().optional(),
  }),
});
