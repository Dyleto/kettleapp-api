import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { clientOf, coachOf } from '../../shared/middleware/roles';
import { respond } from '../../shared/utils/respond';
import { completedWrapperPayload } from '../../contract';
import { readReplies, writeReply } from './reply.service';
import type { WriteReplyBody } from './reply.schema';

/**
 * Le coach répond à une séance faite.
 *
 * La séance revient entière, réponses comprises : l'écran remplace sa copie
 * plutôt que de recomposer ce que le serveur a décidé — quelle réponse a été
 * modifiée, laquelle a été ajoutée.
 */
export const writeCoachReply = catchAsync(
  async (req: Request, res: Response) => {
    const completed = await writeReply(
      coachOf(res),
      req.params.id as string,
      req.body as WriteReplyBody
    );
    respond(res, 200, completedWrapperPayload, { completed });
  }
);

/** Le client a lu les réponses de sa séance : voir `readReplies`. */
export const readCoachReplies = catchAsync(
  async (req: Request, res: Response) => {
    const completed = await readReplies(
      clientOf(res)._id,
      req.params.id as string
    );
    respond(res, 200, completedWrapperPayload, { completed });
  }
);
