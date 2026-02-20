import { Document, model, Schema, Types } from "mongoose";

export interface IExercise extends Document {
  name: string;
  description?: string;
  videoUrl?: string;
  type: "warmup" | "workout";
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExerciseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    videoUrl: {
      type: String,
      validate: {
        validator: function (v: string) {
          if (!v) return true; // Optionnel
          return /^https?:\/\/.+/.test(v);
        },
        message: "URL de vidéo invalide",
      },
    },
    type: {
      type: String,
      enum: ["warmup", "workout"],
      required: true,
      default: "workout",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "Coach", required: true },
  },
  { timestamps: true },
);

ExerciseSchema.index({ createdBy: 1 });
ExerciseSchema.index({ createdBy: 1, name: 1 });
ExerciseSchema.index({ createdBy: 1, type: 1 });

const Exercise = model<IExercise>("Exercise", ExerciseSchema);

export default Exercise;
