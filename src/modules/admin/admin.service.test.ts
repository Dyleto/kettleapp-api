/**
 * Ce que décide l'ouverture d'un compte de coach, sans base de données.
 *
 * Les lectures sont remplacées par ce qu'elles rendraient, les écritures
 * par des espions. Le piège connu : une lecture remplacée ne regarde pas ce
 * qu'on lui demande. Les filtres qui décident — l'adresse cherchée, le
 * compte dont on demande s'il est déjà coach — sont donc lus sur la requête
 * elle-même.
 */
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import User from '../../models/User';
import Coach from '../../models/Coach';
import { AppError } from '../../shared/utils/AppError';
import { createCoach } from './admin.service';
import { createCoachSchema } from './admin.schema';

// Des identifiants écrits, pas engendrés : deux décors identiques doivent
// l'être vraiment.
const INES = {
  _id: new Types.ObjectId('64a000000000000000000001'),
  email: 'ines@example.com',
  firstName: 'Inès',
  lastName: 'Roux',
};
const COACH_ID = new Types.ObjectId('64c000000000000000000009');

/** Le décor : le compte que la base rendrait, et s'il est déjà coach. */
const stored = ({
  account = null as typeof INES | null,
  coach = false,
} = {}) => {
  const findUser = vi
    .spyOn(User, 'findOne')
    .mockResolvedValue(account as never);
  const isCoach = vi
    .spyOn(Coach, 'exists')
    .mockResolvedValue((coach ? { _id: COACH_ID } : null) as never);
  const createUser = vi.spyOn(User, 'create').mockImplementation((async (
    fields: object
  ) => ({
    ...fields,
    _id: INES._id,
  })) as never);
  const createCoachDoc = vi
    .spyOn(Coach, 'create')
    .mockResolvedValue({ _id: COACH_ID } as never);
  return { findUser, isCoach, createUser, createCoachDoc };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('une adresse inconnue', () => {
  it('ouvre le compte avec le nom saisi, puis le coach', async () => {
    const { createUser, createCoachDoc } = stored();
    const result = await createCoach({
      email: INES.email,
      firstName: 'Inès',
      lastName: 'Roux',
    });
    expect(createUser).toHaveBeenCalledWith({
      email: INES.email,
      firstName: 'Inès',
      lastName: 'Roux',
    });
    expect(createCoachDoc).toHaveBeenCalledWith({ userId: INES._id });
    expect(result).toEqual({
      outcome: 'created',
      coach: {
        _id: COACH_ID,
        email: INES.email,
        firstName: 'Inès',
        lastName: 'Roux',
      },
    });
  });

  it('cherche le compte par l’adresse donnée, et elle seule', async () => {
    const { findUser } = stored();
    await createCoach({ email: INES.email });
    expect(findUser).toHaveBeenCalledWith({ email: INES.email });
  });
});

describe('une adresse déjà connue', () => {
  // Le défaut réparé : le rôle se donnait en silence, sur une adresse
  // tapée. Une faute de frappe sur celle d'un client lui ouvrait l'espace
  // coach.
  it('sans `promote`, rien n’est écrit : le compte trouvé revient, nommé', async () => {
    const { createUser, createCoachDoc } = stored({ account: INES });
    const result = await createCoach({ email: INES.email, firstName: 'Ine' });
    expect(createUser).not.toHaveBeenCalled();
    expect(createCoachDoc).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: 'exists',
      account: { email: INES.email, firstName: 'Inès', lastName: 'Roux' },
    });
  });

  it('avec `promote`, le rôle est donné à ce compte, et à lui seul', async () => {
    const { createUser, createCoachDoc } = stored({ account: INES });
    const result = await createCoach({ email: INES.email, promote: true });
    expect(createUser).not.toHaveBeenCalled();
    expect(createCoachDoc).toHaveBeenCalledExactlyOnceWith({
      userId: INES._id,
    });
    expect(result.outcome).toBe('promoted');
  });

  // Le nom vient de Google : celui que l'administrateur a tapé n'est
  // qu'une supposition, et ne remplace rien.
  it('le nom saisi ne remplace pas celui du compte', async () => {
    stored({ account: INES });
    const result = await createCoach({
      email: INES.email,
      firstName: 'Agnès',
      promote: true,
    });
    expect(result.outcome === 'promoted' && result.coach.firstName).toBe(
      'Inès'
    );
  });

  it('un compte déjà coach est un 409, et rien n’est écrit', async () => {
    const { isCoach, createCoachDoc } = stored({ account: INES, coach: true });
    const refused = await createCoach({
      email: INES.email,
      promote: true,
    }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(AppError);
    expect((refused as AppError).statusCode).toBe(409);
    expect((refused as AppError).message).toBe('Ce compte est déjà coach');
    expect(createCoachDoc).not.toHaveBeenCalled();
    // La question porte sur CE compte : sans son identifiant dans le
    // filtre, n'importe quel coach existant ferait refuser.
    expect(isCoach).toHaveBeenCalledWith({ userId: INES._id });
  });
});

describe('ce que le schéma laisse passer', () => {
  const body = (fields: object) =>
    createCoachSchema.safeParse({ body: fields });

  it('l’adresse seule suffit', () => {
    expect(body({ email: INES.email }).success).toBe(true);
  });

  it('l’adresse est ramenée en minuscules, sans espaces', () => {
    const parsed = body({ email: '  Ines@Example.COM ' });
    expect(parsed.success && parsed.data.body.email).toBe(INES.email);
  });

  // Un champ laissé blanc arrive en chaîne vide : enregistré tel quel, il
  // effacerait le nom que Google donnera.
  it('un nom laissé blanc vaut absent', () => {
    const parsed = body({ email: INES.email, firstName: '  ', lastName: '' });
    expect(parsed.success && parsed.data.body).toEqual({ email: INES.email });
  });

  it('un nom de deux lettres passe', () => {
    expect(body({ email: INES.email, firstName: 'Lu' }).success).toBe(true);
  });

  it('une adresse sans arobase est refusée, en français', () => {
    const parsed = body({ email: 'ines.example.com' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toBe(
      "Cette adresse n'est pas valide"
    );
  });
});
