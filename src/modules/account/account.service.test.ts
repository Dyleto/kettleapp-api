/**
 * Ce que la suppression d'un compte de coach emporte, sans base : chaque
 * suppression de la liste, ce qu'elle vise, et dans la transaction.
 */
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Exercise from '../../models/Exercise';
import InvitationToken from '../../models/InvitationToken';
import ProgramTemplate from '../../models/ProgramTemplate';
import Tag from '../../models/Tag';
import { coachOwned } from './account.service';

const JULIE = new Types.ObjectId('64c000000000000000000001');
const SESSION = { id: 'transaction' } as never;

afterEach(() => vi.restoreAllMocks());

describe('ce qui part avec le compte d’un coach', () => {
  const spies = () => ({
    exercises: vi.spyOn(Exercise, 'deleteMany').mockResolvedValue({} as never),
    invitations: vi
      .spyOn(InvitationToken, 'deleteMany')
      .mockResolvedValue({} as never),
    templates: vi
      .spyOn(ProgramTemplate, 'deleteMany')
      .mockResolvedValue({} as never),
    tags: vi.spyOn(Tag, 'deleteMany').mockResolvedValue({} as never),
  });

  const run = async () => {
    for (const remove of coachOwned(JULIE)) await remove(SESSION);
  };

  it('sa bibliothèque et ses invitations', async () => {
    const { exercises, invitations } = spies();
    await run();
    expect(exercises).toHaveBeenCalledWith(
      { createdBy: JULIE },
      { session: SESSION }
    );
    expect(invitations).toHaveBeenCalledWith(
      { coachId: JULIE },
      { session: SESSION }
    );
  });

  // Arrivés après l'écriture de la suppression, ils y manquaient.
  it('ses modèles et ses étiquettes aussi, dans la même transaction', async () => {
    const { templates, tags } = spies();
    await run();
    expect(templates).toHaveBeenCalledWith(
      { coachId: JULIE },
      { session: SESSION }
    );
    expect(tags).toHaveBeenCalledWith({ coachId: JULIE }, { session: SESSION });
  });
});
