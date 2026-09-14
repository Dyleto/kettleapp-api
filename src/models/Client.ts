import { model, Schema, Types, Document } from "mongoose";
import { IUser } from "./User";

export interface CoachLink {
  coachId: Types.ObjectId;
  linkedAt: Date;
}

/**
 * La décision du client sur le partage de son ressenti.
 *
 * Absente tant qu'on ne la lui a pas demandée. `version` retient le texte
 * auquel il a répondu : un texte remanié redemande la question plutôt que de
 * faire passer un accord ancien pour un accord au nouveau.
 */
export interface HealthConsent {
  granted: boolean;
  decidedAt: Date;
  version: string;
}

export interface IClient extends Document {
  _id: Types.ObjectId;
  userId: IUser | Types.ObjectId;
  coaches: CoachLink[];
  healthConsent?: HealthConsent;
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
    healthConsent: {
      type: new Schema<HealthConsent>(
        {
          granted: { type: Boolean, required: true },
          decidedAt: { type: Date, required: true },
          version: { type: String, required: true },
        },
        { _id: false },
      ),
      required: false,
    },
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
