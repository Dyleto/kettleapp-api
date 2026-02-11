import { model, Schema, Types, Document } from "mongoose";
import { IUser } from "./User";

export interface ICoach extends Document {
  userId: IUser | Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CoachSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
  },
  { timestamps: true },
);

const Coach = model<ICoach>("Coach", CoachSchema);

export default Coach;
