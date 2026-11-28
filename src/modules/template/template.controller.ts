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
  duplicateTemplate,
  getOwnTemplate,
  getOwnTemplatePopulated,
  importTemplate,
  replaceTemplateSessions,
  templateFromProgram,
  templateOutput,
  templateRow,
  appendProgramSessions,
} from './template.service';
import type {
  AppendFromProgramBody,
  TemplateFromProgramBody,
} from './template.schema';

// GET /api/coach/templates
//
// Sans les séances : la liste sert à choisir, et le coach choisit sur un nom
// et un volume. Les envoyer toutes rendrait la page du poids de tous ses
// programmes pour afficher trois titres.
export const listTemplates = catchAsync(
  async (_req: Request, res: Response) => {
    const coach = coachOf(res);

    const templates = await ProgramTemplate.find({ coachId: coach._id })
      .select('name sessions importedFor updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    respond(res, 200, templateListPayload, {
      templates: templates.map(templateRow),
    });
  }
);

/**
 * Créer un modèle, sans séance : le coach le nomme, puis l'écrit dans son
 * atelier. Vide, il ne s'importe pas (`importTemplate`) — c'est le seul état
 * où il peut l'être, et il ne dure que le temps de le remplir.
 */
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
      template: templateOutput(template),
    });
  }
);

/**
 * Un modèle entier, séances peuplées : l'atelier en a besoin pour écrire.
 * `getOwnTemplate` borne au coach — le modèle d'un autre est introuvable,
 * et non interdit, pour ne pas confirmer qu'il existe.
 */
export const getTemplate = catchAsync(async (req: Request, res: Response) => {
  const coach = coachOf(res);
  const template = await getOwnTemplatePopulated(
    coach._id,
    req.params.id as string
  );

  respond(res, 200, templateWrapperPayload, {
    template: templateOutput(template),
  });
});

/** Dupliquer un modèle : voir `duplicateTemplate`. */
export const postDuplicate = catchAsync(async (req: Request, res: Response) => {
  const copy = await duplicateTemplate(
    coachOf(res)._id,
    req.params.id as string
  );
  respond(res, 201, templateWrapperPayload, { template: templateOutput(copy) });
});

/** « Enregistrer comme modèle » : voir `templateFromProgram`. */
export const postFromProgram = catchAsync(
  async (req: Request, res: Response) => {
    const { clientId, name, sessionIds } = req.body as TemplateFromProgramBody;
    const template = await templateFromProgram(
      coachOf(res)._id,
      clientId,
      name,
      sessionIds
    );
    respond(res, 201, templateWrapperPayload, {
      template: templateOutput(template),
    });
  }
);

/** « Copier vers un modèle » : voir `appendProgramSessions`. */
export const postSessionsFromProgram = catchAsync(
  async (req: Request, res: Response) => {
    const { clientId, sessionIds } = req.body as AppendFromProgramBody;
    const template = await appendProgramSessions(
      coachOf(res)._id,
      req.params.id as string,
      clientId,
      sessionIds
    );
    respond(res, 200, templateWrapperPayload, {
      template: templateOutput(template),
    });
  }
);

/**
 * Renommer, et rien d'autre : les séances ont leur propre route, comme pour
 * le programme d'un client, pour que le nom tapé ne renvoie pas tout
 * l'atelier.
 */
export const renameTemplate = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const { name } = req.body as { name: string };

    const template = await getOwnTemplate(coach._id, req.params.id as string);
    template.name = name;
    await template.save();
    await template.populate('sessions.blocks.exercises.exerciseId');

    respond(res, 200, templateWrapperPayload, {
      template: templateOutput(template),
    });
  }
);

/**
 * Remplacer les séances d'un modèle par celles de l'atelier : l'état entier
 * et non des modifications, pour que deux envois identiques — l'atelier peut
 * en faire partir deux avant la première réponse — donnent le même modèle.
 */
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
      template: templateOutput(template),
    });
  }
);

/**
 * Supprimer un modèle. Les programmes où il a été importé n'en dépendent
 * pas : l'import en a fait des copies, que rien ne relie au modèle.
 */
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
