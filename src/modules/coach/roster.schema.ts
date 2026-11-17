import { z } from 'zod';

/**
 * Le début de la semaine du coach, tel que son écran le compte.
 *
 * Une date ISO avec son décalage — « 2026-11-16T00:00:00+01:00 » : c'est
 * son minuit à lui qui compte, et le serveur n'a aucun autre moyen de le
 * connaître. Absente, la semaine commence le lundi à minuit UTC.
 */
export const clientsQuerySchema = z.object({
  query: z.object({
    weekStart: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
  }),
});

export type ClientsQuery = z.infer<typeof clientsQuerySchema>['query'];
