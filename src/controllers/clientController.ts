import { Request, Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../utils/AppError';
import { IClient } from '../models/Client';
import Program from '../models/Program';
import Session from '../models/Session';
import CompletedSession from '../models/CompletedSession';
import { getOrCreate } from '../services/programService';
import logger from '../utils/logger';
import { formatSession, PopulatedSession } from '../utils/sessionFormatter';
import { HEALTH_CONSENT_VERSION } from '../constants/consent';
import { applyPerformed } from '../services/completedSessionService';
import { isValidObjectId } from 'mongoose';

// GET /api/client/program
export const getProgram = catchAsync(async (req: Request, res: Response) => {
  const client = res.locals.client as IClient;

  const program = await getOrCreate(client._id);

  const sessions = await Session.find({ programId: program._id })
    .sort({ order: 1 })
    .populate('blocks.exercises.exerciseId')
    .lean();

  res.status(200).json({
    program: {
      ...program.toObject(),
      sessions: (sessions as unknown as PopulatedSession[]).map(formatSession),
    },
  });
});

/**
 * Le client a-t-il accepté qu'on collecte ses données de santé ?
 *
 * Un accord donné à une version antérieure du texte ne vaut pas pour la
 * version en vigueur : la question se repose, et en attendant la réponse on
 * s'en tient au plus prudent.
 */
const partageAutorise = (client: IClient): boolean =>
  client.healthConsent?.granted === true &&
  client.healthConsent.version === HEALTH_CONSENT_VERSION;

/**
 * Ne garde du ressenti que ce qu'on a le droit de garder.
 *
 * `effort` est une mesure d'entraînement : c'est avec elle que le coach règle
 * la charge, elle reste. Les étiquettes — douleur, maladie, sommeil — sont des
 * données de santé : sans consentement explicite et à jour, on ne les écrit
 * pas. Pas « on les cache au coach » : on ne les collecte pas.
 *
 * Le filtre est ici et pas seulement dans l'interface. Une case cachée à
 * l'écran reste envoyable à la main, et c'est le serveur qui répond de ce
 * qu'il écrit.
 */
const filtrerRessenti = (feedback: unknown, client: IClient): unknown => {
  if (!feedback || typeof feedback !== 'object') return feedback;
  if (partageAutorise(client)) return feedback;

  const { tags, note, ...reste } = feedback as Record<string, unknown>;
  void tags;
  void note;
  return reste;
};

/**
 * Le commentaire libre tombe sous la même règle.
 *
 * « J'ai mal au genou depuis mardi » est une donnée de santé, que le champ
 * s'appelle « douleur » ou « commentaire ». On ne peut pas trier au cas par
 * cas, donc on ne collecte pas.
 */
const filtrerCommentaire = (
  clientNotes: unknown,
  client: IClient
): string | undefined =>
  partageAutorise(client) ? (clientNotes as string | undefined) : undefined;

// POST /api/client/sessions/:sessionId/complete
export const completeSession = catchAsync(
  async (req: Request, res: Response) => {
    const client = res.locals.client as IClient;
    const { sessionId } = req.params;
    const { feedback, metrics, performed, clientNotes, completedAt } = req.body;
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
    const blocks = applyPerformed(formatted.blocks, performed);

    const completed = await CompletedSession.create({
      clientId: client._id,
      programId: program._id,
      originalSessionId: session._id,
      sessionOrder: session.order,
      blocks,
      coachNotes: session.notes,
      ...(feedback ? { feedback: filtrerRessenti(feedback, client) } : {}),
      ...(metrics ? { metrics } : {}),
      clientNotes: filtrerCommentaire(clientNotes, client),
      ...(completedAt ? { completedAt: new Date(completedAt) } : {}),
    });

    logger.info(`[${rid}] completeSession: success`, {
      clientId: client._id,
      sessionId,
      completedId: completed._id,
    });
    res.status(201).json({ completed });
  }
);

// GET /api/client/history
export const getHistory = catchAsync(async (req: Request, res: Response) => {
  const client = res.locals.client as IClient;

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);

  const history = await CompletedSession.find({ clientId: client._id })
    .sort({ completedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.status(200).json({ history });
});

// PATCH /api/client/sessions/completed/:id
// Corriger un bilan déjà envoyé : le ressenti, les notes, la date, et ce qui
// a réellement été fait. Toujours ouvert, sans fenêtre de temps.
export const updateCompletedSession = catchAsync(
  async (req: Request, res: Response) => {
    const client = res.locals.client as IClient;
    const { id } = req.params;
    const { feedback, performed, clientNotes, completedAt } = req.body;
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
      completed.set('feedback', filtrerRessenti(feedback, client));
    if (clientNotes !== undefined)
      completed.clientNotes = filtrerCommentaire(clientNotes, client);
    if (completedAt !== undefined)
      completed.completedAt = new Date(completedAt);

    if (performed !== undefined) {
      // On repart du snapshot stocké et on ne réécrit que `performed` :
      // la prescription enregistrée le jour de la séance reste intacte.
      const blocks = applyPerformed(completed.toObject().blocks, performed);
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
    res.status(200).json({ completed });
  }
);

// PUT /api/client/health-consent
//
// Le client décide de partager ou non son ressenti. Les deux réponses sont
// enregistrées : un refus est une décision, pas une absence de décision, et
// c'est ce qui évite de reposer la question à chaque visite.
export const setHealthConsent = catchAsync(
  async (req: Request, res: Response) => {
    const client = res.locals.client as IClient;
    const { granted } = req.body;
    const rid = req.requestId ?? '?';

    if (typeof granted !== 'boolean') {
      throw new AppError('Réponse attendue : accepté ou refusé', 400);
    }

    client.healthConsent = {
      granted,
      decidedAt: new Date(),
      version: HEALTH_CONSENT_VERSION,
    };
    await client.save();

    // Retirer son accord ne vaut rien si ce qui a été collecté reste en base.
    // Les étiquettes et les commentaires déjà enregistrés partent ; l'effort,
    // les charges et les séances ne sont pas concernés.
    let efface = 0;
    if (!granted) {
      const { modifiedCount } = await CompletedSession.updateMany(
        {
          clientId: client._id,
          $or: [
            { 'feedback.tags': { $exists: true } },
            { clientNotes: { $exists: true, $ne: '' } },
          ],
        },
        { $unset: { 'feedback.tags': '', clientNotes: '' } }
      );
      efface = modifiedCount;
    }

    logger.info(`[${rid}] setHealthConsent: recorded`, {
      clientId: client._id,
      granted,
      version: HEALTH_CONSENT_VERSION,
      purgedSessions: efface,
    });

    res.status(200).json({ healthConsent: client.healthConsent });
  }
);
