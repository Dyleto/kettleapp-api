import { z } from 'zod';
import { sessionInputSchema } from '../program/program.schema';
import { objectId } from '../../shared/schemas/params.schema';

/**
 * Le nom d'un modèle.
 *
 * Exigé et non vide : c'est la seule chose qui distingue deux modèles dans la
 * liste. Une séance peut rester sans nom — son rang la nomme — mais un modèle
 * sans nom n'est repérable par rien.
 */
const name = z
  .string()
  .trim()
  .min(1, { message: 'Le modèle a besoin d’un nom' })
  .max(120, { message: 'Le nom du modèle est trop long' });

/** Créer un modèle : un nom, et rien d'autre. Les séances viennent après. */
export const createTemplateSchema = z.object({
  body: z.object({ name }),
});

/** Renommer. Les séances ont leur propre route, comme pour le programme d'un
 * client. */
export const renameTemplateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ name }),
});

/**
 * Enregistrer les séances d'un modèle.
 *
 * Le même schéma d'entrée que le programme d'un client — `sessionInputSchema`
 * — parce que c'est le même atelier qui envoie. Un second schéma aurait
 * divergé au premier champ ajouté à un bloc.
 *
 * Et le même plafond de trente séances, ce qui n'est pas qu'une symétrie : un
 * modèle devient un programme de client à l'import, donc un modèle qui
 * dépasserait ce plafond serait un modèle impossible à importer. Il était à
 * cinquante dans ma première version.
 */
export const updateTemplateSessionsSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    sessions: z.array(sessionInputSchema).max(30),
  }),
});

/**
 * Importer un modèle chez un client.
 *
 * Le corps ne porte que l'identifiant du modèle : rien de son contenu ne
 * voyage. Le serveur le relit lui-même, comme pour la copie d'une séance vers
 * un autre client — sinon un client pourrait se faire écrire un programme que
 * son coach n'a jamais composé.
 */
export const importTemplateSchema = z.object({
  params: z.object({ clientId: z.string().min(1) }),
  body: z.object({ templateId: z.string().min(1) }),
});

/**
 * « Enregistrer comme modèle » : depuis quel client, sous quel nom, et
 * quelles séances — toutes quand la liste est absente.
 *
 * Une liste vide est refusée : elle ne demande rien, et la traiter comme
 * « toutes » enregistrerait le programme entier depuis le menu d'une seule
 * séance.
 */
export const templateFromProgramSchema = z.object({
  body: z.object({
    clientId: objectId,
    name,
    sessionIds: z.array(objectId).min(1).max(30).optional(),
  }),
});

/**
 * « Copier vers un modèle » : des séances d'un client, ajoutées à la suite
 * d'un modèle qui existe déjà.
 *
 * Comme pour « Enregistrer comme modèle », rien de la séance ne voyage : on
 * nomme le client et les séances, le serveur les relit. La liste est exigée
 * et non vide — sans elle, la route copierait tout un programme dans un
 * modèle déjà rempli, ce que personne ne demande depuis le menu d'une
 * séance.
 */
export const appendFromProgramSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    clientId: objectId,
    sessionIds: z.array(objectId).min(1).max(30),
  }),
});

export type AppendFromProgramBody = z.infer<
  typeof appendFromProgramSchema
>['body'];

export type TemplateFromProgramBody = z.infer<
  typeof templateFromProgramSchema
>['body'];

export type TemplateSessionsBody = z.infer<
  typeof updateTemplateSessionsSchema
>['body'];
