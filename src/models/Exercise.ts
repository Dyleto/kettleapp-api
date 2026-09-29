import { Document, model, Schema, Types } from 'mongoose';

/**
 * Un mouvement de la bibliothèque d'un coach.
 *
 * Il appartient au coach (`createdBy`) : le même « Goblet squat » sert chez
 * tous ses clients, et corriger sa vidéo une fois la corrige partout. C'est
 * aussi pourquoi un bilan en garde une copie figée — voir
 * `IBlockExerciseSnapshot`.
 */
export interface IExercise extends Document {
  name: string;
  description?: string;
  videoUrl?: string;
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
          if (!v) return true;
          return /^https?:\/\/.+/.test(v);
        },
        message: 'URL de vidéo invalide',
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Coach', required: true },
  },
  { timestamps: true }
);

ExerciseSchema.index({ createdBy: 1 });
ExerciseSchema.index({ createdBy: 1, name: 1 });

const Exercise = model<IExercise>('Exercise', ExerciseSchema);

export default Exercise;
