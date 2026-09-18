import { model, Schema, Types, Document } from "mongoose";

export type BlockType =
  | "warmup"
  | "emom"
  | "every"
  | "amrap"
  | "timecap"
  | "chipper"
  | "classic"
  | "tabata"
  | "onoff"
  | "pyramid"
  | "ladder";

export const BLOCK_TYPES: BlockType[] = [
  "warmup", "emom", "every", "amrap", "timecap",
  "chipper", "classic", "tabata", "onoff", "pyramid", "ladder",
];

export interface IBlockExercise {
  exerciseId: Types.ObjectId;
  order: number;
  sets?: number;
  restBetweenSets?: number;
  reps?: number;
  duration?: number;
  customMetric?: { value: number; unit: string };
  /**
   * La consigne du coach pour cet exercice, dans cette séance-là.
   *
   * À ne pas confondre avec `Exercise.description`, qui décrit le mouvement
   * en général et vit dans la bibliothèque : celle-ci est partagée par tous
   * les clients et toutes les séances. Un coach qui écrivait « attention à
   * ton épaule droite » l'écrivait donc sur la fiche commune, et tous ses
   * clients la lisaient.
   */
  note?: string;
}

export interface ISessionBlock {
  type: BlockType;
  label?: string;
  order: number;
  notes?: string;
  durationMinutes?: number;
  intervalMinutes?: number;
  rounds?: number;
  restBetweenRounds?: number;
  workDuration?: number;
  restDuration?: number;
  repsScheme?: number[];
  exercises: IBlockExercise[];
}

export interface ISession extends Document {
  programId: Types.ObjectId;
  order: number;
  /**
   * Le nom libre que le coach donne à la séance — « Full body A », « Haut du
   * corps ». Facultatif : sans lui, la séance s'appelle par son rang.
   *
   * Une séance se répète, et son rang se répétait avec elle : un client
   * lisait « Séance 1 · Séance 1 · Séance 1 » dans son historique, et le
   * coach la même chose dans le journal. Le rang dit où elle est dans le
   * programme, pas ce qu'elle contient.
   */
  name?: string;
  notes?: string;
  /**
   * Jours de la semaine où le coach conseille cette séance, lundi = 0.
   *
   * Purement indicatif : un jour manqué ne produit aucun état, aucune dette,
   * rien à réconcilier. C'est un conseil affiché, pas un engagement suivi.
   * Vide ou absent = la séance n'est rattachée à aucun jour.
   */
  suggestedDays?: number[];
  blocks: ISessionBlock[];
  createdAt: Date;
  updatedAt: Date;
}

const blockExerciseSchema = new Schema(
  {
    exerciseId: { type: Schema.Types.ObjectId, ref: "Exercise", required: true },
    order: { type: Number, required: true },
    sets: { type: Number, min: 1 },
    restBetweenSets: { type: Number, min: 0 },
    reps: { type: Number, min: 0 },
    duration: { type: Number, min: 0 },
    customMetric: {
      value: { type: Number },
      unit: { type: String, trim: true },
    },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const sessionBlockSchema = new Schema(
  {
    type: { type: String, enum: BLOCK_TYPES, required: true },
    label: { type: String, trim: true },
    order: { type: Number, required: true },
    notes: { type: String },
    durationMinutes: { type: Number, min: 1 },
    intervalMinutes: { type: Number, min: 1 },
    rounds: { type: Number, min: 1 },
    restBetweenRounds: { type: Number, min: 0 },
    workDuration: { type: Number, min: 1 },
    restDuration: { type: Number, min: 0 },
    repsScheme: [{ type: Number, min: 1 }],
    exercises: [blockExerciseSchema],
  },
  { _id: true },
);

const SessionSchema = new Schema(
  {
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    order: { type: Number, required: true },
    name: { type: String, trim: true },
    notes: { type: String },
    suggestedDays: [{ type: Number, min: 0, max: 6 }],
    blocks: [sessionBlockSchema],
  },
  { timestamps: true },
);

SessionSchema.index({ programId: 1, order: 1 });

const Session = model<ISession>("Session", SessionSchema);

export default Session;
