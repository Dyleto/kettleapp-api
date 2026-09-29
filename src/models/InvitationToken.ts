import { model, Schema, Types, Document } from 'mongoose';
import { randomBytes } from 'crypto';

/**
 * Le jeton qui rattache un client à un coach.
 *
 * Il donne accès à la liste d'un coach : il expire, et il se consomme. Un
 * jeton permanent partagé dans un groupe aurait laissé entrer n'importe qui,
 * longtemps après que le coach l'a oublié.
 */
export interface IInvitationToken extends Document {
  coachId: Types.ObjectId;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

const InvitationTokenSchema: Schema = new Schema({
  coachId: {
    type: Schema.Types.ObjectId,
    ref: 'Coach',
    required: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
    default: () => randomBytes(32).toString('hex'),
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});

InvitationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const InvitationToken = model<IInvitationToken>(
  'InvitationToken',
  InvitationTokenSchema
);

export default InvitationToken;
