import { Types } from 'mongoose';
import Client from '../../models/Client';
import User from '../../models/User';
import type { ICoach } from '../../models/Coach';
import CompletedSession, { ICoachReply } from '../../models/CompletedSession';
import type { Reaction } from '../../shared/constants/reply';
import { AppError } from '../../shared/utils/AppError';

/**
 * Ce que le coach envoie : une réaction, un texte, ou les deux.
 *
 * Une clé absente laisse en place ce qui y était ; `null` l'efface. C'est ce
 * qui permet au fil « À lire » de poser ou retirer une réaction d'une touche
 * sans connaître le texte déjà écrit — sans quoi la touche l'effacerait.
 */
export interface ReplyDraft {
  reaction?: Reaction | null;
  text?: string | null;
}

/** Qui signe : l'identifiant pour reconnaître les siennes, le prénom figé
 * pour que le client le lise. */
export interface ReplyAuthor {
  coachId: Types.ObjectId;
  firstName: string;
}

/**
 * Les réponses d'une séance, une fois celle du coach écrite.
 *
 * La règle de la maquette : une réponse se modifie tant que le client ne
 * l'a pas lue ; lue, elle ne bouge plus, et ce que le coach écrit ensuite
 * en devient une nouvelle. Seule la dernière réponse de CE coach est
 * modifiable — celle d'un autre coach du même client n'est pas la sienne.
 *
 * Une réponse vidée disparaît : retirer la réaction d'une réponse qui
 * n'avait qu'elle, c'est « Toucher de nouveau la retire », et une bulle vide
 * chez le client ne voudrait rien dire. Une réponse déjà lue ne se vide pas :
 * rien ne la modifie, et un brouillon vide n'en crée pas de nouvelle.
 *
 * `sentAt` suit la dernière écriture : c'est ce que le client lira quand il
 * l'ouvrira, et il n'a rien lu d'antérieur.
 */
export const withReply = (
  replies: readonly ICoachReply[],
  author: ReplyAuthor,
  draft: ReplyDraft,
  now: Date
): ICoachReply[] => {
  // `findLastIndex` est ES2023, au-delà de la cible du compilateur.
  const ids = replies.map((reply) => String(reply.coachId));
  const mine = ids.lastIndexOf(String(author.coachId));
  const editable = mine !== -1 && !replies[mine].readAt;
  const base: Partial<ICoachReply> = editable ? replies[mine] : {};

  const reaction =
    draft.reaction === undefined
      ? base.reaction
      : (draft.reaction ?? undefined);
  const text =
    draft.text === undefined ? base.text : draft.text?.trim() || undefined;

  if (reaction === undefined && text === undefined) {
    return editable
      ? replies.filter((_, index) => index !== mine)
      : [...replies];
  }

  const written: ICoachReply = {
    coachId: author.coachId,
    firstName: author.firstName,
    ...(reaction !== undefined && { reaction }),
    ...(text !== undefined && { text }),
    sentAt: now,
  };
  return editable
    ? replies.map((reply, index) => (index === mine ? written : reply))
    : [...replies, written];
};

/**
 * Les réponses, toutes lues par le client.
 *
 * Toutes et non une seule : le client les lit ensemble, sous sa séance. Une
 * réponse déjà lue garde sa date — c'est celle que le coach voit sous
 * « lue par Sarah ».
 */
export const readAll = (
  replies: readonly ICoachReply[],
  now: Date
): ICoachReply[] =>
  replies.map((reply) => (reply.readAt ? reply : { ...reply, readAt: now }));

// `validateModifiedOnly` : la séance est un instantané de l'époque où elle a
// été faite, et un vieux bilan peut porter ce que le schéma d'aujourd'hui
// refuserait. Répondre ne doit pas échouer sur un champ qu'on n'a pas touché.
const SAVE = { validateModifiedOnly: true } as const;

/**
 * Écrire la réponse d'un coach, et marquer la séance lue par lui.
 *
 * Répondre, c'est avoir lu : la maquette ferme la feuille et retire la
 * carte du fil d'un même geste.
 *
 * Une séance d'un client qui n'est pas le sien répond comme une séance qui
 * n'existe pas — le même 404, le même message : un 403 confirmerait
 * l'existence d'un identifiant à qui n'a pas à la connaître.
 */
export const writeReply = async (
  coach: ICoach,
  completedId: string,
  draft: ReplyDraft,
  now: Date = new Date()
) => {
  const completed = await CompletedSession.findById(completedId);
  const linked =
    completed &&
    (await Client.exists({
      _id: completed.clientId,
      'coaches.coachId': coach._id,
    }));
  if (!completed || !linked) throw new AppError('Séance introuvable', 404);

  const user = await User.findById(coach.userId).select('firstName').lean();
  const author = {
    coachId: coach._id,
    firstName: user?.firstName?.trim() ?? '',
  };

  completed.set(
    'replies',
    withReply(completed.toObject().replies ?? [], author, draft, now)
  );
  completed.viewedByCoach = true;
  await completed.save(SAVE);
  return completed;
};

/**
 * Le client a lu les réponses de sa séance.
 *
 * Rien n'est écrit quand tout est déjà lu : l'accueil appelle ceci à chaque
 * ouverture de la bulle, et une écriture pour rien à chaque passage
 * déplacerait des dates que le coach lit.
 */
export const readReplies = async (
  clientId: Types.ObjectId,
  completedId: string,
  now: Date = new Date()
) => {
  const completed = await CompletedSession.findOne({
    _id: completedId,
    clientId,
  });
  if (!completed) throw new AppError('Séance introuvable', 404);

  const replies = completed.toObject().replies ?? [];
  if (replies.some((reply) => !reply.readAt)) {
    completed.set('replies', readAll(replies, now));
    await completed.save(SAVE);
  }
  return completed;
};
