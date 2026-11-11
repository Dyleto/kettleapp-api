import { Schema, model, Types, Document } from 'mongoose';
import { ISessionBlock, sessionBlockSchema } from './Session';

/**
 * Un programme préfait, qui n'appartient à aucun client.
 *
 * Le coach s'en constitue une bibliothèque — « Débutant 3 séances », « Prépa
 * marathon » — et l'importe chez un client, où il devient un programme
 * ordinaire qu'il modifie comme il veut. Le modèle ne sert que de base de
 * copie : rien ne le relie ensuite au programme du client, et le corriger ne
 * touche aucun programme déjà importé.
 *
 * ── Pourquoi les séances sont embarquées ───────────────────────────────────
 *
 * Le programme d'un client vit dans deux collections — un `Program` et des
 * `Session` à côté — parce que ses séances sont pointées de l'extérieur : un
 * bilan garde l'identifiant de la séance qu'il a réalisée. Celles d'un modèle
 * ne sont pointées par rien. Personne ne les réalise, aucun historique ne s'y
 * rattache, et la réconciliation qui existe pour un programme — retrouver,
 * mettre à jour, supprimer ce qui n'est plus envoyé — n'aurait ici rien à
 * réconcilier : un enregistrement remplace le tableau.
 *
 * Deux collections de moins, et le même contrat de sortie qu'un programme.
 */
export interface ITemplateSession {
  _id: Types.ObjectId;
  order: number;
  name?: string;
  notes?: string;
  suggestedDays?: number[];
  blocks: ISessionBlock[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IProgramTemplate extends Document {
  _id: Types.ObjectId;
  /** Le coach à qui ce modèle appartient. Aucun modèle n'est partagé. */
  coachId: Types.ObjectId;
  name: string;
  sessions: ITemplateSession[];
  createdAt: Date;
  updatedAt: Date;
}

const templateSessionSchema = new Schema(
  {
    order: { type: Number, required: true },
    name: { type: String, trim: true },
    notes: { type: String },
    suggestedDays: [{ type: Number, min: 0, max: 6 }],
    // Le même sous-schéma que les séances d'un programme : c'est ce qui
    // permet à l'atelier du coach d'éditer un modèle sans rien savoir de
    // particulier, et au contrat de réutiliser `sessionPayload`.
    blocks: [sessionBlockSchema],
  },
  // Horodaté comme une séance de programme, parce que `sessionPayload` les
  // exige : sans cela le contrat de sortie refuserait les séances d'un modèle
  // et il faudrait un second schéma pour la même chose.
  { _id: true, timestamps: true }
);

const ProgramTemplateSchema = new Schema(
  {
    coachId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Le nom est ce qui distingue un modèle d'un autre dans la liste : il est
    // exigé, là où celui d'une séance peut rester vide — une séance a son
    // rang pour se nommer, un modèle n'a rien.
    name: { type: String, trim: true, required: true, maxlength: 120 },
    sessions: [templateSessionSchema],
  },
  { timestamps: true }
);

const ProgramTemplate = model<IProgramTemplate>(
  'ProgramTemplate',
  ProgramTemplateSchema
);

export default ProgramTemplate;
