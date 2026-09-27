import { Types } from 'mongoose';
import Client, { IClient } from '../models/Client';
import { AppError } from '../utils/AppError';

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
