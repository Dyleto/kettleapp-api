import { z } from 'zod';
import { id, isoDate } from './primitives';
import { healthConsentPayload } from './user.contract';
import { programPayload } from './program.contract';
import { completedSessionPayload } from './completed.contract';

/**
 * Un client dans la liste du coach.
 *
 * `unseenCount`, `lastCompletedAt` et `lastEffort` n'appartiennent pas au
 * client : ils décrivent ce que le coach n'a pas encore lu. Ils voyagent ici
 * parce que la liste s'ordonne dessus, et qu'une requête par ligne pour les
 * chercher mettait la liste à genoux au-delà d'une dizaine de clients.
 *
 * Pas d'adresse e-mail. La liste affiche des noms ; une adresse de plus dans
 * la réponse est une adresse de plus à perdre.
 */
export const clientRowPayload = z.object({
  _id: id,
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  picture: z.string().optional(),
  unseenCount: z.number(),
  /** Absent tant que le client n'a pas terminé une séance. */
  lastCompletedAt: isoDate.optional(),
  /** Le ressenti de cette dernière séance, quand elle en portait un. */
  lastEffort: z.number().optional(),
  /** Depuis quand ce client est suivi par CE coach. */
  linkedAt: isoDate,
});

/**
 * Un client et son programme : ce qu'il faut pour ouvrir l'atelier.
 *
 * L'adresse e-mail sort ici, et seulement ici : l'écran du coach l'affiche
 * pour qu'il sache à qui il écrit.
 */
export const clientDetailsPayload = z.object({
  _id: id,
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string(),
  picture: z.string().optional(),
  program: programPayload,
  unseenCount: z.number(),
});

/**
 * Une carte du fil « À lire » : qui, ce qui a été fait, et le passage d'avant.
 *
 * `previous` est la même séance, faite par le même client juste avant : la
 * carte compare les charges et les tours (« Goblet Squat 26 kg ↗ ») et
 * repère un « trop facile » qui se répète. L'envoyer évite au fil une
 * requête par carte, et laisse la comparaison au front, qui sait déjà la
 * faire pour le client.
 *
 * Le client sans adresse e-mail, comme dans la liste : la carte affiche un
 * nom.
 */
export const inboxItemPayload = z.object({
  client: z.object({
    _id: id,
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    picture: z.string().optional(),
  }),
  completed: completedSessionPayload,
  previous: completedSessionPayload.optional(),
});

/**
 * Le fil, et combien il en reste.
 *
 * `total` compte tout ce qui correspond, même au-delà de ce qui est rendu :
 * c'est le compteur de l'onglet, et un coach revenu de trois semaines de
 * vacances doit lire « 99+ », pas le nombre de cartes chargées.
 */
export const inboxPayload = z.object({
  total: z.number(),
  items: z.array(inboxItemPayload),
});

/** Combien de séances ont changé d'état — celles d'un autre coach n'en font
 * pas partie. */
export const viewedPayload = z.object({
  count: z.number(),
});

/**
 * Le lien d'invitation en vigueur, ou `null` quand il n'y en a pas.
 *
 * L'URL complète n'est pas construite ici : le front connaît son propre
 * domaine, et la fabriquer côté serveur obligerait à tenir une variable
 * d'environnement à jour dans deux endroits.
 */
export const activeInvitationPayload = z
  .object({
    token: z.string(),
    expiresAt: isoDate,
  })
  .nullable();

/** Ce que rend la génération d'un lien d'invitation. */
export const generatedInvitationPayload = z.object({
  status: z.literal('success'),
  message: z.string(),
  token: z.string(),
  expiresAt: isoDate,
});

/** Un coach vu depuis l'espace client — de quoi le nommer, rien de plus. */
export const linkedCoachPayload = z.object({
  firstName: z.string(),
  lastName: z.string(),
  picture: z.string().optional(),
  linkedAt: isoDate,
});

/**
 * Ce que l'écran « Mon compte » a besoin de savoir, rôle par rôle.
 *
 * Chaque moitié est `null` quand le rôle n'existe pas : l'écran n'affiche
 * alors pas la section, plutôt que d'afficher une section vide.
 */
export const accountSummaryPayload = z.object({
  asClient: z
    .object({
      coaches: z.array(linkedCoachPayload),
      completedCount: z.number(),
      /** Combien de bilans un refus de partage effacerait. */
      healthDataCount: z.number(),
      healthConsent: healthConsentPayload.nullable(),
      since: isoDate,
    })
    .nullable(),
  asCoach: z
    .object({
      clientCount: z.number(),
      since: isoDate,
    })
    .nullable(),
});

export type ClientRowPayload = z.infer<typeof clientRowPayload>;
export type InboxItemPayload = z.infer<typeof inboxItemPayload>;
export type InboxPayload = z.infer<typeof inboxPayload>;
export type ViewedPayload = z.infer<typeof viewedPayload>;
export type ClientDetailsPayload = z.infer<typeof clientDetailsPayload>;
export type ActiveInvitationPayload = z.infer<typeof activeInvitationPayload>;
export type GeneratedInvitationPayload = z.infer<
  typeof generatedInvitationPayload
>;
export type LinkedCoachPayload = z.infer<typeof linkedCoachPayload>;
export type AccountSummaryPayload = z.infer<typeof accountSummaryPayload>;
