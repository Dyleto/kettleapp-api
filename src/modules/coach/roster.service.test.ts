/**
 * Ce que décide la liste des clients, sans base de données.
 *
 * L'agrégation reste éprouvée par l'usage ; ce qui est ici, c'est ce qu'elle
 * laissait à MongoDB et qui ne dépend pas de lui : quel lien de rattachement
 * lire, ce qu'est une absence, et les bornes d'une page d'historique.
 */
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { clientRowPayload } from '../../contract';
import {
  HISTORY_PAGE,
  RawClientRow,
  clientRow,
  clientRowsPipeline,
  historyWindow,
} from './roster.service';

// Des identifiants écrits plutôt qu'engendrés : deux décors identiques
// doivent l'être vraiment.
const JULIE = new Types.ObjectId('64b000000000000000000001');
const MARC = new Types.ObjectId('64b000000000000000000002');
const SARAH = new Types.ObjectId('64b0000000000000000000aa');

const row = (overrides: Partial<RawClientRow> = {}): RawClientRow => ({
  _id: SARAH,
  firstName: 'Sarah',
  lastName: 'Martin',
  coaches: [{ coachId: JULIE, linkedAt: new Date('2026-06-01T09:00:00Z') }],
  stats: [
    {
      lastCompletedAt: new Date('2026-09-20T07:00:00Z'),
      lastEffort: 4,
      unseen: 2,
    },
  ],
  ...overrides,
});

describe('la liste ne montre que les clients de ce coach', () => {
  // Tout le reste de l'agrégation est de la présentation ; cette étape est
  // une autorisation. Sans elle, chaque coach lirait tous les clients.
  it('la première étape borne la liste aux liens de ce coach', () => {
    expect(clientRowsPipeline(JULIE)[0]).toEqual({
      $match: { 'coaches.coachId': JULIE },
    });
  });
});

describe('le rattachement est celui de ce coach', () => {
  const twoCoaches = row({
    coaches: [
      { coachId: MARC, linkedAt: new Date('2025-01-10T09:00:00Z') },
      { coachId: JULIE, linkedAt: new Date('2026-06-01T09:00:00Z') },
    ],
  });

  it('suivi par deux coachs, chacun lit sa propre date', () => {
    expect(clientRow(twoCoaches, JULIE).linkedAt).toEqual(
      new Date('2026-06-01T09:00:00Z')
    );
    expect(clientRow(twoCoaches, MARC).linkedAt).toEqual(
      new Date('2025-01-10T09:00:00Z')
    );
  });

  // Un lien relu depuis la base porte un ObjectId, un coach tenu par la
  // session aussi, mais pas forcément la même instance : `===` les dirait
  // différents.
  it('deux instances du même identifiant désignent le même coach', () => {
    const same = new Types.ObjectId(JULIE.toHexString());
    expect(clientRow(twoCoaches, same).linkedAt).toEqual(
      new Date('2026-06-01T09:00:00Z')
    );
  });
});

describe('une absence reste une absence', () => {
  it('sans séance terminée : rien de lu, rien à dater', () => {
    const shaped = clientRow(row({ stats: [] }), JULIE);
    expect(shaped.unseenCount).toBe(0);
    expect(shaped.lastCompletedAt).toBeUndefined();
    expect(shaped.lastEffort).toBeUndefined();
  });

  // `$first` rend `null` pour un champ manquant : la dernière séance
  // terminée sans se prononcer.
  it('un ressenti que MongoDB rend nul devient absent', () => {
    const stats = [{ ...row().stats[0], lastEffort: null }];
    expect(clientRow(row({ stats }), JULIE).lastEffort).toBeUndefined();
  });

  // L'enjeu de la précédente : le contrat refuse `null`, et `respond`
  // aurait fait répondre 500 à toute la liste pour un seul client.
  it('la ligne passe le contrat', () => {
    const stats = [{ ...row().stats[0], lastEffort: null }];
    expect(
      clientRowPayload.safeParse(clientRow(row({ stats }), JULIE)).success
    ).toBe(true);
  });

  it('ce qui est là passe tel quel', () => {
    expect(clientRow(row(), JULIE)).toMatchObject({
      unseenCount: 2,
      lastEffort: 4,
      lastCompletedAt: new Date('2026-09-20T07:00:00Z'),
    });
  });
});

describe('une page d’historique a ses bornes', () => {
  it('sans rien demander : la première page, à la taille par défaut', () => {
    expect(historyWindow({})).toEqual({
      skip: 0,
      limit: HISTORY_PAGE.default,
    });
  });

  it('la page avance d’autant de séances qu’elle en rend', () => {
    expect(historyWindow({ page: '3', limit: '20' })).toEqual({
      skip: 40,
      limit: 20,
    });
  });

  it('demander plus que le plafond rend le plafond', () => {
    expect(historyWindow({ limit: '5000' }).limit).toBe(HISTORY_PAGE.max);
  });

  // MongoDB lit une limite négative comme « tant, puis ferme le curseur » :
  // rien ne devait l'atteindre.
  it('une limite nulle ou négative rend au moins une séance', () => {
    expect(historyWindow({ limit: '-5' }).limit).toBe(1);
    expect(historyWindow({ limit: '0' }).limit).toBe(1);
  });

  it('une page nulle, négative ou illisible est la première', () => {
    expect(historyWindow({ page: '0' }).skip).toBe(0);
    expect(historyWindow({ page: '-2' }).skip).toBe(0);
    expect(historyWindow({ page: 'deux' }).skip).toBe(0);
  });
});
