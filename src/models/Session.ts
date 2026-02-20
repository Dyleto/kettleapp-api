import { model, Schema, Types, Document } from "mongoose";

export interface ISession extends Document {
  programId: Types.ObjectId;
  order: number;
  notes?: string;
  warmup: {
    exercises: {
      exerciseId: Types.ObjectId;
      mode: "timer" | "reps";
      duration?: number;
      reps?: number;
    }[];
  };
  workout: {
    rounds: number;
    restBetweenRounds?: number;
    exercises: {
      exerciseId: Types.ObjectId;
      mode: "timer" | "reps";
      sets?: number;
      reps?: number;
      duration?: number;
      restBetweenSets?: number;
    }[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
    },
    order: { type: Number, required: true },
    notes: { type: String },
    warmup: {
      exercises: [
        {
          exerciseId: {
            type: Schema.Types.ObjectId,
            ref: "Exercise",
            required: true,
          },
          mode: { type: String, enum: ["timer", "reps"], required: true },
          duration: { type: Number, min: 0 },
          reps: { type: Number, min: 0 },
        },
      ],
    },
    workout: {
      rounds: { type: Number, required: true, min: 1 },
      restBetweenRounds: { type: Number, min: 0 },
      exercises: [
        {
          exerciseId: {
            type: Schema.Types.ObjectId,
            ref: "Exercise",
            required: true,
          },
          mode: { type: String, enum: ["timer", "reps"], required: true },
          sets: { type: Number, min: 0 },
          reps: { type: Number, min: 0 },
          restBetweenSets: { type: Number, min: 0 },
          duration: { type: Number, min: 0 },
        },
      ],
    },
  },
  { timestamps: true },
);

SessionSchema.index({ programId: 1, order: 1 });

const Session = model<ISession>("Session", SessionSchema);

export default Session;
