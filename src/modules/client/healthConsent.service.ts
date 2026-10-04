import type { IClient } from '../../models/Client';
import type { Feedback } from './client.schema';
import { HEALTH_CONSENT_VERSION } from '../../shared/constants/consent';

/**
 * Ce dont la décision dépend, et rien de plus.
 *
 * Le filtre ne lit que `healthConsent` : l'annoncer dans le type plutôt que
 * d'exiger un `IClient` entier permet de l'éprouver sans base de données ni
 * document hydraté. Ces fonctions vivaient dans le contrôleur, où la règle du
 * projet ne veut pas de logique métier — et où rien ne les couvrait, sur le
 * chemin le plus sensible juridiquement de l'application.
 */
type ConsentHolder = Pick<IClient, 'healthConsent'>;

/**
 * Le client a-t-il accepté qu'on collecte ses données de santé ?
 *
 * Un accord donné à une version antérieure du texte ne vaut pas pour la
 * version en vigueur : la question se repose, et en attendant la réponse on
 * s'en tient au plus prudent.
 */
export const sharingAllowed = (client: ConsentHolder): boolean =>
  client.healthConsent?.granted === true &&
  client.healthConsent.version === HEALTH_CONSENT_VERSION;

/**
 * Ne garde du ressenti que ce qu'on a le droit de garder.
 *
 * `effort` est une mesure d'entraînement : c'est avec elle que le coach règle
 * la charge, elle reste. Les étiquettes — douleur, maladie, sommeil — sont des
 * données de santé : sans consentement explicite et à jour, on ne les écrit
 * pas. Pas « on les cache au coach » : on ne les collecte pas.
 *
 * Le filtre est ici et pas seulement dans l'interface. Une case cachée à
 * l'écran reste envoyable à la main, et c'est le serveur qui répond de ce
 * qu'il écrit.
 */
export const filterFeedback = (
  feedback: Feedback,
  client: ConsentHolder
): Feedback => {
  if (sharingAllowed(client)) return feedback;

  // Les étiquettes et le commentaire relèvent de la santé : sans accord, ils
  // ne sont pas enregistrés. L'effort, lui, reste — c'est une mesure
  // d'entraînement.
  const { tags, note, ...rest } = feedback;
  void tags;
  void note;
  return rest;
};

/**
 * Le commentaire libre tombe sous la même règle.
 *
 * « J'ai mal au genou depuis mardi » est une donnée de santé, que le champ
 * s'appelle « douleur » ou « commentaire ». On ne peut pas trier au cas par
 * cas, donc on ne collecte pas.
 */
export const filterComment = (
  clientNotes: string | undefined,
  client: ConsentHolder
): string | undefined => (sharingAllowed(client) ? clientNotes : undefined);

/**
 * Les bilans qui portent effectivement une donnée de santé.
 *
 * `feedback.tags.0` plutôt que `feedback.tags` : un tableau vide existe sans
 * rien contenir, et le compter ferait annoncer au client qu'on va effacer des
 * séances où il n'y a rien à effacer.
 *
 * La même condition sert à compter avant et à effacer ensuite — sans quoi
 * l'avertissement pourrait annoncer un nombre que la purge ne tient pas.
 */
export const CARRIES_HEALTH_DATA = {
  $or: [
    { 'feedback.tags.0': { $exists: true } },
    { clientNotes: { $exists: true, $ne: '' } },
  ],
};
