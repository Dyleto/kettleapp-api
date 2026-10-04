import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { AppError } from '../../shared/utils/AppError';
import type {
  CompleteSessionBody,
  UpdateCompletedSessionBody,
} from './client.schema';
import { clientOf } from '../../shared/middleware/roles';
import Program from '../../models/Program';
import Session from '../../models/Session';
import CompletedSession from '../../models/CompletedSession';
import { getOrCreate } from '../program/program.service';
import logger from '../../shared/utils/logger';
import {
  formatSession,
  PopulatedSession,
} from '../../shared/utils/sessionFormatter';
import { HEALTH_CONSENT_VERSION } from '../../shared/constants/consent';
import {
  filterFeedback,
  filterComment,
  CARRIES_HEALTH_DATA,
} from './healthConsent.service';
import { applyPerformed, applyRoundsDone } from './completedSession.service';
import { isValidObjectId } from 'mongoose';
import { respond } from '../../shared/utils/respond';
import {
  clientProgramPayload,
  clientHistoryPayload,
  completedWrapperPayload,
  healthConsentPayload,
} from '../../contract';
import { z } from 'zod';

// GET /api/client/program
export const getProgram = catchAsync(async (req: Request, res: Response) => {
  const client = clientOf(res);

  const program = await getOrCreate(client._id);

  const sessions = await Session.find({ programId: program._id })
    .sort({ order: 1 })
    .populate('blocks.exercises.exerciseId')
    .lean();

  respond(res, 200, clientProgramPayload, {
    program: {
      ...program.toObject(),
      sessions: (sessions as unknown as PopulatedSession[]).map(formatSession),
    },
  });
});

// POST /api/client/sessions/:sessionId/complete
export const completeSession = catchAsync(
  async (req: Request, res: Response) => {
    const client = clientOf(res);
    const { sessionId } = req.params;
    // Typé depuis le schéma : `validate` a déjà écrit dans `req.body` la
    // valeur qui lui a correspondu, et la lire en vrac jetait ce qu'il avait
    // établi.
    const {
      feedback,
      metrics,
      performed,
      roundsDone,
      clientNotes,
      completedAt,
    } = req.body as CompleteSessionBody;
    const rid = req.requestId ?? '?';

    logger.info(`[${rid}] completeSession: start`, {
      clientId: client._id,
      sessionId,
    });

    const program = await Program.findOne({ clientId: client._id });
    if (!program) {
      logger.warn(`[${rid}] completeSession: program not found`, {
        clientId: client._id,
      });
      throw new AppError('Programme introuvable', 404);
    }

    const session = await Session.findOne({
      _id: sessionId,
      programId: program._id,
    })
      .populate('blocks.exercises.exerciseId')
      .lean();

    if (!session) {
      logger.warn(`[${rid}] completeSession: session not found`, {
        clientId: client._id,
        sessionId,
        programId: program._id,
      });
      throw new AppError('Séance introuvable', 404);
    }

    // La prescription est recalculée ici, côté serveur, à partir de la séance
    // du coach. Le client n'y touche pas : il n'ajoute que ce qu'il a fait.
    const formatted = formatSession(session as unknown as PopulatedSession);
    // Deux passes, deux portées : le réalisé des séries appartient aux
    // exercices, le nombre de tours bouclés appartient au bloc.
    const blocks = applyRoundsDone(
      applyPerformed(formatted.blocks, performed),
      roundsDone
    );

    const completed = await CompletedSession.create({
      clientId: client._id,
      programId: program._id,
      originalSessionId: session._id,
      sessionOrder: session.order,
      sessionName: session.name,
      blocks,
      coachNotes: session.notes,
      ...(feedback ? { feedback: filterFeedback(feedback, client) } : {}),
      ...(metrics ? { metrics } : {}),
      clientNotes: filterComment(clientNotes, client),
      ...(completedAt ? { completedAt: new Date(completedAt) } : {}),
    });

    logger.info(`[${rid}] completeSession: success`, {
      clientId: client._id,
      sessionId,
      completedId: completed._id,
    });
    respond(res, 201, completedWrapperPayload, { completed });
  }
);

// GET /api/client/history
export const getHistory = catchAsync(async (req: Request, res: Response) => {
  const client = clientOf(res);

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);

  const history = await CompletedSession.find({ clientId: client._id })
    .sort({ completedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  respond(res, 200, clientHistoryPayload, { history });
});

// PATCH /api/client/sessions/completed/:id
// Corriger un bilan déjà envoyé : le ressenti, les notes, la date, et ce qui
// a réellement été fait. Toujours ouvert, sans fenêtre de temps.
export const updateCompletedSession = catchAsync(
  async (req: Request, res: Response) => {
    const client = clientOf(res);
    const { id } = req.params;
    const { feedback, performed, roundsDone, clientNotes, completedAt } =
      req.body as UpdateCompletedSessionBody;
    const rid = req.requestId ?? '?';

    if (!isValidObjectId(id)) throw new AppError('Bilan introuvable', 404);

    const completed = await CompletedSession.findOne({
      _id: id,
      clientId: client._id,
    });

    if (!completed) {
      logger.warn(`[${rid}] updateCompletedSession: not found`, {
        clientId: client._id,
        completedId: id,
      });
      throw new AppError('Bilan introuvable', 404);
    }

    if (feedback !== undefined)
      completed.set('feedback', filterFeedback(feedback, client));
    if (clientNotes !== undefined)
      completed.clientNotes = filterComment(clientNotes, client);
    if (completedAt !== undefined)
      completed.completedAt = new Date(completedAt);

    if (performed !== undefined || roundsDone !== undefined) {
      // On repart du snapshot stocké et on ne réécrit que le réalisé :
      // la prescription enregistrée le jour de la séance reste intacte.
      const blocks = applyRoundsDone(
        applyPerformed(completed.toObject().blocks, performed),
        roundsDone
      );
      completed.set('blocks', blocks);
    }

    completed.editedAt = new Date();
    // Une correction remet le bilan dans la pile du coach.
    completed.viewedByCoach = false;

    await completed.save();

    logger.info(`[${rid}] updateCompletedSession: success`, {
      clientId: client._id,
      completedId: completed._id,
    });
    respond(res, 200, completedWrapperPayload, { completed });
  }
);

// PUT /api/client/health-consent
//
// Le client décide de partager ou non son ressenti. Les deux réponses sont
// enregistrées : un refus est une décision, pas une absence de décision, et
// c'est ce qui évite de reposer la question à chaque visite.
export const setHealthConsent = catchAsync(
  async (req: Request, res: Response) => {
    const client = clientOf(res);
    // `granted` est un booléen parce que `setHealthConsentSchema` l'exige :
    // le `typeof granted !== 'boolean'` qui vivait ici disait la même chose
    // une seconde fois, et à un endroit où la règle du projet ne le veut pas.
    const { granted } = req.body as { granted: boolean };
    const rid = req.requestId ?? '?';

    client.healthConsent = {
      granted,
      decidedAt: new Date(),
      version: HEALTH_CONSENT_VERSION,
    };
    await client.save();

    // Retirer son accord ne vaut rien si ce qui a été collecté reste en base.
    // Les étiquettes et les commentaires déjà enregistrés partent ; l'effort,
    // les charges et les séances ne sont pas concernés.
    let cleared = 0;
    if (!granted) {
      const { modifiedCount } = await CompletedSession.updateMany(
        { clientId: client._id, ...CARRIES_HEALTH_DATA },
        { $unset: { 'feedback.tags': '', clientNotes: '' } }
      );
      cleared = modifiedCount;
    }

    logger.info(`[${rid}] setHealthConsent: recorded`, {
      clientId: client._id,
      granted,
      version: HEALTH_CONSENT_VERSION,
      purgedSessions: cleared,
    });

    respond(res, 200, z.object({ healthConsent: healthConsentPayload }), {
      healthConsent: client.healthConsent,
    });
  }
);
