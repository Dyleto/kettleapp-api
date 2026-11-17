import { Types } from 'mongoose';
import CompletedSession from '../../models/CompletedSession';

/**
 * Un bilan reçu deux fois ne compte qu'une.
 *
 * Le front garde un bilan dont l'envoi s'est coupé et le renvoie au retour
 * du réseau. Mais une coupure peut survenir après l'arrivée de la requête,
 * sur le chemin de la réponse : le serveur a enregistré, l'appareil ne l'a
 * pas su, et le renvoi faisait une seconde séance — une semaine comptée
 * double, un « trop dure » lu deux fois par le coach.
 *
 * Le front pose donc une clé d'envoi, une par séance terminée, qu'il
 * renvoie à chaque essai ; le serveur reconnaît ce qu'il a déjà reçu sous
 * elle. Seul le serveur peut le savoir : le front empêche deux envois
 * croisés, il ne peut pas savoir qu'un envoi coupé était arrivé.
 */

/**
 * Le bilan déjà reçu sous cette clé, pour ce client — ou rien.
 *
 * Cherché avant tout le reste : un renvoi doit retrouver son bilan même si
 * le coach a retiré la séance du programme entre-temps.
 */
export const alreadyReceived = async (
  clientId: Types.ObjectId,
  sendKey?: string
) => (sendKey ? CompletedSession.findOne({ clientId, sendKey }) : null);

/** Un doublon refusé par l'index unique de MongoDB. */
const isDuplicate = (error: unknown): boolean =>
  (error as { code?: number })?.code === 11000;

/**
 * Enregistrer un bilan, une fois.
 *
 * `alreadyReceived` ne suffit pas seul : deux renvois croisés passent tous
 * deux la recherche avant que l'un n'ait écrit. L'index unique
 * `{ clientId, sendKey }` tranche, et celui qui perd rend le bilan du
 * gagnant plutôt qu'une erreur — pour l'appareil, son bilan est bien parti.
 */
export const recordOnce = async (
  doc: Record<string, unknown> & {
    clientId: Types.ObjectId;
    sendKey?: string;
  }
) => {
  try {
    return { completed: await CompletedSession.create(doc), created: true };
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    // Sans clé, rien à retrouver : le doublon est une autre affaire.
    const known = await alreadyReceived(doc.clientId, doc.sendKey);
    if (!known) throw error;
    return { completed: known, created: false };
  }
};
