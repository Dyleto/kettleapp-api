import { model, Schema, Types, Document } from "mongoose";
import { IUser } from "./User";

export interface CoachLink {
  coachId: Types.ObjectId;
  linkedAt: Date;
}

export interface IClient extends Document {
  _id: Types.ObjectId;
  userId: IUser | Types.ObjectId;
  coaches: CoachLink[];
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    coaches: [
      {
        coachId: { type: Schema.Types.ObjectId, ref: "Coach", required: true },
        linkedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Index pour Ã©viter les doublons de coaches
ClientSchema.index(
  { userId: 1, "coaches.coachId": 1 },
  { unique: true, sparse: true },
);

ClientSchema.index({ "coaches.coachId": 1 });

const Client = model<IClient>("Client", ClientSchema);

export default Client;
