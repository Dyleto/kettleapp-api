/**
 * Exerce la copie d'une séance contre un vrai MongoDB.
 *
 *     npm run verify:copy
 *
 * Il faut un accès réseau au dépôt des binaires MongoDB au premier lancement
 * — `mongodb-memory-server` en télécharge un et le garde en cache. Écrit
 * précisément parce que ce chemin porte deux contrôles d'autorisation, et
 * qu'une relecture ne prouve pas qu'ils tiennent.
 *
 * Le contrôleur est appelé tel quel — pas une réécriture de sa logique — avec
 * une requête et une réponse simulées. Ce qui compte ici ne se lit pas dans le
 * code : que la copie atterrisse chez le bon client, qu'elle ne partage aucun
 * identifiant avec l'originale, et qu'un client qui n'est pas le sien soit
 * refusé.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import Client from '../models/Client';
import Program from '../models/Program';
import Session from '../models/Session';
import Exercise from '../models/Exercise';
import { copySessionToClient } from '../modules/program/program.controller';

const main = async () => {
  let green = 0;
  let red = 0;
  const ok = (label: string, condition: boolean, preuve = '') => {
    console.log(
      `${condition ? 'OK  ' : 'FAIL'}  ${label}${preuve ? ' — ' + preuve : ''}`
    );
    if (condition) green += 1;
    else red += 1;
  };

  let mongo;
  try {
    mongo = await MongoMemoryServer.create();
  } catch (error) {
    // Le premier lancement télécharge un binaire MongoDB. Derrière un réseau
    // fermé, l'échec sort en pile d'appels illisible : on dit ce qui manque.
    console.error(
      'Impossible de démarrer un MongoDB de test.\n' +
        '`mongodb-memory-server` télécharge un binaire au premier lancement, et\n' +
        "le dépôt n'est pas joignable d'ici. Relancez depuis un poste qui atteint\n" +
        'fastdl.mongodb.org, ou pointez MONGOMS_SYSTEM_BINARY sur un `mongod`\n' +
        'déjà installé.\n\n' +
        String(error instanceof Error ? error.message : error)
    );
    process.exit(2);
  }
  await mongoose.connect(mongo.getUri());

  const coachId = new Types.ObjectId();
  const otherCoachId = new Types.ObjectId();

  const createClient = async (coach: Types.ObjectId) =>
    Client.create({
      userId: new Types.ObjectId(),
      coaches: [{ coachId: coach }],
    });

  const source = await createClient(coachId);
  const targetClient = await createClient(coachId);
  const stranger = await createClient(otherCoachId);

  const exercise = await Exercise.create({
    name: 'Kettlebell Swing',
    coachId,
  });

  const sourceProgram = await Program.create({ clientId: source._id });
  const session = await Session.create({
    programId: sourceProgram._id,
    order: 1,
    notes: 'Garder le dos droit',
    suggestedDays: [0, 3],
    blocks: [
      {
        type: 'emom',
        order: 1,
        rounds: 10,
        intervalMinutes: 2,
        exercises: [
          {
            exerciseId: exercise._id,
            order: 1,
            reps: 15,
            note: 'épaule droite',
          },
        ],
      },
    ],
  });

  // La cible a déjà une séance : la copie doit se poser après.
  const targetProgram = await Program.create({ clientId: targetClient._id });
  await Session.create({ programId: targetProgram._id, order: 1, blocks: [] });

  /** Appelle le contrôleur et rend ce qu'il a répondu, ou l'erreur levée. */
  const invoke = async (targetId: string, payload: unknown) => {
    let httpStatus = 0;
    let body: unknown = null;
    let error: Error | null = null;
    const req = {
      params: { clientId: targetId },
      body: payload,
      requestId: 'test',
    };
    const res = {
      locals: { coach: { _id: coachId } },
      status(code: number) {
        httpStatus = code;
        return this;
      },
      json(data: unknown) {
        body = data;
        return this;
      },
    };
    await (
      copySessionToClient as unknown as (
        q: unknown,
        r: unknown,
        n: (e?: Error) => void
      ) => Promise<void>
    )(req, res, (e) => {
      if (e) error = e;
    });
    return { httpStatus, body, error };
  };

  // ── La copie arrive bien, et au bon endroit ───────────────────────────────
  const r = await invoke(String(targetClient._id), {
    sourceClientId: String(source._id),
    sourceSessionId: String(session._id),
  });
  ok(
    'la copie répond 201',
    r.httpStatus === 201,
    `statut ${r.httpStatus}${r.error ? ' · ' + (r.error as Error).message : ''}`
  );

  const onTarget = await Session.find({ programId: targetProgram._id })
    .sort({ order: 1 })
    .lean();
  ok(
    '  → le client de destination a maintenant deux séances',
    onTarget.length === 2,
    `${onTarget.length}`
  );

  const copied = onTarget[1];
  ok(
    '  → elle se pose à la fin de son programme',
    copied?.order === 2,
    `order ${copied?.order}`
  );
  ok(
    '  → avec la consigne de séance',
    copied?.notes === 'Garder le dos droit',
    copied?.notes ?? '(vide)'
  );
  ok(
    '  → et son bloc, réglages compris',
    copied?.blocks?.[0]?.type === 'emom' &&
      copied?.blocks?.[0]?.rounds === 10 &&
      copied?.blocks?.[0]?.intervalMinutes === 2,
    JSON.stringify({
      type: copied?.blocks?.[0]?.type,
      rounds: copied?.blocks?.[0]?.rounds,
      interval: copied?.blocks?.[0]?.intervalMinutes,
    })
  );
  ok(
    "  → et la consigne que le coach avait écrite sur l'exercice",
    copied?.blocks?.[0]?.exercises?.[0]?.note === 'épaule droite',
    copied?.blocks?.[0]?.exercises?.[0]?.note ?? '(vide)'
  );

  // ── Deux séances distinctes, qui ne partagent aucun identifiant ───────────
  // Les sous-documents portent bien un `_id` à l'exécution — Mongoose le pose
  // par défaut — mais le type du bloc ne le déclare pas.
  const idOf = (o: unknown) => String((o as { _id?: unknown })?._id ?? '');
  const original = await Session.findById(session._id).lean();
  ok(
    "la copie ne partage pas l'identifiant de séance",
    String(copied?._id) !== String(original?._id)
  );
  ok(
    '  → ni celui de son bloc',
    idOf(copied?.blocks?.[0]) !== idOf(original?.blocks?.[0]),
    `${idOf(copied?.blocks?.[0]).slice(-6)} ≠ ${idOf(original?.blocks?.[0]).slice(-6)}`
  );
  ok(
    '  → ni celui de son exercice',
    idOf(copied?.blocks?.[0]?.exercises?.[0]) !==
      idOf(original?.blocks?.[0]?.exercises?.[0])
  );
  ok("  → l'originale n'a pas bougé de place", original?.order === 1);
  ok(
    '  → et garde ses jours conseillés',
    JSON.stringify(original?.suggestedDays) === '[0,3]',
    JSON.stringify(original?.suggestedDays)
  );

  // ── Les jours conseillés ne suivent pas ───────────────────────────────────
  // Ils appartiennent à la semaine de quelqu'un, pas à l'entraînement.
  ok(
    'les jours conseillés ne suivent pas la copie',
    !copied?.suggestedDays || copied.suggestedDays.length === 0,
    JSON.stringify(copied?.suggestedDays ?? [])
  );

  // ── Deux autorisations, pas une ───────────────────────────────────────────
  const toStranger = await invoke(String(stranger._id), {
    sourceClientId: String(source._id),
    sourceSessionId: String(session._id),
  });
  ok(
    "copier vers un client qui n'est pas le sien est refusé",
    (toStranger.error as { statusCode?: number } | null)?.statusCode === 404,
    String((toStranger.error as Error | null)?.message ?? 'aucune erreur')
  );

  const asStranger = await invoke(String(targetClient._id), {
    sourceClientId: String(stranger._id),
    sourceSessionId: String(session._id),
  });
  ok(
    "  → et copier DEPUIS un client qui n'est pas le sien aussi",
    (asStranger.error as { statusCode?: number } | null)?.statusCode === 404,
    String((asStranger.error as Error | null)?.message ?? 'aucune erreur')
  );

  const unknownId = await invoke(String(targetClient._id), {
    sourceClientId: String(source._id),
    sourceSessionId: String(new Types.ObjectId()),
  });
  ok(
    "  → une séance qui n'existe pas donne un 404, pas une copie vide",
    (unknownId.error as { statusCode?: number } | null)?.statusCode === 404,
    String((unknownId.error as Error | null)?.message ?? 'aucune erreur')
  );

  const after = await Session.countDocuments({ programId: targetProgram._id });
  ok(
    "  → et aucun de ces refus n'a rien écrit",
    after === 2,
    `${after} séances`
  );

  console.log(`\n${green} OK · ${red} FAIL`);
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(red > 0 ? 1 : 0);
};

void main();
