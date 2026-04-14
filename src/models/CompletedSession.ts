import { model, Schema, Types, Document } from "mongoose";

export interface ICompletedSession extends Document {
  clientId: Types.ObjectId;
  programId: Types.ObjectId;
  originalSessionId: Types.ObjectId;
  sessionOrder: number;
  warmup?: {
    exercises: {
      exercise: Record<string, unknown>;
      mode: "timer" | "reps";
      duration?: number;
      reps?: number;
    }[];
  };
  workout: {
    rounds: number;
    restBetweenRounds?: number;
    exercises: {
      exercise: Record<string, unknown>;
      mode: "timer" | "reps";
      sets?: number;
      reps?: number;
      duration?: number;
      restBetweenSets?: number;
    }[];
  };
  coachNotes?: string;
  metrics: {
    stress: number;
    mood: number;
    energy: number;
    sleep: number;
    soreness: number;
  };
  clientNotes?: string;
  viewedByCoach: boolean;
  completedAt: Date;
}

const exerciseSnapshotFields = {
  exercise: { type: Schema.Types.Mixed, required: true },
  mode: { type: String, enum: ["timer", "reps"], required: true },
  duration: { type: Number, min: 0 },
  reps: { type: Number, min: 0 },
};

const CompletedSessionSchema = new Schema(
  {
    clientId: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
    },
    originalSessionId: {
      type: Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },
    sessionOrder: { type: Number, required: true },
    warmup: {
      exercises: [exerciseSnapshotFields],
    },
    workout: {
      rounds: { type: Number, required: true, min: 1 },
      restBetweenRounds: { type: Number, min: 0 },
      exercises: [
        {
          ...exerciseSnapshotFields,
          sets: { type: Number, min: 0 },
          restBetweenSets: { type: Number, min: 0 },
        },
      ],
    },
    coachNotes: { type: String },
    metrics: {
      stress: { type: Number, required: true, min: 1, max: 5 },
      mood: { type: Number, required: true, min: 1, max: 5 },
      energy: { type: Number, required: true, min: 1, max: 5 },
      sleep: { type: Number, required: true, min: 1, max: 5 },
      soreness: { type: Number, required: true, min: 1, max: 5 },
    },
    clientNotes: { type: String },
    viewedByCoach: { type: Boolean, default: false },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

CompletedSessionSchema.index({ clientId: 1, completedAt: -1 });
CompletedSessionSchema.index({ clientId: 1, programId: 1 });

const CompletedSession = model<ICompletedSession>(
  "CompletedSession",
  CompletedSessionSchema,
);

export default CompletedSession;
