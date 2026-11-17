import { z } from 'zod';
import { objectId } from '../../shared/schemas/params.schema';
import { VIEWED_MAX } from './inbox.service';

/**
 * « À lire » par défaut, « Déjà lues » sur demande.
 *
 * Une valeur inconnue est refusée plutôt que ramenée au défaut : un écran
 * qui demande `?state=lu` et reçoit le fil non lu afficherait l'un pour
 * l'autre sans que rien ne le dise.
 */
export const inboxQuerySchema = z.object({
  query: z.object({
    state: z.enum(['unread', 'read']).default('unread'),
  }),
});

/** Une ou plusieurs séances, et l'état voulu. */
export const markViewedSchema = z.object({
  body: z.object({
    ids: z
      .array(objectId)
      .min(1, 'Aucune séance à marquer.')
      .max(VIEWED_MAX, `Pas plus de ${VIEWED_MAX} séances à la fois.`),
    viewed: z.boolean(),
  }),
});

export type InboxQuery = z.infer<typeof inboxQuerySchema>['query'];
export type MarkViewedBody = z.infer<typeof markViewedSchema>['body'];
