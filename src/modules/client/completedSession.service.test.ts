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
import { applyRoundsDone } from './completedSession.service';

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
