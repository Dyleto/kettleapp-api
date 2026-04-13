import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { IClient } from "../models/Client";
import Program from "../models/Program";
import Session from "../models/Session";
import CompletedSession from "../models/CompletedSession";

// Helper : transforme exerciseId populé en champ "exercise"
const formatSession = (session: Record<string, unknown>) => {
  const s = session as {
    warmup?: { exercises: { exerciseId: unknown; [k: string]: unknown }[] };
    workout: {
      rounds: number;
      restBetweenRounds?: number;
      exercises: { exerciseId: unknown; [k: string]: unknown }[];
    };
    [k: string]: unknown;
  };

  return {
    ...s,
    warmup: s.warmup
      ? {
          exercises: s.warmup.exercises.map(({ exerciseId, ...rest }) => ({
            ...rest,
            exercise: exerciseId,
          })),
        }
      : undefined,
    workout: {
      ...s.workout,
      exercises: s.workout.exercises.map(({ exerciseId, ...rest }) => ({
        ...rest,
        exercise: exerciseId,
      })),
    },
  };
};

// GET /api/client/program
export const getProgram = catchAsync(async (req: Request, res: Response) => {
  const client = res.locals.client as IClient;

  let program = await Program.findOne({ clientId: client._id });

  if (!program) {
    program = await Program.create({ clientId: client._id });
  }

  const sessions = await Session.find({ programId: program._id })
    .sort({ order: 1 })
    .populate("warmup.exercises.exerciseId")
    .populate("workout.exercises.exerciseId")
    .lean();

  res.status(200).json({
    program: {
      ...program.toObject(),
      sessions: sessions.map(formatSession),
    },
  });
});

// POST /api/client/sessions/:sessionId/complete
export const completeSession = catchAsync(
  async (req: Request, res: Response) => {
    const client = res.locals.client as IClient;
    const { sessionId } = req.params;
    const { metrics, clientNotes } = req.body;

    const program = await Program.findOne({ clientId: client._id });
    if (!program) throw new AppError("Programme introuvable", 404);

    const session = await Session.findOne({
      _id: sessionId,
      programId: program._id,
    })
      .populate("warmup.exercises.exerciseId")
      .populate("workout.exercises.exerciseId")
      .lean();

    if (!session) throw new AppError("Séance introuvable", 404);

    const formatted = formatSession(session as Record<string, unknown>);

    const completed = await CompletedSession.create({
      clientId: client._id,
      programId: program._id,
      originalSessionId: session._id,
      sessionOrder: session.order,
      warmup: formatted.warmup,
      workout: formatted.workout,
      coachNotes: session.notes,
      metrics,
      clientNotes,
    });

    res.status(201).json({ completed });
  },
);

// GET /api/client/history
export const getHistory = catchAsync(async (req: Request, res: Response) => {
  const client = res.locals.client as IClient;

  const history = await CompletedSession.find({ clientId: client._id }).sort({
    completedAt: -1,
  });

  res.status(200).json({ history });
});
