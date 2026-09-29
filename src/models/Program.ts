import { model, Schema, Types, Document } from 'mongoose';

/**
 * Le programme d'un client : une enveloppe, et ses séances ailleurs.
 *
 * Les séances vivent dans leur propre collection plutôt que dans un tableau
 * imbriqué : l'atelier en réécrit l'ensemble à chaque changement, et un
 * document unique aurait fait réécrire tout le programme pour une répétition
 * corrigée.
 */
export interface IProgram extends Document {
  clientId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProgramSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
  },
  { timestamps: true }
);

// Tous les accès partent du client — `getOrCreate` en tête. L'index
// portait aussi sur `startDate`, un champ qu'aucun schéma n'a jamais eu.
ProgramSchema.index({ clientId: 1 });

const Program = model<IProgram>('Program', ProgramSchema);

export default Program;
