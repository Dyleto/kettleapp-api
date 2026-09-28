import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { AppError } from '../../shared/utils/AppError';
import { coachOf } from '../../shared/middleware/roles';
import Session from '../../models/Session';
import mongoose, { isValidObjectId, Types } from 'mongoose';
import { getAuthorizedClient } from '../coach/coach.service';
import type { SessionInput } from './program.schema';
import { getOrCreate } from './program.service';
import logger from '../../shared/utils/logger';
import {
  PopulatedSession,
  formatSession,
} from '../../shared/utils/sessionFormatter';
import { getErrorMessage } from '../../shared/utils/errors';

export const updateProgramSessions = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const clientId = req.params.clientId as string;
    const { sessions } = req.body;
    const rid = req.requestId ?? '?';

    logger.info(`[${rid}] updateProgramSessions: start`, {
      coachId: coach._id,
      clientId,
      sessionCount: Array.isArray(sessions) ? sessions.length : '?',
    });

    const client = await getAuthorizedClient(coach._id, clientId);
    const program = await getOrCreate(client._id);

    const dbSession = await mongoose.startSession();
    let updatedSessions;

    try {
      await dbSession.withTransaction(async () => {
        const existingSessionIds = await Session.find({
          programId: program._id,
        })
          .select('_id')
          .session(dbSession);

        const existingIds = existingSessionIds.map((s) =>
          (s._id as Types.ObjectId).toString()
        );

        const incomingIds = (sessions as SessionInput[])
          .filter((s) => s._id)
          .map((s) => s._id as string);

        const idsToDelete = existingIds.filter(
          (id) => !incomingIds.includes(id)
        );

        if (idsToDelete.length > 0) {
          logger.info(
            `[${rid}] updateProgramSessions: deleting removed sessions`,
            {
              count: idsToDelete.length,
              ids: idsToDelete,
            }
          );
        }

        const deletePromise =
          idsToDelete.length > 0
            ? Session.deleteMany(
                { _id: { $in: idsToDelete }, programId: program._id },
                { session: dbSession }
              )
            : Promise.resolve();

        const operations = (sessions as SessionInput[]).map(
          (sessionData, index) => {
            const payload = {
              // `?? ''` et non `?? undefined` : Mongoose ignore les champs
              // absents lors d'un update, et un coach qui efface le nom d'une
              // séance ne pourrait plus jamais le retirer.
              name: sessionData.name ?? '',
              notes: sessionData.notes,
              // `?? []` et non `?? undefined` : Mongoose ignore les champs
              // undefined lors d'un update, et le coach qui décoche tous les
              // jours d'une séance ne pourrait plus jamais les retirer.
              suggestedDays: sessionData.suggestedDays ?? [],
              blocks: sessionData.blocks,
              programId: program._id,
              order: index + 1,
            };

            // L'identifiant fourni par le client sert de clé, qu'il existe
            // déjà ou non. C'est ce qui rend la requête répétable : envoyer
            // deux fois le même programme donne le même résultat.
            //
            // Auparavant, une séance inconnue partait en création pure. Avec
            // l'enregistrement automatique, deux envois successifs d'une
            // séance qui vient d'être ajoutée — le second parti avant que le
            // premier n'ait répondu — créaient donc deux séances. Le client
            // génère maintenant un identifiant au format ObjectId dès la
            // création, et c'est lui qu'on retrouve ici.
            if (sessionData._id && isValidObjectId(sessionData._id)) {
              return Session.findOneAndUpdate(
                { _id: sessionData._id, programId: program._id },
                payload,
                { new: true, upsert: true, session: dbSession }
              );
            }

            return Session.create([payload], { session: dbSession });
          }
        );

        await Promise.all([deletePromise, ...operations]);

        updatedSessions = await Session.find({ programId: program._id })
          .sort({ order: 1 })
          .populate('blocks.exercises.exerciseId')
          .lean()
          .session(dbSession);
      });
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`[${rid}] updateProgramSessions: transaction failed`, {
          coachId: coach._id,
          clientId,
          error: getErrorMessage(error),
        });
      }

      throw error;
    } finally {
      dbSession.endSession();
    }

    const formatted = (updatedSessions as unknown as PopulatedSession[]).map(
      formatSession
    );
    logger.info(`[${rid}] updateProgramSessions: success`, {
      coachId: coach._id,
      clientId,
      savedCount: formatted.length,
    });
    res.status(200).json(formatted);
  }
);

/**
 * Copier une séance chez un autre client.
 *
 * Retour du terrain : « dommage de ne pas pouvoir copier la séance et la
 * coller chez un autre client. Ce serait plus utile que le dupliquer. »
 * Il a raison : un coach écrit rarement deux fois le même travail, mais il
 * l'adapte souvent d'une personne à l'autre.
 *
 * Deux autorisations, pas une. Vérifier le client de destination ne suffit
 * pas : sans le contrôle sur la source, connaître un identifiant de séance
 * suffirait à recopier — donc à lire — le programme d'un client qui n'est
 * pas le sien.
 *
 * Ce qui ne se copie pas : les jours conseillés. Le contenu d'une séance
 * appartient à l'entraînement, ses jours appartiennent à la semaine de
 * quelqu'un. Les emporter poserait chez le nouveau client un conseil qui
 * n'a jamais été pensé pour lui.
 */
export const copySessionToClient = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const targetClientId = req.params.clientId as string;
    const { sourceClientId, sourceSessionId } = req.body as {
      sourceClientId: string;
      sourceSessionId: string;
    };
    const rid = req.requestId ?? '?';

    logger.info(`[${rid}] copySessionToClient: start`, {
      coachId: coach._id,
      sourceClientId,
      sourceSessionId,
      targetClientId,
    });

    const source = await getAuthorizedClient(coach._id, sourceClientId);
    const target = await getAuthorizedClient(coach._id, targetClientId);

    const sourceProgram = await getOrCreate(source._id);
    const seance = await Session.findOne({
      _id: sourceSessionId,
      programId: sourceProgram._id,
    }).lean();

    if (!seance) {
      throw new AppError('Séance introuvable', 404);
    }

    const targetProgram = await getOrCreate(target._id);
    const dejaLa = await Session.countDocuments({
      programId: targetProgram._id,
    });

    // Les identifiants ne voyagent pas : ce sont deux séances distinctes, et
    // corriger l'une ne doit jamais toucher l'autre.
    const sansId = <T extends object>(objet: T): T => {
      const copie = { ...objet } as Record<string, unknown>;
      delete copie._id;
      return copie as T;
    };

    const blocks = (seance.blocks ?? []).map((block) => ({
      ...sansId(block),
      exercises: (block.exercises ?? []).map(sansId),
    }));

    const copie = await Session.create({
      programId: targetProgram._id,
      order: dejaLa + 1,
      // Le nom suit la copie — contrairement aux jours conseillés : « Full
      // body A » décrit ce que la séance fait, pas la semaine de quelqu'un.
      name: seance.name,
      notes: seance.notes,
      blocks,
    });

    const peuplee = await Session.findById(copie._id)
      .populate('blocks.exercises.exerciseId')
      .lean();

    logger.info(`[${rid}] copySessionToClient: success`, {
      coachId: coach._id,
      targetClientId,
      newSessionId: copie._id,
      order: copie.order,
    });

    res.status(201).json(formatSession(peuplee as unknown as PopulatedSession));
  }
);
