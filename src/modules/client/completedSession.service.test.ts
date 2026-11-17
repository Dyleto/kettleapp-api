/**
 * Ce que `applyRoundsDone` pose sur un instantané de séance.
 *
 * Un AMRAP ne se coche pas, il se compte : le client rend un nombre de tours
 * bouclés par bloc, et il faut le poser à côté du prescrit sans l'écraser —
 * c'est leur comparaison qui a de la valeur pour le coach.
 *
 * Fonction pure, aucune base de données.
 */
import { describe, expect, it } from 'vitest';
import {
  applyChipperDone,
  applyLadderDone,
  applyRoundsDone,
  applySessionResults,
} from './completedSession.service';

/** Trois blocs, dont un seul prescrit des tours. */
const blocks = () => [
  { order: 1, type: 'warmup', rounds: undefined as number | undefined },
  { order: 2, type: 'amrap', rounds: undefined as number | undefined },
  { order: 3, type: 'emom', rounds: 10 as number | undefined },
];

describe('sans rien à appliquer', () => {
  it('rend les blocs tels quels, et la même référence', () => {
    const before = blocks();
    expect(applyRoundsDone(before, undefined)).toBe(before);
  });

  it('une liste vide ne touche à rien non plus', () => {
    const before = blocks();
    expect(applyRoundsDone(before, [])).toBe(before);
  });
});

describe('le score se pose sur le bloc visé', () => {
  it('et sur lui', () => {
    const after = applyRoundsDone(blocks(), [{ blockOrder: 2, rounds: 6 }]);
    expect(after.find((b) => b.order === 2)?.performedRounds).toBe(6);
  });

  it('et sur aucun autre', () => {
    const after = applyRoundsDone(blocks(), [{ blockOrder: 2, rounds: 6 }]);
    expect(after.filter((b) => b.performedRounds !== undefined)).toHaveLength(
      1
    );
  });

  it('sans écraser le prescrit', () => {
    // C'est tout l'intérêt : « 10 prescrits, 8 faits » dit quelque chose que
    // ni l'un ni l'autre ne dit seul.
    const after = applyRoundsDone(blocks(), [{ blockOrder: 3, rounds: 8 }]);
    const emom = after.find((b) => b.order === 3);
    expect(emom?.rounds).toBe(10);
    expect(emom?.performedRounds).toBe(8);
  });
});

describe('zéro est une réponse, pas une absence', () => {
  it('zéro tour est enregistré, pas effacé', () => {
    const after = applyRoundsDone(blocks(), [{ blockOrder: 2, rounds: 0 }]);
    expect(after.find((b) => b.order === 2)?.performedRounds).toBe(0);
  });
});

describe('ce qui ne correspond à rien', () => {
  it('un ordre inconnu n’invente pas de bloc', () => {
    const after = applyRoundsDone(blocks(), [{ blockOrder: 99, rounds: 4 }]);
    expect(after).toHaveLength(3);
    expect(after.every((b) => b.performedRounds === undefined)).toBe(true);
  });
});

describe('l’entrée n’est pas modifiée au passage', () => {
  it('l’instantané d’origine reste intact', () => {
    // Le bilan est enregistré depuis cet objet : le muter au passage
    // écrirait le réalisé dans le prescrit.
    const before = blocks();
    applyRoundsDone(before, [{ blockOrder: 2, rounds: 5 }]);
    expect(
      (before[1] as { performedRounds?: number }).performedRounds
    ).toBeUndefined();
  });
});

/**
 * Ce que `applyLadderDone` pose sur un instantané : les paliers faits d'une
 * échelle bornée et le temps au chrono, à côté de la prescription.
 */
describe('une échelle bornée', () => {
  const ladderBlocks = () => [
    { order: 1, type: 'warmup', repsScheme: undefined as number[] | undefined },
    {
      order: 2,
      type: 'ladder',
      repsScheme: [2, 4, 6, 8, 6, 4, 2] as number[] | undefined,
      durationMinutes: 12 as number | undefined,
    },
  ];

  it('rend les blocs tels quels quand rien n’est envoyé', () => {
    const before = ladderBlocks();
    expect(applyLadderDone(before, undefined)).toBe(before);
    expect(applyLadderDone(before, [])).toBe(before);
  });

  it('pose les paliers et le temps sur le bloc visé, et sur lui seul', () => {
    const after = applyLadderDone(ladderBlocks(), [
      { blockOrder: 2, rungs: 4, seconds: 720 },
    ]);
    const ladder = after.find((b) => b.order === 2);
    expect([ladder?.performedRungs, ladder?.performedSeconds]).toEqual([
      4, 720,
    ]);
    expect(after.find((b) => b.order === 1)?.performedRungs).toBeUndefined();
  });

  it('sans toucher aux paliers prescrits ni à la limite', () => {
    const after = applyLadderDone(ladderBlocks(), [
      { blockOrder: 2, rungs: 7, seconds: 582 },
    ]);
    const ladder = after.find((b) => b.order === 2);
    expect(ladder?.repsScheme).toEqual([2, 4, 6, 8, 6, 4, 2]);
    expect(ladder?.durationMinutes).toBe(12);
  });

  it('enregistre zéro palier : la limite est tombée au premier', () => {
    const after = applyLadderDone(ladderBlocks(), [
      { blockOrder: 2, rungs: 0, seconds: 720 },
    ]);
    expect(after.find((b) => b.order === 2)?.performedRungs).toBe(0);
  });
});

/**
 * Ce que `applyChipperDone` pose sur un instantané : les mouvements faits
 * d'un chipper ou d'un TimeCap borné et le temps au chrono.
 */
describe('un chipper borné', () => {
  const chipperBlocks = () => [
    { order: 1, type: 'warmup' },
    { order: 2, type: 'chipper', durationMinutes: 20 as number | undefined },
  ];

  it('rend les blocs tels quels quand rien n’est envoyé', () => {
    const before = chipperBlocks();
    expect(applyChipperDone(before, undefined)).toBe(before);
    expect(applyChipperDone(before, [])).toBe(before);
  });

  it('pose les mouvements et le temps sur le bloc visé, et sur lui seul', () => {
    const after = applyChipperDone(chipperBlocks(), [
      { blockOrder: 2, movements: 3, seconds: 1200 },
    ]);
    expect(after[1]).toMatchObject({
      performedMovements: 3,
      performedSeconds: 1200,
      durationMinutes: 20,
    });
    expect(after[0]).toEqual({ order: 1, type: 'warmup' });
  });

  it('enregistre zéro mouvement : la limite est tombée pendant le premier', () => {
    const after = applyChipperDone(chipperBlocks(), [
      { blockOrder: 2, movements: 0, seconds: 1200 },
    ]);
    expect(after[1].performedMovements).toBe(0);
  });
});

/**
 * Les quatre passes ensemble, telles que la fin de séance et la correction
 * d'un bilan les appliquent.
 */
describe('tout ce que le client rend, en une fois', () => {
  const session = () => [
    {
      order: 1,
      type: 'amrap',
      exercises: [{ order: 1 }],
    },
    {
      order: 2,
      type: 'ladder',
      exercises: [{ order: 1 }],
    },
    {
      order: 3,
      type: 'chipper',
      exercises: [{ order: 1 }],
    },
  ];

  it('pose le réalisé, les tours, l’échelle et le chipper, chacun à sa place', () => {
    const after = applySessionResults(session(), {
      performed: [{ blockOrder: 1, exerciseOrder: 1, sets: [{ reps: 10 }] }],
      roundsDone: [{ blockOrder: 1, rounds: 6 }],
      ladderDone: [{ blockOrder: 2, rungs: 5, seconds: 720 }],
      chipperDone: [{ blockOrder: 3, movements: 2, seconds: 900 }],
    });
    expect(after[0].exercises[0].performed?.sets).toEqual([{ reps: 10 }]);
    expect(after[0]).toMatchObject({ performedRounds: 6 });
    expect(after[1]).toMatchObject({
      performedRungs: 5,
      performedSeconds: 720,
    });
    expect(after[2]).toMatchObject({
      performedMovements: 2,
      performedSeconds: 900,
    });
  });

  it('ne touche à rien quand le client ne rend rien', () => {
    const after = applySessionResults(session(), {});
    expect(after).toEqual(session());
  });
});
