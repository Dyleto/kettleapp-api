import { Types } from 'mongoose';
import Client, { IClient } from '../../models/Client';
import { AppError } from '../../shared/utils/AppError';

/**
 * Le client demandé, à condition qu'il soit bien suivi par ce coach.
 *
 * L'appartenance fait partie de la requête et non d'un contrôle qui suivrait :
 * il n'existe aucun chemin où l'on tienne le client avant d'avoir vérifié
 * qu'on a le droit de le lire. C'est ce qui rend cette fonction sûre à appeler
 * partout, et la raison pour laquelle chaque contrôleur de l'espace coach
 * passe par elle plutôt que par un `findById`.
 *
 * Le 404 est volontaire : un 403 confirmerait l'existence du client à
 * quelqu'un qui n'a pas à le savoir.
 */
export const getAuthorizedClient = async (
  coachId: Types.ObjectId,
  clientId: string
): Promise<IClient> => {
  const client = await Client.findOne({
    _id: clientId,
    'coaches.coachId': coachId,
  });
  if (!client) throw new AppError('Client non trouvé', 404);
  return client;
};
