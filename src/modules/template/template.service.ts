import { Types, isValidObjectId } from 'mongoose';
import ProgramTemplate, {
  IProgramTemplate,
} from '../../models/ProgramTemplate';
import { AppError } from '../../shared/utils/AppError';
import { replaceProgramSessions } from '../program/program.service';
import type { SessionInput } from '../program/program.schema';
import type { ISession } from '../../models/Session';

/**
 * Le modèle demandé, s'il appartient bien à ce coach.
 *
 * Un 404 et non un 403 : dire « ce modèle existe mais n'est pas à vous »
 * apprend à qui demande que l'identifiant est bon. Même raison que pour
 * `getAuthorizedClient`, et même forme.
 *
 * L'identifiant est vérifié avant la requête : un `_id` mal formé fait lever
 * Mongoose au lieu de rendre `null`, et le coach recevrait un 500 là où il
 * s'est simplement trompé d'adresse.
 */
export const getOwnTemplate = async (
  coachId: Types.ObjectId,
  templateId: string
): Promise<IProgramTemplate> => {
  if (!isValidObjectId(templateId))
    throw new AppError('Modèle introuvable', 404);

  const template = await ProgramTemplate.findOne({
    _id: templateId,
    coachId,
  });
  if (!template) throw new AppError('Modèle introuvable', 404);
  return template;
};

/**
 * Le même modèle, ses exercices repeuplés.
 *
 * L'atelier lit `exercise` et non `exerciseId` : c'est ce qui lui évite une
 * requête par mouvement, et c'est la forme que `formatSession` produit pour
 * le programme d'un client. Le chemin traverse deux tableaux imbriqués, ce
 * que Mongoose sait faire — mais il faut le nommer en entier.
 */
export const getOwnTemplatePopulated = async (
  coachId: Types.ObjectId,
  templateId: string
): Promise<IProgramTemplate> => {
  const template = await getOwnTemplate(coachId, templateId);
  await template.populate('sessions.blocks.exercises.exerciseId');
  return template;
};

/**
 * Les séances d'un modèle, réécrites en entier.
 *
 * Un remplacement et non une réconciliation : rien ne pointe vers une séance
 * de modèle — aucun bilan, aucun historique — donc il n'y a rien à retrouver
 * ni à préserver. C'est tout l'intérêt de les avoir embarquées, et la
 * différence avec `replaceProgramSessions`, qui doit tenir compte de ce qui
 * existait.
 *
 * Les rangs sont réécrits depuis la position : l'atelier envoie l'ordre qu'il
 * affiche, et c'est lui qui fait foi.
 */
export const replaceTemplateSessions = async (
  coachId: Types.ObjectId,
  templateId: string,
  sessions: SessionInput[]
): Promise<IProgramTemplate> => {
  const template = await getOwnTemplate(coachId, templateId);

  template.set(
    'sessions',
    sessions.map((input, index) => ({
      _id: input._id,
      order: index + 1,
      name: input.name ?? '',
      notes: input.notes,
      suggestedDays: input.suggestedDays ?? [],
      blocks: input.blocks,
    }))
  );
  await template.save();

  await template.populate('sessions.blocks.exercises.exerciseId');
  return template;
};

/**
 * Les séances d'un modèle, prêtes à devenir celles d'un client.
 *
 * Extraite du reste pour être éprouvée sans base : ce qu'elle fait tient en
 * une soustraction, et c'est précisément celle qu'on ne voit pas manquer.
 *
 * Les identifiants de séance sont retirés, et il le faut : `_id` est unique
 * dans la collection des séances, donc les réutiliser ferait échouer le
 * second import du même modèle sur une erreur de clé dupliquée — le premier
 * client aurait pris les identifiants. Les identifiants de blocs restent : ce
 * sont des sous-documents, portés par leur séance, et deux séances peuvent
 * porter les mêmes sans se gêner.
 *
 * Le rang n'est pas recopié non plus : `replaceProgramSessions` le réécrit
 * depuis la position, et c'est lui qui fait foi.
 */
export const sessionsForImport = (
  template: Pick<IProgramTemplate, 'sessions'>
): SessionInput[] =>
  template.sessions.map((session) => ({
    name: session.name,
    notes: session.notes,
    suggestedDays: session.suggestedDays ?? [],
    blocks: session.blocks,
  })) as unknown as SessionInput[];

/**
 * Écrit le modèle dans le programme d'un client, par-dessus ce qui y était.
 *
 * Le modèle ne sert que de base de copie : rien ne relie ensuite les deux, et
 * corriger le modèle ne touchera pas ce client. C'est ce que le coach attend
 * — il importe pour avoir un point de départ, puis il modifie.
 *
 * Les identifiants de séance sont retirés, et il le faut : `_id` est unique
 * dans la collection des séances, donc les réutiliser ferait échouer le
 * second import du même modèle avec une erreur de clé dupliquée. Les
 * identifiants de blocs restent — ce sont des sous-documents, portés par la
 * séance, et deux séances peuvent porter les mêmes sans se gêner.
 */
export const importTemplate = async (
  coachId: Types.ObjectId,
  clientId: Types.ObjectId,
  templateId: string,
  requestId = '?'
): Promise<ISession[]> => {
  const template = await getOwnTemplate(coachId, templateId);

  // `toObject()` sur le document entier plutôt que bloc par bloc : les
  // séances embarquées sont des sous-documents Mongoose, et
  // `replaceProgramSessions` les réécrit dans une autre collection. Y passer
  // des sous-documents hydratés revient à leur faire traverser deux parents.
  const plain = template.toObject() as IProgramTemplate;

  return replaceProgramSessions(clientId, sessionsForImport(plain), requestId);
};
