/**
 * Ce que la fin d'une séance laisse passer.
 *
 * `validate` écrit dans `req.body` la valeur qui a correspondu au schéma, et
 * rien d'autre : un champ absent du schéma n'atteint jamais le contrôleur.
 * C'est ce qui ferme le mass assignment — et c'est aussi ce qui ferait
 * disparaître sans bruit un champ ajouté au front mais oublié ici. Le
 * résultat d'une échelle est le dernier venu : on vérifie qu'il passe, et
 * qu'il passe borné.
 */
import { describe, expect, it } from 'vitest';
import {
  completeSessionSchema,
  updateCompletedSessionSchema,
} from './client.schema';

const feedback = { effort: 3 };
const ladderDone = [{ blockOrder: 2, rungs: 4, seconds: 720 }];

describe('le résultat d’une échelle', () => {
  it('passe la fin de séance, tel quel', () => {
    const parsed = completeSessionSchema.parse({
      params: { sessionId: 's1' },
      body: { feedback, ladderDone },
    });
    expect(parsed.body.ladderDone).toEqual(ladderDone);
  });

  it('passe aussi la correction d’un bilan', () => {
    const parsed = updateCompletedSessionSchema.parse({
      params: { id: 'c1' },
      body: { ladderDone },
    });
    expect(parsed.body.ladderDone).toEqual(ladderDone);
  });

  it('refuse plus de trente paliers, ou plus de trois heures', () => {
    const body = (entry: object) => ({
      params: { sessionId: 's1' },
      body: { feedback, ladderDone: [{ ...ladderDone[0], ...entry }] },
    });
    expect(completeSessionSchema.safeParse(body({ rungs: 31 })).success).toBe(
      false
    );
    expect(
      completeSessionSchema.safeParse(body({ seconds: 180 * 60 + 1 })).success
    ).toBe(false);
    expect(completeSessionSchema.safeParse(body({ rungs: -1 })).success).toBe(
      false
    );
  });
});

const chipperDone = [{ blockOrder: 3, movements: 2, seconds: 1200 }];

describe('le résultat d’un chipper', () => {
  it('passe la fin de séance et la correction, tel quel', () => {
    const done = completeSessionSchema.parse({
      params: { sessionId: 's1' },
      body: { feedback, chipperDone },
    });
    expect(done.body.chipperDone).toEqual(chipperDone);
    const fixed = updateCompletedSessionSchema.parse({
      params: { id: 'c1' },
      body: { chipperDone },
    });
    expect(fixed.body.chipperDone).toEqual(chipperDone);
  });

  it('refuse plus de cinquante mouvements, ou plus de trois heures', () => {
    const body = (entry: object) => ({
      params: { sessionId: 's1' },
      body: { feedback, chipperDone: [{ ...chipperDone[0], ...entry }] },
    });
    expect(
      completeSessionSchema.safeParse(body({ movements: 51 })).success
    ).toBe(false);
    expect(
      completeSessionSchema.safeParse(body({ seconds: 180 * 60 + 1 })).success
    ).toBe(false);
  });
});
