import { model, Schema, Types, Document } from 'mongoose';
import { FEEDBACK_TAGS, FeedbackTag } from '../constants/feedback';

// Ce que le client a réellement fait, à côté de la prescription.
// Une clé absente = non renseignée. On n'écrit jamais 0 pour dire "rien".
/** Ce que le client a fait sur UNE série. */
export interface IPerformedSet {
  weight?: number;
  reps?: number;
  duration?: number;
}

/**
 * Ce que le client a réellement fait, série par série.
 *
 * La liste s'arrête là où l'exercice s'est arrêté : une série prescrite qui
 * n'y figure pas n'a pas été faite. C'est la seule façon de distinguer « j'ai
 * fait mes quatre séries » de « j'ai lâché à la deuxième », que l'ancien
 * couple poids/reps unique ne pouvait pas exprimer.
 */
export interface IPerformed {
  sets: IPerformedSet[];
}

export interface IBlockExerciseSnapshot {
  exercise: Record<string, unknown>;
  order: number;
  sets?: number;
  restBetweenSets?: number;
  reps?: number;
  duration?: number;
  customMetric?: { value: number; unit: string };
  /** La consigne du coach pour cet exercice, telle qu'elle était ce jour-là. */
  note?: string;
  performed?: IPerformed;
}

export interface IBlockSnapshot {
  type: string;
  label?: string;
  order: number;
  notes?: string;
  durationMinutes?: number;
  intervalMinutes?: number;
  rounds?: number;
  restBetweenRounds?: number;
  workDuration?: number;
  restDuration?: number;
  repsScheme?: number[];
  exercises: IBlockExerciseSnapshot[];
}

export interface IFeedback {
  effort: number;
  tags?: FeedbackTag[];
  note?: string;
}

export interface ICompletedSession extends Document {
  clientId: Types.ObjectId;
  programId: Types.ObjectId;
  originalSessionId: Types.ObjectId;
  sessionOrder: number;
  blocks: IBlockSnapshot[];
  coachNotes?: string;
  feedback?: IFeedback;
  /** @deprecated remplacé par `feedback`. Conservé en lecture pour l'historique
   * déjà enregistré : on ne rétro-remplit rien. */
  metrics?: {
    stress: number;
    mood: number;
    energy: number;
    sleep: number;
    soreness: number;
  };
  clientNotes?: string;
  viewedByCoach: boolean;
  completedAt: Date;
  editedAt?: Date;
}

const performedSetSchema = new Schema(
  {
    weight: { type: Number, min: 0 },
    reps: { type: Number, min: 0 },
    duration: { type: Number, min: 0 },
  },
  { _id: false }
);

const performedSchema = new Schema(
  {
    sets: { type: [performedSetSchema], required: true },
  },
  { _id: false }
);

const exerciseSnapshotSchema = new Schema(
  {
    exercise: { type: Schema.Types.Mixed, required: true },
    order: { type: Number, required: true },
    sets: { type: Number },
    restBetweenSets: { type: Number },
    reps: { type: Number },
    duration: { type: Number },
    customMetric: {
      value: { type: Number },
      unit: { type: String },
    },
    note: { type: String },
    performed: { type: performedSchema, default: undefined },
  },
  { _id: false }
);

const blockSnapshotSchema = new Schema(
  {
    type: { type: String, required: true },
    label: { type: String },
    order: { type: Number, required: true },
    notes: { type: String },
    durationMinutes: { type: Number },
    intervalMinutes: { type: Number },
    rounds: { type: Number },
    restBetweenRounds: { type: Number },
    workDuration: { type: Number },
    restDuration: { type: Number },
    repsScheme: [{ type: Number }],
    exercises: [exerciseSnapshotSchema],
  },
  { _id: false }
);

const feedbackSchema = new Schema(
  {
    effort: { type: Number, required: true, min: 1, max: 5 },
    tags: [{ type: String, enum: FEEDBACK_TAGS }],
    note: { type: String, trim: true, maxlength: 2000 },
  },
  { _id: false }
);

const CompletedSessionSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    programId: { type: Schema.Types.ObjectId, ref: 'Program', required: true },
    originalSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    sessionOrder: { type: Number, required: true },
    blocks: [blockSnapshotSchema],
    coachNotes: { type: String },
    feedback: { type: feedbackSchema, default: undefined },
    // Legacy : anciens bilans en 5 axes. Plus jamais écrit, toujours lu.
    metrics: {
      stress: { type: Number, min: 1, max: 5 },
      mood: { type: Number, min: 1, max: 5 },
      energy: { type: Number, min: 1, max: 5 },
      sleep: { type: Number, min: 1, max: 5 },
      soreness: { type: Number, min: 1, max: 5 },
    },
    clientNotes: { type: String },
    viewedByCoach: { type: Boolean, default: false },
    completedAt: { type: Date, default: Date.now },
    editedAt: { type: Date },
  },
  { timestamps: true }
);

CompletedSessionSchema.index({ clientId: 1, completedAt: -1 });
CompletedSessionSchema.index({ clientId: 1, programId: 1 });

const CompletedSession = model<ICompletedSession>(
  'CompletedSession',
  CompletedSessionSchema
);

export default CompletedSession;
