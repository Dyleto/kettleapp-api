import { model, Schema, Types, Document } from "mongoose";

export interface IProgram extends Document {
  clientId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProgramSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true },
  },
  { timestamps: true },
);

ProgramSchema.index({ clientId: 1, startDate: -1 });

const Program = model<IProgram>("Program", ProgramSchema);

export default Program;
