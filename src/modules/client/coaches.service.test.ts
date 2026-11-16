import { describe, it, expect } from 'vitest';
import { firstNamesInOrder } from './coaches.service';

const link = (id: string) => ({ coachId: id });
const coach = (id: string, firstName?: string | null) => ({
  _id: id,
  userId: firstName === null ? null : { firstName: firstName as string },
});

describe('firstNamesInOrder', () => {
  it('rend le prénom du coach, et lui seul', () => {
    expect(firstNamesInOrder([link('a')], [coach('a', 'Julie')])).toEqual([
      { firstName: 'Julie' },
    ]);
  });

  it("suit l'ordre des liens, pas celui de la requête", () => {
    expect(
      firstNamesInOrder(
        [link('a'), link('b')],
        [coach('b', 'Marc'), coach('a', 'Julie')]
      ).map((c) => c.firstName)
    ).toEqual(['Julie', 'Marc']);
  });

  it('garde un prénom vide : deux coachs ne doivent pas passer pour un', () => {
    expect(
      firstNamesInOrder(
        [link('a'), link('b')],
        [coach('a', 'Julie'), coach('b', '  ')]
      )
    ).toEqual([{ firstName: 'Julie' }, { firstName: '' }]);
  });

  it("écarte un coach dont le compte n'existe plus", () => {
    expect(
      firstNamesInOrder(
        [link('a'), link('b')],
        [coach('a', null), coach('b', 'Marc')]
      )
    ).toEqual([{ firstName: 'Marc' }]);
  });

  it('un lien sans coach retrouvé ne donne rien', () => {
    expect(firstNamesInOrder([link('a')], [])).toEqual([]);
  });

  it('retire les espaces autour du prénom', () => {
    expect(firstNamesInOrder([link('a')], [coach('a', ' Julie ')])).toEqual([
      { firstName: 'Julie' },
    ]);
  });
});
