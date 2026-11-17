import { Request, Response } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../shared/utils/catchAsync';
import { coachOf } from '../../shared/middleware/roles';
import { respond } from '../../shared/utils/respond';
import {
  clientRowPayload,
  clientDetailsPayload,
  completedSessionPayload,
  successPayload,
} from '../../contract';
import {
  clientDetails,
  clientHistory,
  listClients,
  markHistoryViewed,
} from './roster.service';

/**
 * La liste des clients du coach.
 *
 * Ce contrôleur portait les deux cents lignes de l'agrégation, et avec elles
 * deux décisions que rien n'éprouvait — le lien de quel coach, et ce qu'est
 * un ressenti absent. Elles vivent dans `roster.service`, où elles se
 * testent sans base.
 */
export const getClients = catchAsync(async (_req: Request, res: Response) => {
  const clients = await listClients(coachOf(res)._id);
  respond(res, 200, z.array(clientRowPayload), clients);
});

/** L'atelier d'un client : voir `clientDetails`. */
export const getClientDetails = catchAsync(
  async (req: Request, res: Response) => {
    const details = await clientDetails(
      coachOf(res)._id,
      req.params.id as string
    );
    respond(res, 200, clientDetailsPayload, details);
  }
);

/** Une page d'historique : voir `historyWindow` pour ses bornes. */
export const getClientHistory = catchAsync(
  async (req: Request, res: Response) => {
    const history = await clientHistory(
      coachOf(res)._id,
      req.params.id as string,
      req.query
    );
    respond(res, 200, z.array(completedSessionPayload), history);
  }
);

/** Éteindre les pastilles d'un client : voir `markHistoryViewed`. */
export const markHistoryAsViewed = catchAsync(
  async (req: Request, res: Response) => {
    await markHistoryViewed(coachOf(res)._id, req.params.id as string);
    respond(res, 200, successPayload, { status: 'success' });
  }
);
