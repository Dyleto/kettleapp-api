import { IPerformed, IPerformedSet } from '../../models/CompletedSession';

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

// Ce que le client envoie pour une échelle bornée : les paliers entièrement
// faits et le temps au chrono, en secondes.
export type LadderInput = {
  blockOrder: number;
  rungs: number;
  seconds: number;
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

  const byBlock = new Map<number, number>();
  entries.forEach((e) => byBlock.set(e.blockOrder, e.rounds));

  return blocks.map((block) => {
    const rounds = byBlock.get(block.order);
    return rounds === undefined ? block : { ...block, performedRounds: rounds };
  });
};

/**
 * Recopie ce qu'une échelle bornée a donné — les paliers faits et le temps
 * au chrono — dans le snapshot.
 *
 * Le pendant d'`applyRoundsDone` pour l'échelle, et pour les mêmes raisons :
 * il ne touche que `performedRungs` et `performedSeconds`, la prescription
 * — les paliers, la limite — reste celle du coach, et c'est leur
 * comparaison qui l'intéresse : « palier 5 sur 7 en 12:00 ». Zéro palier
 * est une réponse : le client était là, la limite est tombée au premier.
 */
export const applyLadderDone = <B extends { order: number }>(
  blocks: B[],
  entries?: LadderInput[]
): (B & { performedRungs?: number; performedSeconds?: number })[] => {
  if (!entries || entries.length === 0) return blocks;

  const byBlock = new Map<number, LadderInput>();
  entries.forEach((e) => byBlock.set(e.blockOrder, e));

  return blocks.map((block) => {
    const entry = byBlock.get(block.order);
    return entry === undefined
      ? block
      : {
          ...block,
          performedRungs: entry.rungs,
          performedSeconds: entry.seconds,
        };
  });
};

// Ce que le client envoie pour un chipper ou un TimeCap borné : les
// mouvements entièrement faits et le temps au chrono, en secondes.
export type ChipperInput = {
  blockOrder: number;
  movements: number;
  seconds: number;
};

/**
 * Recopie ce qu'un chipper ou un TimeCap borné a donné — les mouvements
 * faits et le temps au chrono — dans le snapshot.
 *
 * Le pendant d'`applyLadderDone`, et le temps au chrono est le même champ :
 * `performedSeconds` dit le temps d'un bloc borné, quel que soit son format.
 * Les mouvements ont le leur, `performedMovements`, parce qu'un palier n'est
 * pas un mouvement — « palier 5 sur 7 » et « mouvement 3 sur 4 » ne se
 * comparent pas. Zéro est une réponse : la limite est tombée pendant le
 * premier.
 */
export const applyChipperDone = <B extends { order: number }>(
  blocks: B[],
  entries?: ChipperInput[]
): (B & { performedMovements?: number; performedSeconds?: number })[] => {
  if (!entries || entries.length === 0) return blocks;

  const byBlock = new Map<number, ChipperInput>();
  entries.forEach((e) => byBlock.set(e.blockOrder, e));

  return blocks.map((block) => {
    const entry = byBlock.get(block.order);
    return entry === undefined
      ? block
      : {
          ...block,
          performedMovements: entry.movements,
          performedSeconds: entry.seconds,
        };
  });
};

/** Tout ce que le client rend à la fin d'une séance, ou en corrigeant un
 * bilan. */
export type SessionResults = {
  performed?: PerformedInput[];
  roundsDone?: RoundsInput[];
  ladderDone?: LadderInput[];
  chipperDone?: ChipperInput[];
};

/**
 * Pose sur un snapshot tout ce que le client a fait : le réalisé des séries
 * sur les exercices, les tours bouclés et le résultat d'une échelle sur les
 * blocs.
 *
 * L'enchaînement vivait dans le contrôleur, deux fois — fin de séance et
 * correction — où aucun test ne le voyait : un champ ajouté au schéma mais
 * oublié dans l'une des deux chaînes passait la validation puis
 * disparaissait. Il est écrit une fois, ici, et vérifié.
 */
export const applySessionResults = <B extends BlockLike>(
  blocks: B[],
  { performed, roundsDone, ladderDone, chipperDone }: SessionResults
) =>
  applyChipperDone(
    applyLadderDone(
      applyRoundsDone(applyPerformed(blocks, performed), roundsDone),
      ladderDone
    ),
    chipperDone
  );
