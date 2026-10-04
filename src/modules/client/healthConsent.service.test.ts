import { describe, it, expect } from 'vitest';
import {
  sharingAllowed,
  filterFeedback,
  filterComment,
  CARRIES_HEALTH_DATA,
} from './healthConsent.service';
import type { Feedback } from './client.schema';
import { HEALTH_CONSENT_VERSION } from '../../shared/constants/consent';
import type { IClient } from '../../models/Client';

type Holder = Pick<IClient, 'healthConsent'>;

const DECIDED = new Date('2026-09-15T10:00:00Z');

const granted = (version = HEALTH_CONSENT_VERSION): Holder => ({
  healthConsent: { granted: true, decidedAt: DECIDED, version },
});

const refused = (): Holder => ({
  healthConsent: {
    granted: false,
    decidedAt: DECIDED,
    version: HEALTH_CONSENT_VERSION,
  },
});

// Un ressenti complet : une mesure d'entraînement, deux données de santé.
const full = (): Feedback => ({
  effort: 4,
  tags: ['pain', 'poor_sleep'],
  note: 'Mal au genou depuis mardi',
});

describe('sharingAllowed', () => {
  it('accepte un accord donné au texte en vigueur', () => {
    expect(sharingAllowed(granted())).toBe(true);
  });

  it('refuse un refus', () => {
    expect(sharingAllowed(refused())).toBe(false);
  });

  // Le cas qui justifie que la version soit enregistrée : sans cette
  // comparaison, un accord de 2024 vaudrait pour un texte réécrit depuis.
  it('refuse un accord donné à une version antérieure du texte', () => {
    expect(sharingAllowed(granted('2024-01'))).toBe(false);
  });

  // Un client créé avant l'arrivée du consentement, ou qui n'a pas encore
  // répondu : on s'en tient au plus prudent.
  it("refuse quand aucune décision n'a été prise", () => {
    expect(sharingAllowed({})).toBe(false);
  });

  // Mongoose rend les chemins imbriqués absents comme des objets dont les
  // clés valent `undefined` : le cas existe pour de vrai sur un document
  // hydraté, et il ne doit pas valoir accord.
  it('refuse un enregistrement de consentement vide', () => {
    const vacant = {
      healthConsent: {
        granted: undefined,
        decidedAt: undefined,
        version: undefined,
      },
    } as unknown as Holder;
    expect(sharingAllowed(vacant)).toBe(false);
  });
});

describe('filterFeedback', () => {
  it('garde tout quand le partage est accepté', () => {
    expect(filterFeedback(full(), granted())).toEqual(full());
  });

  it("retire les étiquettes et le commentaire quand il n'est pas accepté", () => {
    const filtered = filterFeedback(full(), refused());
    expect(filtered).toEqual({ effort: 4 });
    // `toEqual` ignore une clé à `undefined` : on vérifie qu'elles sont
    // absentes, parce que c'est l'absence qui empêche Mongoose de les écrire.
    expect(Object.keys(filtered).sort()).toEqual(['effort']);
  });

  // L'effort règle la charge d'entraînement, ce n'est pas une donnée de santé.
  // Le refuser aurait privé le coach de la seule mesure dont il a besoin.
  it("garde l'effort même sans accord", () => {
    expect(filterFeedback({ effort: 2 }, refused())).toEqual({ effort: 2 });
  });

  it('refuse aussi sur un accord périmé', () => {
    expect(filterFeedback(full(), granted('2024-01'))).toEqual({ effort: 4 });
  });

  // Le contrôleur écrit le résultat avec `completed.set('feedback', …)` : si
  // le filtre travaillait sur place, l'objet validé par Zod — relu ailleurs
  // dans la même requête — perdrait ses clés au passage.
  it("ne touche pas à l'objet qu'on lui donne", () => {
    const original = full();
    filterFeedback(original, refused());
    expect(original).toEqual(full());
  });
});

describe('filterComment', () => {
  it('garde le commentaire quand le partage est accepté', () => {
    expect(filterComment('RAS', granted())).toBe('RAS');
  });

  it("l'efface quand il n'est pas accepté", () => {
    expect(filterComment('Mal au genou', refused())).toBeUndefined();
  });

  it('laisse `undefined` tel quel', () => {
    expect(filterComment(undefined, granted())).toBeUndefined();
  });
});

/**
 * Résolution d'un chemin pointé, comme MongoDB la fait.
 *
 * `a.b.0` descend dans l'objet puis prend le premier élément du tableau : un
 * tableau vide n'a pas de `0`, et c'est précisément ce que la condition
 * exploite.
 */
const at = (doc: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (value, segment) =>
        value === null || value === undefined
          ? undefined
          : (value as Record<string, unknown>)[segment],
      doc
    );

/**
 * Les deux seuls opérateurs que `CARRIES_HEALTH_DATA` emploie, interprétés.
 *
 * Ce n'est pas MongoDB et cela ne prétend pas l'être : c'est une lecture
 * indépendante de `$exists` et `$ne`, écrite pour que la condition soit
 * éprouvée sur des documents plutôt que comparée à une copie d'elle-même.
 * Une assertion qui recopierait la chaîne `'feedback.tags.0'` tomberait sur
 * une faute de frappe et sur rien d'autre.
 */
const matches = (doc: unknown): boolean =>
  CARRIES_HEALTH_DATA.$or.some((clause) =>
    Object.entries(clause).every(([path, test]) => {
      const value = at(doc, path);
      const conditions = test as { $exists?: boolean; $ne?: unknown };
      if (conditions.$exists === true && value === undefined) return false;
      if ('$ne' in conditions && value === conditions.$ne) return false;
      return true;
    })
  );

describe('CARRIES_HEALTH_DATA', () => {
  it('retient un bilan qui porte une étiquette', () => {
    expect(matches({ feedback: { effort: 3, tags: ['pain'] } })).toBe(true);
  });

  it('retient un bilan qui porte un commentaire', () => {
    expect(
      matches({ feedback: { effort: 3 }, clientNotes: 'Mal au dos' })
    ).toBe(true);
  });

  // Le cas qui a imposé `tags.0` : un tableau vide existe sans rien contenir,
  // et le compter ferait annoncer au client qu'on va effacer des séances où
  // il n'y a rien à effacer.
  it('ignore une liste d’étiquettes vide', () => {
    expect(matches({ feedback: { effort: 3, tags: [] } })).toBe(false);
  });

  // Même raison : une correction qui a vidé le commentaire laisse une chaîne
  // vide derrière elle, qui n'est pas une donnée de santé.
  it('ignore un commentaire vide', () => {
    expect(matches({ feedback: { effort: 3 }, clientNotes: '' })).toBe(false);
  });

  it('ignore un bilan qui ne porte que son effort', () => {
    expect(matches({ feedback: { effort: 3 } })).toBe(false);
  });

  it('ignore un bilan sans ressenti du tout', () => {
    expect(matches({ sessionName: 'Haut du corps' })).toBe(false);
  });
});
