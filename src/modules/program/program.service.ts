import mongoose, { Types, isValidObjectId } from 'mongoose';
import Program, { IProgram } from '../../models/Program';
import Session, { ISession } from '../../models/Session';
import { AppError } from '../../shared/utils/AppError';
import logger from '../../shared/utils/logger';
import { getErrorMessage } from '../../shared/utils/unknownError';
import type { SessionInput } from './program.schema';

/**
 * Le programme d'un client, créé au premier accès.
 *
 * Un client a toujours un programme, même vide : la distinction entre « pas
 * encore de programme » et « programme sans séance » n'intéresse personne, et
 * la faire remonter jusqu'à l'écran obligerait chaque appelant à traiter un
 * cas qui ne veut rien dire pour un coach.
 */
export const getOrCreate = async (
  clientId: Types.ObjectId
): Promise<IProgram> => {
  return Program.findOneAndUpdate(
    { clientId },
    { $setOnInsert: { clientId } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
};

/**
 * Ce qu'une séance devient en base, à partir de ce que l'atelier envoie.
 *
 * Deux `??` méritent leur explication, parce qu'ils ont l'air d'être des
 * précautions inutiles : Mongoose ignore purement et simplement les champs
 * `undefined` lors d'une mise à jour. Un coach qui efface le nom d'une séance,
 * ou qui décoche tous ses jours conseillés, enverrait donc `undefined` — et
 * l'ancienne valeur resterait en base, pour toujours. La chaîne vide et le
 * tableau vide sont ce qui dit « il n'y en a plus ».
 */
const toPayload = (input: SessionInput, order: number, programId: unknown) => ({
  name: input.name ?? '',
  notes: input.notes,
  suggestedDays: input.suggestedDays ?? [],
  blocks: input.blocks,
  programId,
  order,
});

/**
 * Remplacer les séances d'un programme par celles qu'on reçoit.
 *
 * L'atelier n'envoie pas des modifications, il envoie l'état complet du
 * programme : ce qui n'y est plus a été supprimé. La réconciliation se fait
 * donc en trois temps — retirer ce qui a disparu, écrire ce qui reste, relire
 * l'ensemble — et sous transaction, pour qu'un programme ne puisse jamais être
 * observé à moitié réécrit.
 *
 * L'identifiant fourni par le client sert de clé, qu'il existe déjà ou non.
 * C'est ce qui rend l'opération répétable : envoyer deux fois le même
 * programme donne le même résultat. Auparavant, une séance inconnue partait en
 * création pure — et avec l'enregistrement automatique, deux envois successifs
 * d'une séance qui vient d'être ajoutée, le second parti avant que le premier
 * n'ait répondu, créaient deux séances. Le client génère maintenant un
 * identifiant au format ObjectId dès la création, et c'est lui qu'on retrouve
 * ici.
 *
 * Vit dans le service et non dans le contrôleur : rien ici ne connaît `req`
 * ni `res`, et c'est ce qui permettra de l'éprouver sans monter de serveur.
 */
export const replaceProgramSessions = async (
  clientId: Types.ObjectId,
  sessions: SessionInput[],
  requestId = '?'
): Promise<ISession[]> => {
  const program = await getOrCreate(clientId);
  const dbSession = await mongoose.startSession();
  let saved: ISession[] = [];

  try {
    await dbSession.withTransaction(async () => {
      const existing = await Session.find({ programId: program._id })
        .select('_id')
        .session(dbSession);

      const existingIds = existing.map((s) => s._id.toString());
      // `flatMap` plutôt que `filter` puis `map` : TypeScript ne sait pas
      // qu'un `filter` a écarté les `undefined`, et il fallait le lui affirmer
      // par un cast. Le tableau conditionnel dit la même chose sans mentir.
      const incomingIds = sessions.flatMap((s) => (s._id ? [s._id] : []));
      const idsToDelete = existingIds.filter((id) => !incomingIds.includes(id));

      if (idsToDelete.length > 0) {
        logger.info(`[${requestId}] replaceProgramSessions: suppressions`, {
          count: idsToDelete.length,
          ids: idsToDelete,
        });
      }

      const deletion =
        idsToDelete.length > 0
          ? Session.deleteMany(
              { _id: { $in: idsToDelete }, programId: program._id },
              { session: dbSession }
            )
          : Promise.resolve();

      const writes = sessions.map((input, index) => {
        const payload = toPayload(input, index + 1, program._id);
        return input._id && isValidObjectId(input._id)
          ? Session.findOneAndUpdate(
              { _id: input._id, programId: program._id },
              payload,
              { new: true, upsert: true, session: dbSession }
            )
          : Session.create([payload], { session: dbSession });
      });

      await Promise.all([deletion, ...writes]);

      saved = (await Session.find({ programId: program._id })
        .sort({ order: 1 })
        .populate('blocks.exercises.exerciseId')
        .lean()
        .session(dbSession)) as unknown as ISession[];
    });
  } catch (error) {
    logger.error(`[${requestId}] replaceProgramSessions: transaction échouée`, {
      clientId,
      error: getErrorMessage(error),
    });
    throw error;
  } finally {
    dbSession.endSession();
  }

  return saved;
};

/**
 * Les identifiants ne voyagent pas avec une copie.
 *
 * Ce sont deux séances distinctes à partir de l'instant où l'on copie, et
 * corriger l'une ne doit jamais toucher l'autre. Garder les `_id` des blocs et
 * des exercices donnerait exactement l'inverse.
 */
const withoutId = <T extends object>(value: T): T => {
  const copy = { ...value } as Record<string, unknown>;
  delete copy._id;
  return copy as T;
};

/**
 * Copier une séance d'un programme vers un autre.
 *
 * Ce qui ne se copie pas : les jours conseillés. Le contenu d'une séance
 * appartient à l'entraînement, ses jours appartiennent à la semaine de
 * quelqu'un ; les emporter poserait chez le nouveau client un conseil qui n'a
 * jamais été pensé pour lui. Le nom, lui, suit — « Full body A » décrit ce que
 * la séance fait, pas la semaine de personne.
 *
 * La copie arrive en fin de programme. Au moment de copier, on sait chez qui
 * l'on pose, rarement où : le rail de séances sert ensuite à la déplacer, et
 * il sait déjà le faire.
 *
 * L'autorisation des deux clients — source et destination — appartient à
 * l'appelant : sans le contrôle sur la source, connaître un identifiant de
 * séance suffirait à recopier, donc à lire, le programme d'un client qui n'est
 * pas le sien.
 */
export const copySession = async (
  sourceClientId: Types.ObjectId,
  sourceSessionId: string,
  targetClientId: Types.ObjectId
): Promise<ISession> => {
  const sourceProgram = await getOrCreate(sourceClientId);
  const source = await Session.findOne({
    _id: sourceSessionId,
    programId: sourceProgram._id,
  }).lean();

  if (!source) {
    throw new AppError('Séance introuvable', 404);
  }

  const targetProgram = await getOrCreate(targetClientId);
  const alreadyThere = await Session.countDocuments({
    programId: targetProgram._id,
  });

  const blocks = (source.blocks ?? []).map((block) => ({
    ...withoutId(block),
    exercises: (block.exercises ?? []).map(withoutId),
  }));

  const copy = await Session.create({
    programId: targetProgram._id,
    order: alreadyThere + 1,
    name: source.name,
    notes: source.notes,
    blocks,
  });

  return (await Session.findById(copy._id)
    .populate('blocks.exercises.exerciseId')
    .lean()) as unknown as ISession;
};
