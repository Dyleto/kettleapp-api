import { model, Schema, Types, Document } from 'mongoose';

/**
 * Une étiquette d'un coach, pour ranger et filtrer ses clients.
 *
 * À part et non en texte sur chaque client : renommer « Reprise » en
 * « Retour de blessure » toucherait sinon chaque client qui la porte, et
 * l'écran de gestion — créer, renommer, supprimer — a besoin de la liste
 * des étiquettes même quand aucun client n'en porte encore.
 *
 * `key` est le nom ramené à sa forme comparable (`tagKey`) : « Reprise » et
 * « reprise » sont la même étiquette, et l'écran propose « Créer » dès que
 * le texte ne correspond à aucune.
 */
export interface ITag extends Document {
  _id: Types.ObjectId;
  coachId: Types.ObjectId;
  name: string;
  key: string;
  createdAt: Date;
  updatedAt: Date;
}

const TagSchema = new Schema<ITag>(
  {
    coachId: { type: Schema.Types.ObjectId, ref: 'Coach', required: true },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true },
  },
  { timestamps: true }
);

// Le doublon est refusé par la base et non par un contrôle préalable :
// deux créations simultanées passeraient toutes deux un contrôle applicatif.
TagSchema.index({ coachId: 1, key: 1 }, { unique: true });

const Tag = model<ITag>('Tag', TagSchema);

export default Tag;
