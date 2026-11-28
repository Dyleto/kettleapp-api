/**
 * L'usage d'un exercice, sans base de données : ce que la requête demande,
 * et ce qu'on fait de ce qu'elle rend.
 *
 * Une lecture remplacée ne regarde pas ce qu'on lui demande : c'est donc la
 * requête elle-même qu'on éprouve — à qui elle se borne, ce qu'elle compte.
 */
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Client from '../../models/Client';
import Session from '../../models/Session';
import ProgramTemplate from '../../models/ProgramTemplate';
import {
  exerciseInUse,
  exerciseUsage,
  usageByExercise,
  usagePipeline,
} from './exercise.service';

const JULIE = new Types.ObjectId('64b000000000000000000001');
const SWING = new Types.ObjectId('64b0000000000000000000e1');
const SQUAT = new Types.ObjectId('64b0000000000000000000e2');

afterEach(() => vi.restoreAllMocks());

describe('ce que la requête demande', () => {
  // Une autorisation, pas une présentation : sans elle, un coach compterait
  // les séances de tous les clients.
  it('elle part des seuls clients de ce coach', () => {
    expect(usagePipeline(JULIE)[0]).toEqual({
      $match: { 'coaches.coachId': JULIE },
    });
  });

  it('elle compte les séances et les clients, chacun une fois', () => {
    const group = usagePipeline(JULIE).find((stage) => '$group' in stage) as {
      $group: Record<string, unknown>;
    };
    expect(group.$group).toEqual({
      _id: '$sessions.blocks.exercises.exerciseId',
      sessionIds: { $addToSet: '$sessions._id' },
      clientIds: { $addToSet: '$_id' },
    });
    const stages = usagePipeline(JULIE);
    expect(stages[stages.length - 1]).toEqual({
      $project: {
        sessions: { $size: '$sessionIds' },
        clients: { $size: '$clientIds' },
      },
    });
  });
});

describe('ce qu’on fait de ce qu’elle rend', () => {
  it('rangé par exercice : séances et clients', () => {
    const usage = usageByExercise([
      { _id: SWING, sessions: 12, clients: 4 },
      { _id: SQUAT, sessions: 3, clients: 1 },
    ]);
    expect(usage.get(String(SWING))).toEqual({ sessions: 12, clients: 4 });
    expect(usage.get(String(SQUAT))).toEqual({ sessions: 3, clients: 1 });
  });

  it('la lecture passe par la requête de ce coach', async () => {
    const aggregate = vi
      .spyOn(Client, 'aggregate')
      .mockResolvedValue([{ _id: SWING, sessions: 5, clients: 2 }] as never);
    const usage = await exerciseUsage(JULIE);
    expect(aggregate).toHaveBeenCalledWith(usagePipeline(JULIE));
    // Deux nombres distincts : égaux, une inversion ne se verrait pas.
    expect(usage.get(String(SWING))).toEqual({ sessions: 5, clients: 2 });
  });
});

describe('où un exercice sert encore', () => {
  const where = (inSession: boolean, inTemplate: boolean) => ({
    session: vi
      .spyOn(Session, 'exists')
      .mockResolvedValue((inSession ? { _id: SWING } : null) as never),
    template: vi
      .spyOn(ProgramTemplate, 'exists')
      .mockResolvedValue((inTemplate ? { _id: SWING } : null) as never),
  });

  // Supprimé alors qu'un modèle le portait, il faisait répondre 500 au
  // modèle, puis aux programmes où on l'importait.
  it('dans un modèle seulement : il sert, et la séance d’un modèle est cherchée', async () => {
    const { template } = where(false, true);
    expect(await exerciseInUse(String(SWING))).toBe('template');
    expect(template).toHaveBeenCalledWith({
      'sessions.blocks.exercises.exerciseId': String(SWING),
    });
  });

  it('dans une séance de programme : il sert', async () => {
    const { session } = where(true, false);
    expect(await exerciseInUse(String(SWING))).toBe('session');
    expect(session).toHaveBeenCalledWith({
      'blocks.exercises.exerciseId': String(SWING),
    });
  });

  it('nulle part : il peut partir', async () => {
    where(false, false);
    expect(await exerciseInUse(String(SQUAT))).toBeNull();
  });
});
