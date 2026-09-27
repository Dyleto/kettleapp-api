import { model, Schema, Types, Document } from 'mongoose';
import { randomBytes } from 'crypto';

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
