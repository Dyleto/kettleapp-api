import { Types } from 'mongoose';
import Tag from '../../models/Tag';
import Client from '../../models/Client';
import { getAuthorizedClient } from '../coach/coach.service';
import { AppError } from '../../shared/utils/AppError';

/** La maquette : « Texte libre, 24 caractères au plus ». Trois tiennent sur
 * une ligne de la liste. */
export const TAG_NAME_MAX = 24;

/**
 * Combien d'étiquettes un coach peut tenir.
 *
 * Une barre de filtres de cinquante étiquettes ne se lit déjà plus ; la
 * borne existe pour qu'une boucle côté client ne remplisse pas la base.
 */
export const TAGS_PER_COACH_MAX = 50;

/** Le nom tel qu'il s'affiche : sans espaces autour, ni doublés dedans. */
export const tagName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ');

/**
 * Le nom ramené à ce qui le distingue d'un autre.
 *
 * Sans casse ni accents : « Équilibre » et « equilibre » sont la même
 * étiquette pour qui les tape sur un téléphone, et la recherche de la liste
 * ignore déjà l'un et l'autre. C'est sur cette clé que porte l'unicité.
 */
export const tagKey = (name: string): string =>
  tagName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Les étiquettes à poser sur un client, une fois triées.
 *
 * Seules celles du coach restent, chacune une fois, dans l'ordre demandé.
 * Une étiquette inconnue est écartée plutôt que refusée : la feuille a pu
 * rester ouverte pendant qu'on la supprimait depuis un autre écran, et la
 * réponse rend ce qui a été posé — l'écran voit la vérité sans erreur.
 */
export const keptTagIds = (
  requested: readonly string[],
  owned: readonly { toString(): string }[]
): string[] => {
  const mine = new Set(owned.map(String));
  return [...new Set(requested)].filter((id) => mine.has(id));
};

/** Un doublon refusé par l'index unique de MongoDB. */
const isDuplicate = (error: unknown): boolean =>
  (error as { code?: number })?.code === 11000;

const DUPLICATE = 'Cette étiquette existe déjà.';

/** Les étiquettes du coach, dans l'ordre où la barre les montre. */
export const listTags = async (coachId: Types.ObjectId) =>
  Tag.find({ coachId }).sort({ key: 1 });

/**
 * Créer une étiquette.
 *
 * Le doublon est laissé à l'index unique, qui seul tient face à deux
 * créations simultanées ; on traduit seulement son refus.
 */
export const createTag = async (coachId: Types.ObjectId, name: string) => {
  if ((await Tag.countDocuments({ coachId })) >= TAGS_PER_COACH_MAX)
    throw new AppError(
      `${TAGS_PER_COACH_MAX} étiquettes au plus : supprime celles qui ne servent plus.`,
      409
    );
  try {
    return await Tag.create({
      coachId,
      name: tagName(name),
      key: tagKey(name),
    });
  } catch (error) {
    if (isDuplicate(error)) throw new AppError(DUPLICATE, 409);
    throw error;
  }
};

/**
 * Renommer une étiquette — partout où elle est posée, puisque les clients
 * la désignent par son identifiant.
 *
 * Celle d'un autre coach répond comme une étiquette inexistante.
 */
export const renameTag = async (
  coachId: Types.ObjectId,
  tagId: string,
  name: string
) => {
  try {
    const tag = await Tag.findOneAndUpdate(
      { _id: tagId, coachId },
      { $set: { name: tagName(name), key: tagKey(name) } },
      { new: true }
    );
    if (!tag) throw new AppError('Étiquette introuvable', 404);
    return tag;
  } catch (error) {
    if (isDuplicate(error)) throw new AppError(DUPLICATE, 409);
    throw error;
  }
};

/**
 * Supprimer une étiquette, et la retirer de tous les clients qui la
 * portent.
 *
 * Retirer d'abord, supprimer ensuite : interrompu entre les deux, il reste
 * une étiquette sans client, que le coach voit et peut supprimer de
 * nouveau — et non des clients qui portent une étiquette qui n'existe plus.
 *
 * Seuls les liens de ce coach sont touchés : `arrayFilters` vise son lien,
 * pas celui d'un autre coach du même client.
 */
export const deleteTag = async (coachId: Types.ObjectId, tagId: string) => {
  const tag = await Tag.findOne({ _id: tagId, coachId });
  if (!tag) throw new AppError('Étiquette introuvable', 404);
  await Client.updateMany(
    { 'coaches.coachId': coachId },
    { $pull: { 'coaches.$[link].tagIds': tag._id } },
    { arrayFilters: [{ 'link.coachId': coachId }] }
  );
  await Tag.deleteOne({ _id: tag._id, coachId });
};

/**
 * Les étiquettes d'un client, posées toutes à la fois.
 *
 * Toutes et non une par une : la feuille coche et décoche, puis « C'est
 * bon » envoie l'état. Une liste par appel ne peut pas laisser le client à
 * moitié étiqueté si l'écran se ferme entre deux requêtes.
 */
export const setClientTags = async (
  coachId: Types.ObjectId,
  clientId: string,
  tagIds: readonly string[]
) => {
  const client = await getAuthorizedClient(coachId, clientId);
  const owned = await Tag.find({ coachId, _id: { $in: tagIds } }).distinct(
    '_id'
  );
  const kept = keptTagIds(tagIds, owned);
  await Client.updateOne(
    { _id: client._id, 'coaches.coachId': coachId },
    { $set: { 'coaches.$.tagIds': kept } }
  );
  return { tagIds: kept };
};
