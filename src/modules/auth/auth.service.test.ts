/**
 * Rejoindre un coach avec le compte déjà ouvert (F9), sans base de données.
 *
 * Les lectures sont remplacées par ce qu'elles rendraient, les écritures par
 * des espions. Un filtre qui autorise s'éprouve par ce qu'il demande : la
 * question « ce compte suit-il déjà ce coach ? » doit porter les deux
 * identifiants, et le rattachement viser le compte de la session.
 */
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Client from '../../models/Client';
import Coach from '../../models/Coach';
import InvitationToken from '../../models/InvitationToken';
import { isLinkedTo, joinCoach } from './auth.service';

// Des identifiants écrits, pas engendrés : deux décors identiques doivent
// l'être vraiment.
const SARAH = new Types.ObjectId('64a000000000000000000001');
const JULIE = new Types.ObjectId('64c000000000000000000001');
/** Le compte de Julie, la personne derrière le coach. */
const JULIE_USER = new Types.ObjectId('64a000000000000000000002');
const TOMORROW = new Date('2999-01-01T00:00:00Z');
const YESTERDAY = new Date('2000-01-01T00:00:00Z');

afterEach(() => vi.restoreAllMocks());

describe('ce compte suit-il déjà ce coach ?', () => {
  it('la question porte le compte et le coach', async () => {
    const exists = vi
      .spyOn(Client, 'exists')
      .mockResolvedValue({ _id: SARAH } as never);
    expect(await isLinkedTo(SARAH, JULIE)).toBe(true);
    expect(exists).toHaveBeenCalledWith({
      userId: SARAH,
      'coaches.coachId': JULIE,
    });
  });

  it('non, quand rien ne correspond', async () => {
    vi.spyOn(Client, 'exists').mockResolvedValue(null as never);
    expect(await isLinkedTo(SARAH, JULIE)).toBe(false);
  });
});

describe('rejoindre avec le compte ouvert', () => {
  const token = (expiresAt: Date) =>
    vi
      .spyOn(InvitationToken, 'findOne')
      .mockResolvedValue({ coachId: JULIE, expiresAt } as never);
  /** Le coach du lien, et le compte qui le tient. */
  const coachOf = (userId: Types.ObjectId) =>
    vi.spyOn(Coach, 'findById').mockReturnValue({
      select: async () => ({ _id: JULIE, userId }),
    } as never);
  const writes = () => ({
    upsert: vi
      .spyOn(Client, 'findOneAndUpdate')
      .mockResolvedValue(null as never),
    push: vi
      .spyOn(Client, 'updateOne')
      .mockResolvedValue({ modifiedCount: 1 } as never),
  });

  it('rattache le compte de la session au coach du lien', async () => {
    token(TOMORROW);
    coachOf(JULIE_USER);
    const { push } = writes();
    expect(String(await joinCoach(String(SARAH), 'jeton'))).toBe(String(JULIE));
    const [filter, update] = push.mock.calls[0] as unknown as [
      { userId: Types.ObjectId },
      { $push: { coaches: { coachId: Types.ObjectId } } },
    ];
    expect(String(filter.userId)).toBe(String(SARAH));
    expect(String(update.$push.coaches.coachId)).toBe(String(JULIE));
  });

  it('un lien expiré n’écrit rien', async () => {
    token(YESTERDAY);
    coachOf(JULIE_USER);
    const { upsert, push } = writes();
    await expect(joinCoach(SARAH, 'jeton')).rejects.toThrow(
      "Token d'invitation expiré"
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  // Le coach qui essaie son lien devenait son propre client, et sa liste
  // le comptait.
  it('le coach qui ouvre son propre lien ne le rejoint pas : 409, rien d’écrit', async () => {
    token(TOMORROW);
    const find = coachOf(JULIE_USER);
    const { upsert, push } = writes();
    await expect(joinCoach(String(JULIE_USER), 'jeton')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(find).toHaveBeenCalledWith(JULIE);
    expect(upsert).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('un lien inconnu n’écrit rien', async () => {
    vi.spyOn(InvitationToken, 'findOne').mockResolvedValue(null as never);
    const { upsert, push } = writes();
    await expect(joinCoach(SARAH, 'jeton')).rejects.toThrow(
      "Token d'invitation invalide"
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
