import { IExercise } from '../models/Exercise';
import { ISessionBlock } from '../models/Session';

type PopulatedBlockExercise = {
  exerciseId: IExercise;
  order: number;
  sets?: number;
  restBetweenSets?: number;
  reps?: number;
  duration?: number;
  customMetric?: { value: number; unit: string };
  /** La consigne du coach pour cette pose de l'exercice, dans cette séance. */
  note?: string;
};

type PopulatedBlock = Omit<ISessionBlock, 'exercises'> & {
  exercises: PopulatedBlockExercise[];
};

type PopulatedSession = {
  _id: unknown;
  order: number;
  notes?: string;
  blocks: PopulatedBlock[];
  createdAt: Date;
  updatedAt: Date;
};

const formatSession = (session: PopulatedSession) => ({
  ...session,
  blocks: session.blocks.map((block) => ({
    ...block,
    exercises: block.exercises.map(({ exerciseId, ...rest }) => ({
      ...rest,
      exercise: exerciseId,
    })),
  })),
});

export {
  formatSession,
  PopulatedSession,
  PopulatedBlock,
  PopulatedBlockExercise,
};
