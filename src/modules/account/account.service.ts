import type { ClientSession, Types } from 'mongoose';
import Exercise from '../../models/Exercise';
import InvitationToken from '../../models/InvitationToken';
import ProgramTemplate from '../../models/ProgramTemplate';
import Tag from '../../models/Tag';

/**
 * Ce que le coach a écrit, et qui part avec son compte : sa bibliothèque,
 * ses invitations, ses modèles, ses étiquettes.
 *
 * Une liste et non quatre lignes dans la transaction, pour qu'elle se lise
 * et se teste d'un coup : les modèles et les étiquettes, arrivés après
 * l'écriture de la suppression, y manquaient — un coach qui supprimait son
 * compte laissait ses modèles, les clients chez qui il les avait importés
 * compris, et ses étiquettes, alors que l'écran disait « Compte supprimé »
 * (revue de develop).
 */
export const coachOwned = (
  coachId: Types.ObjectId
): ((session: ClientSession) => Promise<unknown>)[] => [
  (session) => Exercise.deleteMany({ createdBy: coachId }, { session }),
  (session) => InvitationToken.deleteMany({ coachId }, { session }),
  (session) => ProgramTemplate.deleteMany({ coachId }, { session }),
  (session) => Tag.deleteMany({ coachId }, { session }),
];
