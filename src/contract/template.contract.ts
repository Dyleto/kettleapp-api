import { z } from 'zod';
import { id, isoDate } from './primitives';
import { sessionPayload } from './program.contract';

/**
 * Une ligne de la liste des modèles.
 *
 * Les séances n'en font pas partie : la liste sert à choisir, et le coach
 * choisit sur un nom et un volume. Les envoyer toutes rendrait la page du
 * poids de tous ses programmes pour afficher trois titres.
 */
export const templateRowPayload = z.object({
  _id: id,
  name: z.string(),
  /** Combien de séances il porte — ce qui distingue « Débutant » de « Prépa
   * marathon » plus sûrement que leurs noms. */
  sessionCount: z.number(),
  updatedAt: isoDate,
});

/**
 * Un modèle ouvert, avec ses séances.
 *
 * `sessions` réutilise `sessionPayload`, celui du programme d'un client, et
 * ce n'est pas une économie de frappe : c'est ce qui permet à l'atelier du
 * coach d'éditer un modèle sans rien savoir de particulier. Deux formes pour
 * la même chose auraient divergé, et l'atelier aurait fini par porter deux
 * chemins.
 */
export const templatePayload = z.object({
  _id: id,
  name: z.string(),
  sessions: z.array(sessionPayload),
  createdAt: isoDate,
  updatedAt: isoDate,
});

/** Ce que rend `GET /api/coach/templates`. */
export const templateListPayload = z.object({
  templates: z.array(templateRowPayload),
});

/** Ce que rend l'ouverture, la création et l'enregistrement d'un modèle. */
export const templateWrapperPayload = z.object({ template: templatePayload });

export type TemplateRowPayload = z.infer<typeof templateRowPayload>;
export type TemplatePayload = z.infer<typeof templatePayload>;
