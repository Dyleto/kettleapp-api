import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { AppError } from '../../shared/utils/AppError';
import { coachOf } from '../../shared/middleware/roles';
import Client from '../../models/Client';
import Exercise from '../../models/Exercise';
import Session from '../../models/Session';
import { Types } from 'mongoose';

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
  const coach = coachOf(res);

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
    const coach = coachOf(res);
    const { id } = req.params;

    const exercise = await Exercise.findOne({ _id: id, createdBy: coach._id });
    if (!exercise) throw new AppError('Exercice non trouvé', 404);

    res.status(200).json(exercise);
  }
);

export const createExercise = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
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
    const coach = coachOf(res);
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
    const coach = coachOf(res);
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
