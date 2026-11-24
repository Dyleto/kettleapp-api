/**
 * Un modèle tel qu'il sort de l'API, éprouvé sur un vrai document.
 *
 * Les autres tests des modèles passent des objets ordinaires, et c'est ce qui
 * avait laissé passer le défaut : sur un document Mongoose, les séances sont
 * des sous-documents, que `formatSession` recopiait sans leurs champs. Le
 * contrat les refusait, et tout modèle qui portait une séance répondait 500
 * — à l'ouverture, à l'enregistrement, à la duplication, à « Enregistrer
 * comme modèle ». Aucune base de données : le document est hydraté sans
 * connexion, l'exercice repeuplé à la main, comme `populate` le laisse.
 */
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import ProgramTemplate from '../../models/ProgramTemplate';
import Exercise from '../../models/Exercise';
import { templateWrapperPayload } from '../../contract';
import { templateOutput } from './template.service';

const DAY = new Date('2026-06-01T10:00:00.000Z');

/** Un modèle d'une séance, un EMOM d'un exercice, l'exercice repeuplé. */
const hydrated = () => {
  const exercise = new Exercise({
    name: 'Goblet Squat',
    createdBy: new Types.ObjectId(),
    createdAt: DAY,
    updatedAt: DAY,
  });
  return new ProgramTemplate({
    coachId: new Types.ObjectId(),
    name: 'Prise de masse',
    sessions: [
      {
        order: 1,
        name: 'Full body A',
        suggestedDays: [0, 3],
        createdAt: DAY,
        updatedAt: DAY,
        blocks: [
          {
            type: 'emom',
            order: 1,
            rounds: 10,
            exercises: [{ exerciseId: exercise, order: 1, reps: 12 }],
          },
        ],
      },
    ],
    createdAt: DAY,
    updatedAt: DAY,
  });
};

/** Parser en nommant ce qui n'a pas passé. */
const parsed = (data: unknown) => {
  const r = templateWrapperPayload.safeParse(data);
  expect(
    r.success,
    r.success ? '' : r.error.issues.map((i) => i.path.join('.')).join(', ')
  ).toBe(true);
  return r.data as z.infer<typeof templateWrapperPayload>;
};

describe('un modèle qui porte une séance sort entier', () => {
  it('il passe le contrat de sortie', () => {
    parsed({ template: templateOutput(hydrated()) });
  });

  it('la séance garde ce que l’atelier lit : son identifiant, son rang, son nom, ses jours', () => {
    const template = hydrated();
    const { sessions } = parsed({
      template: templateOutput(template),
    }).template;
    expect(sessions[0]._id).toBe(String(template.sessions[0]._id));
    expect(sessions[0]).toMatchObject({
      order: 1,
      name: 'Full body A',
      suggestedDays: [0, 3],
    });
  });

  it('le bloc et son exercice repeuplé sortent, l’exercice nommé', () => {
    const { sessions } = parsed({
      template: templateOutput(hydrated()),
    }).template;
    expect(sessions[0].blocks[0]).toMatchObject({ type: 'emom', rounds: 10 });
    expect(sessions[0].blocks[0].exercises[0]).toMatchObject({
      order: 1,
      reps: 12,
      exercise: { name: 'Goblet Squat' },
    });
  });
});
