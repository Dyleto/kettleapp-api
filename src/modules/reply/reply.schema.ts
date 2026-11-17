import { z } from 'zod';
import { objectId } from '../../shared/schemas/params.schema';
import { REACTIONS, REPLY_TEXT_MAX } from '../../shared/constants/reply';

/**
 * Ce que le coach peut envoyer en réponse.
 *
 * `null` est accepté, et c'est voulu : il efface (voir `ReplyDraft`). Une
 * requête qui ne porte ni l'un ni l'autre est refusée — elle ne dit rien, et
 * c'est un défaut de l'appelant qu'un 200 masquerait.
 */
export const writeReplySchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      reaction: z.enum(REACTIONS).nullable().optional(),
      text: z
        .string()
        .max(REPLY_TEXT_MAX, 'La réponse est trop longue.')
        .nullable()
        .optional(),
    })
    .refine((body) => body.reaction !== undefined || body.text !== undefined, {
      message: 'Une réponse porte une réaction, un texte, ou les deux.',
    }),
});

export type WriteReplyBody = z.infer<typeof writeReplySchema>['body'];
