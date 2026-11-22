import { z } from 'zod';
import { id, isoDate } from './primitives';
import { sessionPayload } from './program.contract';
import { BLOCK_TYPES } from '../models/Session';

/**
 * Une ligne de la liste des modèles.
 *
 * Les séances n'en font pas partie, seulement un aperçu des premières : la
 * liste sert à choisir, et le coach choisit sur un nom, un volume et ce
 * qu'il reconnaît d'un coup d'œil. Les envoyer toutes rendrait la page du
 * poids de tous ses programmes pour trois cartes.
 */
/**
 * Une séance d'un modèle, vue de la liste : son rang, son nom et les types
 * de ses blocs — de quoi dessiner sa barre de composition sur la carte.
 *
 * Pas la séance entière : la carte ne montre ni charges ni répétitions, et
 * les exercices ne sont même pas résolus à cette étape (la liste ne fait
 * pas de `populate`). Pas de durée non plus : l'estimer demande tout le
 * contenu des blocs, et la liste resterait du poids de tous les programmes
 * pour un « ≈ 80 min ».
 */
export const templateSessionPreviewPayload = z.object({
  _id: id,
  order: z.number(),
  name: z.string().optional(),
  blockTypes: z.array(z.enum(BLOCK_TYPES)),
});

export const templateRowPayload = z.object({
  _id: id,
  name: z.string(),
  /** Combien de séances il porte — ce qui distingue « Débutant » de « Prépa
   * marathon » plus sûrement que leurs noms. */
  sessionCount: z.number(),
  /** Chez combien de clients il a été importé — « jamais utilisé » à zéro. */
  usageCount: z.number(),
  /** Les quatre premières séances, dans l'ordre : la carte les montre, puis
   * « + 2 séances » d'après `sessionCount`. */
  preview: z.array(templateSessionPreviewPayload),
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
