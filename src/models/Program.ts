import { model, Schema, Types, Document } from "mongoose";

export interface IProgram extends Document {
  clientId: Types.ObjectId;
  coachId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProgramSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true },
    coachId: { type: Schema.Types.ObjectId, ref: "Coach", required: true },
  },
  { timestamps: true },
);

ProgramSchema.index({ clientId: 1, startDate: -1 });
ProgramSchema.index({ clientId: 1, coachId: 1 });

const Program = model<IProgram>("Program", ProgramSchema);

export default Program;
