import { PipelineStage, Types } from 'mongoose';
import Client from '../../models/Client';

/** Ce qu'on sait de l'usage d'un exercice : dans combien de séances du
 * coach il apparaît, et chez combien de ses clients. */
export interface ExerciseUsage {
  sessions: number;
  clients: number;
}

/** Une ligne telle que l'agrégation la rend. */
export interface UsageRow {
  _id: Types.ObjectId;
  sessions: number;
  clients: number;
}

/**
 * L'agrégation qui compte l'usage de chaque exercice d'un coach.
 *
 * La chaîne part de Client (index `coaches.coachId`) puis suit
 * `programs.clientId` et `sessions.programId`, tous deux indexés. Elle coûte
 * une agrégation complète à chaque ouverture de la bibliothèque : si le coût
 * devient sensible, c'est ici qu'il faudra un cache, pas ailleurs.
 *
 * Les clients se comptent sur le chemin : la chaîne part d'eux. La fiche
 * d'un exercice dit « utilisé dans 9 séances, chez 4 clients » avant qu'on
 * le modifie — ce qui change là change chez chacun d'eux.
 */
export const usagePipeline = (coachId: Types.ObjectId): PipelineStage[] => [
  { $match: { 'coaches.coachId': coachId } },
  { $project: { _id: 1 } },
  {
    $lookup: {
      from: 'programs',
      localField: '_id',
      foreignField: 'clientId',
      as: 'programs',
    },
  },
  { $unwind: '$programs' },
  {
    $lookup: {
      from: 'sessions',
      localField: 'programs._id',
      foreignField: 'programId',
      as: 'sessions',
    },
  },
  { $unwind: '$sessions' },
  { $unwind: '$sessions.blocks' },
  { $unwind: '$sessions.blocks.exercises' },
  {
    $group: {
      _id: '$sessions.blocks.exercises.exerciseId',
      // Un exercice placé deux fois dans la même séance compte pour une ;
      // dans deux séances du même client, ce client compte pour un.
      sessionIds: { $addToSet: '$sessions._id' },
      clientIds: { $addToSet: '$_id' },
    },
  },
  {
    $project: {
      sessions: { $size: '$sessionIds' },
      clients: { $size: '$clientIds' },
    },
  },
];

/** Les lignes de l'agrégation, rangées par exercice. */
export const usageByExercise = (
  rows: readonly UsageRow[]
): Map<string, ExerciseUsage> =>
  new Map(
    rows.map((row) => [
      String(row._id),
      { sessions: row.sessions, clients: row.clients },
    ])
  );

/**
 * Dans combien de séances, et chez combien de clients, chaque exercice d'un
 * coach apparaît.
 *
 * Ce compteur est ce qui rend la bibliothèque utilisable : sans lui, rien ne
 * distingue l'exercice qu'on place à chaque séance de celui qu'on a créé par
 * erreur il y a six mois — et c'est justement celui-là qu'on veut pouvoir
 * supprimer.
 */
export const exerciseUsage = async (
  coachId: Types.ObjectId
): Promise<Map<string, ExerciseUsage>> =>
  usageByExercise(await Client.aggregate<UsageRow>(usagePipeline(coachId)));
