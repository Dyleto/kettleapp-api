import { describe, it, expect } from 'vitest';
import { sessionsForImport } from './template.service';
import type { IProgramTemplate } from '../../models/ProgramTemplate';

/** Un modèle réduit à ce que la mise en forme lit. */
const template = (
  sessions: Record<string, unknown>[]
): Pick<IProgramTemplate, 'sessions'> =>
  ({ sessions }) as unknown as Pick<IProgramTemplate, 'sessions'>;

const session = (overrides: Record<string, unknown> = {}) => ({
  _id: 'sess-du-modele',
  order: 1,
  name: 'Full body A',
  notes: 'À faire au réveil',
  suggestedDays: [0, 3],
  blocks: [{ _id: 'blk-du-modele', type: 'classic', order: 1, exercises: [] }],
  createdAt: new Date('2026-06-01T10:00:00Z'),
  updatedAt: new Date('2026-06-01T10:00:00Z'),
  ...overrides,
});

describe('sessionsForImport', () => {
  /**
   * Le cas qui justifie cette fonction : `_id` est unique dans la collection
   * des séances. Les recopier ferait échouer le second import du même modèle
   * sur une erreur de clé dupliquée, le premier client ayant pris les
   * identifiants.
   */
  it("ne recopie pas l'identifiant de la séance du modèle", () => {
    const [first] = sessionsForImport(template([session()]));
    expect(first).not.toHaveProperty('_id');
  });

  // Les blocs sont des sous-documents, portés par leur séance : deux séances
  // peuvent porter les mêmes identifiants de bloc sans se gêner, et les
  // garder évite à l'atelier de reconstruire toute la séance à l'écran.
  it('garde en revanche les identifiants de blocs', () => {
    const [first] = sessionsForImport(template([session()]));
    expect(first.blocks[0]._id).toBe('blk-du-modele');
  });

  it('reporte ce que le coach a écrit', () => {
    const [first] = sessionsForImport(template([session()]));
    expect(first.name).toBe('Full body A');
    expect(first.notes).toBe('À faire au réveil');
    expect(first.suggestedDays).toEqual([0, 3]);
  });

  // Le rang vient de la position, et `replaceProgramSessions` le réécrit :
  // le recopier ici donnerait deux sources pour la même chose.
  it('ne recopie pas le rang', () => {
    const [first] = sessionsForImport(template([session({ order: 7 })]));
    expect(first).not.toHaveProperty('order');
  });

  // Un modèle sans jour conseillé doit donner un tableau vide et non
  // `undefined` : c'est ce que le schéma d'entrée attend, et un `undefined`
  // y ferait disparaître la clé.
  it('rend un tableau vide quand aucun jour n’est conseillé', () => {
    const [first] = sessionsForImport(
      template([session({ suggestedDays: undefined })])
    );
    expect(first.suggestedDays).toEqual([]);
  });

  it('garde l’ordre des séances du modèle', () => {
    const sessions = sessionsForImport(
      template([
        session({ name: 'Première' }),
        session({ name: 'Deuxième' }),
        session({ name: 'Troisième' }),
      ])
    );
    expect(sessions.map((s) => s.name)).toEqual([
      'Première',
      'Deuxième',
      'Troisième',
    ]);
  });

  it('rend une liste vide pour un modèle sans séance', () => {
    expect(sessionsForImport(template([]))).toEqual([]);
  });
});
