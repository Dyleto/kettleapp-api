import { z } from 'zod';
import {
  idParamSchema,
  objectId,
  withClientIdParam,
} from '../../shared/schemas/params.schema';
import { TAG_NAME_MAX, TAGS_PER_COACH_MAX } from './tag.service';

/** Un nom d'étiquette : non vide une fois les espaces retirés, et court. */
const tagNameField = z
  .string()
  .trim()
  .min(1, 'Une étiquette a besoin d’un nom.')
  .max(TAG_NAME_MAX, `${TAG_NAME_MAX} caractères au plus.`);

export const createTagSchema = z.object({
  body: z.object({ name: tagNameField }),
});

export const renameTagSchema = idParamSchema.extend({
  body: z.object({ name: tagNameField }),
});

/** Toutes les étiquettes du client à la fois — une liste vide les retire. */
export const setClientTagsSchema = withClientIdParam(
  z.object({
    tagIds: z
      .array(objectId)
      .max(TAGS_PER_COACH_MAX, 'Trop d’étiquettes à la fois.'),
  })
);

export type TagBody = z.infer<typeof createTagSchema>['body'];
export type ClientTagsBody = z.infer<typeof setClientTagsSchema>['body'];
