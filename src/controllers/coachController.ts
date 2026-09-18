import { Request, Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../utils/AppError';
import { ICoach } from '../models/Coach';
import InvitationToken from '../models/InvitationToken';
import Client from '../models/Client';
import Exercise from '../models/Exercise';
import { IUser } from '../models/User';
import Session from '../models/Session';
import mongoose, { isValidObjectId, Types } from 'mongoose';
import CompletedSession from '../models/CompletedSession';
import { getAuthorizedClient } from '../services/coachService';
import { getOrCreate } from '../services/programService';
import logger from '../utils/logger';
import { PopulatedSession, formatSession } from '../utils/sessionFormatter';
import { getErrorMessage } from '../utils/errors';

// --------------------------------------------------------------------------
// INVITATIONS
// --------------------------------------------------------------------------

/**
 * Le lien d'invitation actif, s'il y en a un — sans en créer.
 *
 * `generateInvitation` recycle un même lien par coach tant qu'il reste valide,
 * mais ne le renvoyait qu'au moment de le créer : une fois le message de
 * confirmation disparu, le coach n'avait plus aucun moyen de le retrouver et
 * devait relancer l'opération pour recopier un lien qu'il possédait déjà.
 */
export const getActiveInvitation = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;

    const invitationToken = await InvitationToken.findOne({
      coachId: coach._id,
      expiresAt: { $gt: new Date() },
    }).sort({ expiresAt: -1 });

    res.status(200).json(
      invitationToken
        ? {
            token: invitationToken.token,
            expiresAt: invitationToken.expiresAt,
          }
        : null
    );
  }
);

export const generateInvitation = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const expiresIn = req.body.expiresIn || 7; // jours
    const minimumDaysLeft = 5;

    // Si on a déjà un token valide pour encore 5 jours, on le recycle
    const minimumValidUntil = new Date();
    minimumValidUntil.setDate(minimumValidUntil.getDate() + minimumDaysLeft);

    let invitationToken = await InvitationToken.findOne({
      coachId: coach._id,
      expiresAt: { $gte: minimumValidUntil },
    }).sort({ expiresAt: -1 });

    if (!invitationToken) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresIn);

      invitationToken = await InvitationToken.create({
        coachId: coach._id,
        expiresAt,
      });
    }

    res.status(200).json({
      status: 'success',
      message: "Lien d'invitation généré avec succès",
      token: invitationToken.token,
      expiresAt: invitationToken.expiresAt,
      // (Bonus) l'URL directe c'est pratique :
      // inviteUrl: `${process.env.FRONTEND_URL}/join?token=${invitationToken.token}`
    });
  }
);

// --------------------------------------------------------------------------
// CLIENTS
// --------------------------------------------------------------------------

export const getClients = catchAsync(async (req: Request, res: Response) => {
  const coach = res.locals.coach as ICoach;

  const clients = await Client.aggregate([
    { $match: { 'coaches.coachId': coach._id } },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'userDoc',
      },
    },
    { $unwind: '$userDoc' },
    {
      // Un seul passage sur les séances du client : les bilans non lus et la
      // date de la dernière séance. Le $match tape l'index
      // { clientId: 1, completedAt: -1 }.
      $lookup: {
        from: 'completedsessions',
        let: { clientId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$clientId', '$$clientId'] } } },
          // Décroissant : `$first` donne la séance la plus récente, donc son
          // ressenti, sans un second passage sur la collection.
          { $sort: { completedAt: -1 } },
          {
            $group: {
              _id: null,
              lastCompletedAt: { $first: '$completedAt' },
              lastEffort: { $first: '$feedback.effort' },
              unseen: {
                $sum: {
                  $cond: [{ $ne: ['$viewedByCoach', true] }, 1, 0],
                },
              },
            },
          },
        ],
        as: 'sessionStats',
      },
    },
    {
      $project: {
        _id: 1,
        firstName: '$userDoc.firstName',
        lastName: '$userDoc.lastName',
        picture: '$userDoc.picture',
        unseenCount: {
          $ifNull: [{ $arrayElemAt: ['$sessionStats.unseen', 0] }, 0],
        },
        // Absent tant que le client n'a jamais terminé de séance.
        lastCompletedAt: {
          $arrayElemAt: ['$sessionStats.lastCompletedAt', 0],
        },
        // Le ressenti de cette dernière séance — absent si elle n'en portait
        // pas (bilan ancienne formule, ou terminée sans se prononcer).
        lastEffort: {
          $arrayElemAt: ['$sessionStats.lastEffort', 0],
        },
        // Depuis quand ce client est suivi par CE coach : sans une seule
        // séance terminée, c'est la seule mesure honnête de son inactivité.
        linkedAt: {
          $arrayElemAt: [
            {
              $map: {
                input: {
                  $filter: {
                    input: '$coaches',
                    as: 'link',
                    cond: { $eq: ['$$link.coachId', coach._id] },
                  },
                },
                as: 'link',
                in: '$$link.linkedAt',
              },
            },
            0,
          ],
        },
      },
    },
  ]);

  res.status(200).json(clients);
});

export const getClientDetails = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const clientId = req.params.id as string;

    const rawClient = await getAuthorizedClient(coach._id, clientId);
    const client = await rawClient.populate<{ userId: IUser }>('userId');

    const program = await getOrCreate(client._id);

    const rawSessions = await Session.find({ programId: program._id })
      .sort({ order: 1 })
      .populate('blocks.exercises.exerciseId')
      .lean();

    const sessions = (rawSessions as unknown as PopulatedSession[]).map(
      formatSession
    );

    const unseenCount = await CompletedSession.countDocuments({
      clientId: client._id,
      viewedByCoach: { $ne: true },
    });

    res.status(200).json({
      _id: client._id,
      firstName: client.userId.firstName,
      lastName: client.userId.lastName,
      email: client.userId.email,
      picture: client.userId.picture,
      program: {
        ...program.toObject(),
        sessions,
      },
      unseenCount,
    });
  }
);

export const getClientHistory = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const clientId = req.params.id as string;

    const client = await getAuthorizedClient(coach._id, clientId);

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);

    const history = await CompletedSession.find({ clientId: client._id })
      .sort({ completedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json(history);
  }
);

export const markHistoryAsViewed = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const clientId = req.params.id as string;

    await getAuthorizedClient(coach._id, clientId);

    await CompletedSession.updateMany(
      { clientId, viewedByCoach: { $ne: true } },
      { $set: { viewedByCoach: true } }
    );

    res.status(200).json({ status: 'success' });
  }
);

// --------------------------------------------------------------------------
// EXERCISES
// --------------------------------------------------------------------------

// Nombre de séances du coach dans lesquelles chaque exercice apparaît.
// La chaîne part de Client (index coaches.coachId) puis suit programs.clientId
// et sessions.programId, tous deux indexés.
const getExerciseUsage = async (
  coachId: Types.ObjectId
): Promise<Map<string, number>> => {
  const rows = await Client.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { 'coaches.coachId': coachId } },
    { $project: { _id: 1 } },
    {
      $lookup: {
        from: 'programs',
        localField: '_id',
        foreignField: 'clientId',
        as: 'programs',
      },
    },
    { $unwind: '$programs' },
    {
      $lookup: {
        from: 'sessions',
        localField: 'programs._id',
        foreignField: 'programId',
        as: 'sessions',
      },
    },
    { $unwind: '$sessions' },
    { $unwind: '$sessions.blocks' },
    { $unwind: '$sessions.blocks.exercises' },
    {
      $group: {
        _id: '$sessions.blocks.exercises.exerciseId',
        // Un exercice placé deux fois dans la même séance compte pour une.
        sessionIds: { $addToSet: '$sessions._id' },
      },
    },
    { $project: { count: { $size: '$sessionIds' } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.count]));
};

export const getExercises = catchAsync(async (req: Request, res: Response) => {
  const coach = res.locals.coach as ICoach;

  const [exercises, usage] = await Promise.all([
    Exercise.find({ createdBy: coach._id }).sort({ name: 1 }).lean(),
    getExerciseUsage(coach._id as Types.ObjectId),
  ]);

  res.status(200).json(
    exercises.map((exercise) => ({
      ...exercise,
      usageCount: usage.get(String(exercise._id)) ?? 0,
    }))
  );
});

export const getExerciseDetails = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const { id } = req.params;

    const exercise = await Exercise.findOne({ _id: id, createdBy: coach._id });
    if (!exercise) throw new AppError('Exercice non trouvé', 404);

    res.status(200).json(exercise);
  }
);

export const createExercise = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const { name, description, videoUrl } = req.body;

    const exercise = await Exercise.create({
      name,
      description: description || '',
      videoUrl: videoUrl || '',
      createdBy: coach._id,
    });

    res.status(201).json(exercise);
  }
);

export const updateExercise = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const { id } = req.params;
    const { name, description, videoUrl } = req.body;

    const exercise = await Exercise.findOne({ _id: id, createdBy: coach._id });
    if (!exercise) throw new AppError('Exercice non trouvé', 404);

    if (name) exercise.name = name;
    if (description !== undefined) exercise.description = description;
    if (videoUrl !== undefined) exercise.videoUrl = videoUrl;

    await exercise.save();

    res.status(200).json(exercise);
  }
);

export const deleteExercise = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const { id } = req.params;

    const usedInSession = await Session.findOne({
      'blocks.exercises.exerciseId': id,
    });

    if (usedInSession) {
      throw new AppError(
        'Cet exercice est utilisé dans une séance, impossible de le supprimer',
        400
      );
    }

    const result = await Exercise.deleteOne({ _id: id, createdBy: coach._id });

    if (result.deletedCount === 0)
      throw new AppError('Exercice non trouvé', 404);

    res.status(204).send(); // 204 No Content
  }
);

// --------------------------------------------------------------------------
// PROGRAMS & SESSIONS
// --------------------------------------------------------------------------

export const updateProgramSessions = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
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

    type SessionInput = {
      _id?: string;
      name?: string;
      notes?: string;
      suggestedDays?: number[];
      blocks?: unknown;
    };

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
    const coach = res.locals.coach as ICoach;
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

    res
      .status(201)
      .json(formatSession(peuplee as unknown as PopulatedSession));
  }
);
