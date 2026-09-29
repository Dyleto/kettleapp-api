import { Schema, Document, model } from 'mongoose';

/**
 * Le compte, et rien que le compte : de quoi identifier une personne.
 *
 * Pas de mot de passe — l'authentification passe par Google. Prénom et nom
 * sont facultatifs parce qu'ils viennent du profil Google, qui ne les donne
 * pas toujours.
 */
export interface IUser extends Document {
  email: string;
  picture?: string;
  firstName?: string;
  lastName?: string;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    picture: { type: String },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    isAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const User = model<IUser>('User', UserSchema);

export default User;
