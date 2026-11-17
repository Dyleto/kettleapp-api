import { Request, Response } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../shared/utils/catchAsync';
import { coachOf } from '../../shared/middleware/roles';
import { respond } from '../../shared/utils/respond';
import { clientTagsPayload, successPayload, tagPayload } from '../../contract';
import {
  createTag,
  deleteTag,
  listTags,
  renameTag,
  setClientTags,
} from './tag.service';
import type { ClientTagsBody, TagBody } from './tag.schema';

/** Les étiquettes du coach : la barre de filtres et la feuille de gestion. */
export const getTags = catchAsync(async (_req: Request, res: Response) => {
  respond(res, 200, z.array(tagPayload), await listTags(coachOf(res)._id));
});

/** « Créer “Sen” » : voir `createTag`. */
export const postTag = catchAsync(async (req: Request, res: Response) => {
  const { name } = req.body as TagBody;
  respond(res, 201, tagPayload, await createTag(coachOf(res)._id, name));
});

/** Renommer : voir `renameTag`. */
export const patchTag = catchAsync(async (req: Request, res: Response) => {
  const { name } = req.body as TagBody;
  const tag = await renameTag(coachOf(res)._id, req.params.id as string, name);
  respond(res, 200, tagPayload, tag);
});

/** Supprimer, et retirer de tous les clients : voir `deleteTag`. */
export const removeTag = catchAsync(async (req: Request, res: Response) => {
  await deleteTag(coachOf(res)._id, req.params.id as string);
  respond(res, 200, successPayload, { status: 'success' });
});

/** « C'est bon » sur la feuille d'un client : voir `setClientTags`. */
export const putClientTags = catchAsync(async (req: Request, res: Response) => {
  const { tagIds } = req.body as ClientTagsBody;
  const result = await setClientTags(
    coachOf(res)._id,
    req.params.clientId as string,
    tagIds
  );
  respond(res, 200, clientTagsPayload, result);
});
