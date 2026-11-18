/**
 * Le compte tel que le front le lit : ses rôles, et de quoi reconnaître les
 * siens — sans base de données, les lectures remplacées par ce qu'elles
 * rendraient.
 */
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Coach from '../../models/Coach';
import Client from '../../models/Client';
import type { IUser } from '../../models/User';
import { userPayload } from '../../contract';
import { buildUser } from './user.service';

const USER = {
  _id: new Types.ObjectId('660000000000000000000001'),
  firstName: 'Julie',
  email: 'julie@exemple.fr',
  isAdmin: false,
} as unknown as IUser;
const COACH = new Types.ObjectId('6600000000000000000000c1');

afterEach(() => vi.restoreAllMocks());

const roles = (coach: boolean, client: boolean) => {
  vi.spyOn(Coach, 'findOne').mockResolvedValue(
    (coach ? { _id: COACH } : null) as never
  );
  vi.spyOn(Client, 'findOne').mockResolvedValue(
    (client ? { _id: new Types.ObjectId() } : null) as never
  );
};

describe('de quoi reconnaître ses propres réponses', () => {
  // Deux coachs peuvent s'appeler Julie : c'est l'identifiant qui dit
  // laquelle a répondu.
  it('un compte coach porte son identifiant de coach', async () => {
    roles(true, false);
    const out = userPayload.parse(await buildUser(USER));
    expect(out.coachId).toBe('6600000000000000000000c1');
    expect(out.isCoach).toBe(true);
  });

  it('un compte qui n’est que client n’en porte pas', async () => {
    roles(false, true);
    const out = userPayload.parse(await buildUser(USER));
    expect(out).not.toHaveProperty('coachId');
  });
});
