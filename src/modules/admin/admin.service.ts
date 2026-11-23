import type { Types } from 'mongoose';
import User from '../../models/User';
import Coach from '../../models/Coach';
import { AppError } from '../../shared/utils/AppError';

/** Ce que l'administrateur a saisi, une fois passé par le schéma. */
export type CreateCoachInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  /** Donner le rôle de coach à un compte qui existe déjà. */
  promote?: boolean;
};

/** Qui est, ou devient, coach : ce que l'écran affiche. */
type Identity = {
  firstName?: string;
  lastName?: string;
  email: string;
};

export type CreateCoachOutcome =
  | { outcome: 'exists'; account: Identity }
  | {
      outcome: 'created' | 'promoted';
      coach: Identity & { _id: Types.ObjectId };
    };

const identityOf = (user: {
  firstName?: string;
  lastName?: string;
  email: string;
}): Identity => ({
  firstName: user.firstName || undefined,
  lastName: user.lastName || undefined,
  email: user.email,
});

/**
 * Ouvrir un compte de coach, ou donner ce rôle à un compte qui existe.
 *
 * C'est la seule porte d'entrée d'un coach dans Kettle : il n'y a pas
 * d'inscription, l'administrateur l'ouvre. Les deux cas arrivent —
 * quelqu'un peut être client depuis des mois avant de devenir coach, et lui
 * refuser le rôle parce qu'il a déjà un compte l'obligerait à en ouvrir un
 * second avec une autre adresse.
 *
 * Mais un compte existant ne recevait plus le rôle en silence : il le
 * recevait sur une adresse tapée, sans que l'administrateur sache qu'elle
 * était déjà celle de quelqu'un. Une faute de frappe sur l'adresse d'un
 * client lui donnait l'espace coach. Sans `promote`, le service ne fait
 * rien et rend le compte trouvé ; l'écran demande, puis renvoie avec
 * `promote`.
 *
 * Le nom saisi ne remplace jamais celui d'un compte existant : il vient de
 * Google, et l'administrateur ne fait que le deviner.
 *
 * Un compte déjà coach reste un 409 plutôt qu'un succès : ouvrir deux fois
 * n'est pas anodin, et l'administrateur a probablement confondu deux
 * adresses.
 */
export const createCoach = async (
  input: CreateCoachInput
): Promise<CreateCoachOutcome> => {
  const existing = await User.findOne({ email: input.email });

  if (!existing) {
    const user = await User.create({
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
    });
    const coach = await Coach.create({ userId: user._id });
    return {
      outcome: 'created',
      coach: { _id: coach._id as Types.ObjectId, ...identityOf(user) },
    };
  }

  if (await Coach.exists({ userId: existing._id })) {
    throw new AppError('Ce compte est déjà coach', 409);
  }
  if (input.promote !== true) {
    return { outcome: 'exists', account: identityOf(existing) };
  }

  const coach = await Coach.create({ userId: existing._id });
  return {
    outcome: 'promoted',
    coach: { _id: coach._id as Types.ObjectId, ...identityOf(existing) },
  };
};
