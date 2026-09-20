import { IPerformed, IPerformedSet } from '../models/CompletedSession';

// Ce que le client envoie pour un exercice donné : la liste complète de ses
// séries. Elle remplace le réalisé enregistré, `[]` l'efface.
export type PerformedInput = {
  blockOrder: number;
  exerciseOrder: number;
  sets: IPerformedSet[];
};

// Ce que le client envoie pour un bloc qui se compte en tours.
export type RoundsInput = {
  blockOrder: number;
  rounds: number;
};

type ExerciseLike = { order: number; performed?: IPerformed };
type BlockLike = { order: number; exercises: ExerciseLike[] };

// Le bloc rendu, dont les exercices portent maintenant `performed`.
type WithPerformed<B extends BlockLike> = Omit<B, 'exercises'> & {
  exercises: (B['exercises'][number] & { performed?: IPerformed })[];
};

const keyOf = (blockOrder: number, exerciseOrder: number) =>
  `${blockOrder}:${exerciseOrder}`;

const isEmptySet = (set: IPerformedSet): boolean =>
  set.weight === undefined &&
  set.reps === undefined &&
  set.duration === undefined;

// Une série laissée vide veut dire que l'exercice s'est arrêté là : les
// suivantes n'ont pas eu lieu, on ne les enregistre pas. Une série vide au
// milieu tronque donc, elle ne se saute pas.
const normalize = (sets: IPerformedSet[]): IPerformed | undefined => {
  const kept: IPerformedSet[] = [];
  for (const set of sets) {
    if (isEmptySet(set)) break;
    // On ne recopie que les clés renseignées : « non renseigné » ne doit
    // jamais arriver en base sous la forme d'un zéro ou d'un `null`.
    const clean: IPerformedSet = {};
    if (set.weight !== undefined) clean.weight = set.weight;
    if (set.reps !== undefined) clean.reps = set.reps;
    if (set.duration !== undefined) clean.duration = set.duration;
    kept.push(clean);
  }
  return kept.length > 0 ? { sets: kept } : undefined;
};

/**
 * Recopie les séries réellement réalisées dans le snapshot de séance.
 *
 * Ne touche QUE `exercises[].performed` : la prescription (sets/reps/duration
 * du coach) reste celle calculée par le serveur, le client ne peut pas la
 * réécrire.
 */
export const applyPerformed = <B extends BlockLike>(
  blocks: B[],
  entries?: PerformedInput[]
): WithPerformed<B>[] => {
  if (!entries || entries.length === 0) return blocks as WithPerformed<B>[];

  const byKey = new Map<string, PerformedInput>();
  entries.forEach((entry) => {
    byKey.set(keyOf(entry.blockOrder, entry.exerciseOrder), entry);
  });

  return blocks.map((block) => ({
    ...block,
    exercises: block.exercises.map((exercise) => {
      const entry = byKey.get(keyOf(block.order, exercise.order));
      if (!entry) return exercise;
      return { ...exercise, performed: normalize(entry.sets) };
    }),
  }));
};

/**
 * Recopie le nombre de tours réellement bouclés dans le snapshot.
 *
 * Ne touche QUE `blocks[].performedRounds`, pour la même raison
 * qu'`applyPerformed` ne touche que le réalisé des exercices : la
 * prescription du coach appartient au serveur, le client ne la réécrit pas.
 *
 * Zéro est une réponse, pas une absence : un client qui n'a bouclé aucun tour
 * l'a vécu, et l'effacer reviendrait à dire qu'il n'a pas fait le bloc.
 */
export const applyRoundsDone = <B extends { order: number }>(
  blocks: B[],
  entries?: RoundsInput[]
): (B & { performedRounds?: number })[] => {
  if (!entries || entries.length === 0) return blocks;

  const parBloc = new Map<number, number>();
  entries.forEach((e) => parBloc.set(e.blockOrder, e.rounds));

  return blocks.map((block) => {
    const tours = parBloc.get(block.order);
    return tours === undefined ? block : { ...block, performedRounds: tours };
  });
};
