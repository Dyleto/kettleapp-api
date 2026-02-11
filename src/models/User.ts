import { Schema, Document, model } from "mongoose";

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
  { timestamps: true },
);

const User = model<IUser>("User", UserSchema);

export default User;
