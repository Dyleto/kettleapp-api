import { Types, isValidObjectId } from 'mongoose';
import ProgramTemplate, {
  IProgramTemplate,
} from '../../models/ProgramTemplate';
import Program from '../../models/Program';
import Session from '../../models/Session';
import { getAuthorizedClient } from '../coach/coach.service';
import { AppError } from '../../shared/utils/AppError';
import { replaceProgramSessions } from '../program/program.service';
import type { SessionInput } from '../program/program.schema';
import type { ISession, ISessionBlock } from '../../models/Session';
import {
  formatSession,
  PopulatedSession,
} from '../../shared/utils/sessionFormatter';

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
 * Un modèle tel qu'il sort, ses séances mises en forme.
 *
 * `formatSession` est celui du programme d'un client : les séances d'un
 * modèle ont la même forme, c'est ce qui permet au même atelier de les
 * éditer.
 *
 * `toObject()` d'abord, et c'est tout le défaut réparé ici. Les séances
 * d'un modèle sont des sous-documents, et `formatSession` les recopie par
 * `{ ...session }` : sur un sous-document Mongoose, la recopie ne garde que
 * ses rouages (`$__`, `_doc`), pas ses champs, qui vivent sur le
 * prototype. La séance sortait sans `_id` ni `order`, le contrat la
 * refusait, et l'API répondait 500 après avoir écrit — ouvrir un modèle,
 * l'enregistrer, le dupliquer, « Enregistrer comme modèle », dès qu'il
 * portait une séance. Les séances d'un programme sortent par `.lean()` et
 * n'avaient pas ce défaut ; le banc du front non plus, dont le serveur
 * d'essai rend des objets ordinaires.
 */
export const templateOutput = (template: IProgramTemplate) => {
  const plain = template.toObject() as IProgramTemplate;
  return {
    _id: plain._id,
    name: plain.name,
    sessions: (plain.sessions as unknown as PopulatedSession[]).map(
      formatSession
    ),
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
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

  const saved = await replaceProgramSessions(
    clientId,
    sessionsForImport(plain),
    requestId
  );
  await recordImport(coachId, template._id, clientId);
  return saved;
};

/**
 * Retenir chez qui un modèle a été importé.
 *
 * Après l'import et non avant : un import qui échoue n'a rendu le modèle
 * utile à personne. `$addToSet` pour qu'un second import chez le même
 * client ne compte pas double.
 *
 * `timestamps: false` : la liste des modèles se trie sur la dernière
 * modification, et importer ne modifie pas le modèle. Sans lui, le modèle
 * importé passerait en tête comme si le coach venait de le retoucher.
 */
export const recordImport = (
  coachId: Types.ObjectId,
  templateId: Types.ObjectId,
  clientId: Types.ObjectId
) =>
  ProgramTemplate.updateOne(
    { _id: templateId, coachId },
    { $addToSet: { importedFor: clientId } },
    { timestamps: false }
  );

/** Ce que la liste lit d'une séance de modèle, sans `populate`. */
type PreviewSource = {
  _id: unknown;
  order: number;
  name?: string;
  blocks?: { type: string }[];
};

/** Combien de séances la carte d'un modèle montre. */
export const PREVIEW_SESSIONS = 4;

/**
 * Une ligne de la liste des modèles.
 *
 * Le compteur d'usage est le nombre de clients retenus, pas d'imports : la
 * ligne dit « utilisé chez 3 clients ». L'aperçu suit l'ordre des séances
 * et non celui du tableau : un modèle réordonné dans l'atelier garde ses
 * séances à leur place dans le document.
 */
export const templateRow = (
  template: Pick<IProgramTemplate, '_id' | 'name' | 'updatedAt'> & {
    sessions?: PreviewSource[];
    importedFor?: unknown[];
  }
) => ({
  _id: template._id,
  name: template.name,
  sessionCount: template.sessions?.length ?? 0,
  usageCount: template.importedFor?.length ?? 0,
  preview: [...(template.sessions ?? [])]
    .sort((a, b) => a.order - b.order)
    .slice(0, PREVIEW_SESSIONS)
    .map((session) => ({
      _id: session._id,
      order: session.order,
      name: session.name,
      blockTypes: (session.blocks ?? []).map((block) => block.type),
    })),
  updatedAt: template.updatedAt,
});

/** Le plafond du nom d'un modèle, celui du schéma. */
const NAME_MAX = 120;
const COPY_SUFFIX = ' (copie)';

/**
 * Le nom d'une copie : « Prise de masse (copie) ».
 *
 * Le nom d'origine est raccourci s'il le faut pour que la mention tienne :
 * un modèle au nom déjà long ne doit pas rendre sa copie impossible à
 * enregistrer, ni perdre ce qui la distingue de l'original.
 */
export const copyName = (name: string): string =>
  name.slice(0, NAME_MAX - COPY_SUFFIX.length).trimEnd() + COPY_SUFFIX;

/** Ce qu'une séance de modèle peut porter, d'où qu'elle vienne. */
type SessionSource = {
  name?: string;
  notes?: string;
  suggestedDays?: number[];
  blocks: ISessionBlock[];
};

/**
 * Des séances, prêtes à devenir celles d'un nouveau modèle.
 *
 * Sans leurs identifiants ni leurs dates : ce sont de nouvelles séances, et
 * Mongoose leur en donne. Garder ceux d'une séance de client lierait le
 * modèle au programme qu'il a copié ; ceux d'un autre modèle feraient
 * croire à l'atelier qu'il rouvre la même séance. Les blocs gardent les
 * leurs, comme à l'import : ce sont des sous-documents de leur séance.
 *
 * Le rang vient de la position.
 */
export const templateSessionsFrom = (sessions: readonly SessionSource[]) =>
  sessions.map((session, index) => ({
    order: index + 1,
    name: session.name ?? '',
    notes: session.notes,
    suggestedDays: session.suggestedDays ?? [],
    blocks: session.blocks,
  }));

/**
 * Dupliquer un modèle, sous un nom qui dit que c'est une copie.
 *
 * La copie n'a jamais été importée : son compteur part de zéro.
 */
export const duplicateTemplate = async (
  coachId: Types.ObjectId,
  templateId: string
): Promise<IProgramTemplate> => {
  const source = (await getOwnTemplate(coachId, templateId)).toObject();
  const copy = await ProgramTemplate.create({
    coachId,
    name: copyName(source.name),
    sessions: templateSessionsFrom(source.sessions),
  });
  await copy.populate('sessions.blocks.exercises.exerciseId');
  return copy;
};

/**
 * Les séances à enregistrer : toutes, ou celles qu'on a nommées, dans
 * l'ordre du programme.
 *
 * L'ordre du programme et non celui de la demande : le modèle reprend la
 * progression que le coach a construite. Une séance nommée qui n'est pas
 * dans ce programme n'en fait pas partie.
 */
export const pickSessions = <S extends { _id: { toString(): string } }>(
  sessions: readonly S[],
  sessionIds?: readonly string[]
): S[] => {
  if (!sessionIds) return [...sessions];
  const wanted = new Set(sessionIds);
  return sessions.filter((session) => wanted.has(String(session._id)));
};

/**
 * « Enregistrer comme modèle » : le programme d'un client, ou quelques-unes
 * de ses séances, devient un modèle.
 *
 * Depuis le menu d'une séance (une seule) ou depuis le programme (tout). Le
 * serveur relit les séances lui-même plutôt que de les recevoir, comme pour
 * l'import : le modèle est ce que le coach a vraiment écrit chez ce client.
 *
 * Rien n'à enregistrer — un programme vide, des séances qui n'en sont pas —
 * répond 404 plutôt que de créer un modèle vide que personne n'a demandé.
 */
export const templateFromProgram = async (
  coachId: Types.ObjectId,
  clientId: string,
  name: string,
  sessionIds?: readonly string[]
): Promise<IProgramTemplate> => {
  const client = await getAuthorizedClient(coachId, clientId);
  const program = await Program.findOne({ clientId: client._id });
  const sessions = program
    ? await Session.find({ programId: program._id }).sort({ order: 1 }).lean()
    : [];

  const picked = pickSessions(sessions, sessionIds);
  if (picked.length === 0)
    throw new AppError('Aucune séance à enregistrer', 404);

  const template = await ProgramTemplate.create({
    coachId,
    name,
    sessions: templateSessionsFrom(picked),
  });
  await template.populate('sessions.blocks.exercises.exerciseId');
  return template;
};
