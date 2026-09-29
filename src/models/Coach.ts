import { model, Schema, Types, Document } from 'mongoose';
import { IUser } from './User';

/**
 * Le rôle « coach » d'un compte. Presque vide, et c'est normal : ce qui
 * appartient au coach — ses clients, sa bibliothèque — le désigne depuis
 * ailleurs, plutôt que d'être listé ici.
 */
export interface ICoach extends Document {
  _id: Types.ObjectId;
  userId: IUser | Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CoachSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

const Coach = model<ICoach>('Coach', CoachSchema);

export default Coach;
