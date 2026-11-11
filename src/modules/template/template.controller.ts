import { Request, Response } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../shared/utils/catchAsync';
import { coachOf } from '../../shared/middleware/roles';
import { respond } from '../../shared/utils/respond';
import logger from '../../shared/utils/logger';
import ProgramTemplate from '../../models/ProgramTemplate';
import {
  templateListPayload,
  templateWrapperPayload,
  sessionPayload,
} from '../../contract';
import {
  formatSession,
  PopulatedSession,
} from '../../shared/utils/sessionFormatter';
import { getAuthorizedClient } from '../coach/coach.service';
import {
  getOwnTemplate,
  getOwnTemplatePopulated,
  importTemplate,
  replaceTemplateSessions,
} from './template.service';
import type { IProgramTemplate } from '../../models/ProgramTemplate';

/**
 * Un modèle tel qu'il sort, ses séances mises en forme.
 *
 * `formatSession` est celui du programme d'un client : les séances d'un
 * modèle ont la même forme, c'est ce qui permet au même atelier de les
 * éditer.
 */
const payloadOf = (template: IProgramTemplate) => ({
  _id: template._id,
  name: template.name,
  sessions: (template.sessions as unknown as PopulatedSession[]).map(
    formatSession
  ),
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
});

// GET /api/coach/templates
//
// Sans les séances : la liste sert à choisir, et le coach choisit sur un nom
// et un volume. Les envoyer toutes rendrait la page du poids de tous ses
// programmes pour afficher trois titres.
export const listTemplates = catchAsync(
  async (_req: Request, res: Response) => {
    const coach = coachOf(res);

    const templates = await ProgramTemplate.find({ coachId: coach._id })
      .select('name sessions updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    respond(res, 200, templateListPayload, {
      templates: templates.map((template) => ({
        _id: template._id,
        name: template.name,
        sessionCount: template.sessions?.length ?? 0,
        updatedAt: template.updatedAt,
      })),
    });
  }
);

// POST /api/coach/templates
export const createTemplate = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const { name } = req.body as { name: string };

    const template = await ProgramTemplate.create({
      coachId: coach._id,
      name,
      sessions: [],
    });

    logger.info(`[${req.requestId ?? '?'}] createTemplate: créé`, {
      coachId: coach._id,
      templateId: template._id,
    });

    respond(res, 201, templateWrapperPayload, {
      template: payloadOf(template),
    });
  }
);

// GET /api/coach/templates/:id
export const getTemplate = catchAsync(async (req: Request, res: Response) => {
  const coach = coachOf(res);
  const template = await getOwnTemplatePopulated(
    coach._id,
    req.params.id as string
  );

  respond(res, 200, templateWrapperPayload, { template: payloadOf(template) });
});

// PATCH /api/coach/templates/:id
export const renameTemplate = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const { name } = req.body as { name: string };

    const template = await getOwnTemplate(coach._id, req.params.id as string);
    template.name = name;
    await template.save();
    await template.populate('sessions.blocks.exercises.exerciseId');

    respond(res, 200, templateWrapperPayload, {
      template: payloadOf(template),
    });
  }
);

// PUT /api/coach/templates/:id/sessions
export const updateTemplateSessions = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const { sessions } = req.body as { sessions: never[] };

    const template = await replaceTemplateSessions(
      coach._id,
      req.params.id as string,
      sessions
    );

    respond(res, 200, templateWrapperPayload, {
      template: payloadOf(template),
    });
  }
);

// DELETE /api/coach/templates/:id
export const deleteTemplate = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const template = await getOwnTemplate(coach._id, req.params.id as string);
    await template.deleteOne();

    logger.info(`[${req.requestId ?? '?'}] deleteTemplate: supprimé`, {
      coachId: coach._id,
      templateId: template._id,
    });

    res.status(204).send();
  }
);

// POST /api/coach/clients/:clientId/program/import
//
// Remplace le programme du client par le modèle. L'avertissement — « il y a
// déjà un programme, il va être écrasé » — appartient à l'écran : c'est lui
// qui sait ce que le coach regarde, et le serveur qui reçoit cet appel a
// reçu une décision, pas une question.
export const importIntoClient = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const { templateId } = req.body as { templateId: string };
    const rid = req.requestId ?? '?';

    const client = await getAuthorizedClient(
      coach._id,
      req.params.clientId as string
    );
    const saved = await importTemplate(coach._id, client._id, templateId, rid);

    logger.info(`[${rid}] importIntoClient: programme remplacé`, {
      coachId: coach._id,
      clientId: client._id,
      templateId,
      savedCount: saved.length,
    });

    respond(
      res,
      200,
      z.array(sessionPayload),
      (saved as unknown as PopulatedSession[]).map(formatSession)
    );
  }
);
