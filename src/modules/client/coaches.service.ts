import Coach from '../../models/Coach';
import type { IClient } from '../../models/Client';
import type { IUser } from '../../models/User';

/** Ce dont l'ordre dépend : le lien, et rien de plus. */
type Link = { coachId: { toString(): string } };

/** Un coach tel que la requête le rend : son compte peuplé, ou plus rien
 * quand ce compte a disparu. */
type FoundCoach = {
  _id: { toString(): string };
  userId?: Pick<IUser, 'firstName'> | null;
};

/**
 * Les coachs d'un client, réduits à leur prénom, dans l'ordre où il les a
 * rejoints.
 *
 * Le front disait « ton coach » partout, faute de savoir qui c'était : la
 * maquette écrit « Envoyer à Julie », « Julie ne l'a pas encore lue ». Le
 * prénom seul sort — ni nom, ni adresse, ni photo : c'est tout ce que ces
 * phrases demandent, et le compte du client donne déjà le reste là où il a
 * une raison de l'afficher.
 *
 * Une liste et non un prénom : un client peut suivre deux coachs, et c'est
 * au front de décider quoi dire alors — la maquette veut « ton coach ». Un
 * prénom vide reste dans la liste pour la même raison : l'écarter ferait
 * passer deux coachs pour un seul. Un coach dont le compte n'existe plus est
 * écarté, lui : il n'y a plus personne à nommer.
 *
 * L'ordre est celui des liens, pas celui de la requête — `$in` ne promet
 * aucun ordre.
 */
export const firstNamesInOrder = (
  links: readonly Link[],
  found: readonly FoundCoach[]
): { firstName: string }[] => {
  const byId = new Map(found.map((coach) => [coach._id.toString(), coach]));
  return links.flatMap((link) => {
    const coach = byId.get(link.coachId.toString());
    return coach?.userId
      ? [{ firstName: coach.userId.firstName?.trim() ?? '' }]
      : [];
  });
};

/**
 * Les prénoms des coachs de ce client.
 *
 * Une seule requête quel que soit le nombre de coachs, et seul le prénom du
 * compte est chargé. Aucune pour un client sans coach — un compte créé sans
 * invitation en est un.
 */
export const coachesOf = async (
  client: Pick<IClient, 'coaches'>
): Promise<{ firstName: string }[]> => {
  if (client.coaches.length === 0) return [];
  const found = await Coach.find({
    _id: { $in: client.coaches.map((link) => link.coachId) },
  })
    .populate<{ userId: IUser | null }>('userId', 'firstName')
    .lean();
  return firstNamesInOrder(client.coaches, found);
};
