import { Types } from 'mongoose';
import Program, { IProgram } from '../../models/Program';

export const getOrCreate = async (
  clientId: Types.ObjectId
): Promise<IProgram> => {
  return Program.findOneAndUpdate(
    { clientId },
    { $setOnInsert: { clientId } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
};
