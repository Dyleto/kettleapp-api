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
  let okCount = 0;
  let failCount = 0;
  const ok = (label: string, condition: boolean, preuve = '') => {
    console.log(
      `${condition ? 'OK  ' : 'FAIL'}  ${label}${preuve ? ' — ' + preuve : ''}`
    );
    if (condition) okCount += 1;
    else failCount += 1;
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

  // `createdBy` et non `coachId` : un exercice appartient au coach qui l'a
  // créé, et c'est le nom que porte le modèle. L'écart est passé inaperçu
  // jusqu'au premier lancement de ce script — il ne tourne pas en CI, faute
  // de pouvoir y télécharger un binaire MongoDB, et personne ne l'avait
  // encore lancé à la main.
  const exercise = await Exercise.create({
    name: 'Kettlebell Swing',
    createdBy: coachId,
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

  /**
   * Appelle le contrôleur et attend ce qu'il a répondu, ou l'erreur levée.
   *
   * On n'attend pas l'appel, on attend la réponse — et c'est tout le piège.
   * `catchAsync` rend `void` : Express n'attend jamais le retour d'un
   * contrôleur, il attend qu'on écrive dans `res`. Un `await` sur l'appel
   * rendait donc la main avant que le contrôleur ait touché à la base, et les
   * seize assertions de ce script mesuraient un état vide. Six passaient
   * quand même, en comparant du vide à du vide : c'est la seule chose pire
   * qu'un rouge.
   *
   * Le délai de garde est là pour que, le jour où le contrôleur ne répond
   * plus du tout, le script le dise au lieu de se figer.
   */
  const invoke = async (targetId: string, payload: unknown) => {
    let httpStatus = 0;
    let body: unknown = null;
    let error: Error | null = null;
    let settle!: () => void;
    const answered = new Promise<void>((resolve) => (settle = resolve));
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
        settle();
        return this;
      },
    };
    (
      copySessionToClient as unknown as (
        q: unknown,
        r: unknown,
        n: (e?: Error) => void
      ) => void
    )(req, res, (e) => {
      if (e) error = e;
      settle();
    });
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      answered,
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          error = new Error('le contrôleur n’a ni répondu ni levé en 5 s');
          resolve();
        }, 5000);
      }),
    ]);
    clearTimeout(timer);
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
  //
  // Le bloc porte un `_id`, l'exercice non : `blockExerciseSchema` est
  // déclaré `{ _id: false }`, le bloc qui l'entoure `{ _id: true }`. Mesuré
  // hors base — un bloc neuf rend `{ exerciseId, order }` et rien d'autre.
  //
  // L'assertion qui vivait ici comparait deux identifiants d'exercice, donc
  // deux chaînes vides, et tombait pour cette seule raison. Son commentaire
  // affirmait que les sous-documents en portent tous un : vrai du bloc, faux
  // de l'exercice. Elle est remplacée par un parcours de l'arbre entier, qui
  // reste juste si quelqu'un active un jour les identifiants d'exercice.
  const idOf = (o: unknown) => String((o as { _id?: unknown })?._id ?? '');

  /** Tous les identifiants d'une séance, à toutes les profondeurs. */
  const idsOf = (s: unknown) => {
    const doc = s as {
      _id?: unknown;
      blocks?: { _id?: unknown; exercises?: { _id?: unknown }[] }[];
    };
    return [
      idOf(doc),
      ...(doc.blocks ?? []).flatMap((b) => [
        idOf(b),
        ...(b.exercises ?? []).map(idOf),
      ]),
    ].filter(Boolean);
  };
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
  // Le `>= 2` n'est pas décoratif : sans lui, deux arbres sans aucun
  // identifiant se partageraient « rien » et l'assertion passerait sans rien
  // couvrir. C'est exactement le piège dans lequel l'ancienne version était
  // tombée.
  const shared = idsOf(copied).filter((id) => idsOf(original).includes(id));
  ok(
    '  → ni aucun autre, à aucune profondeur',
    shared.length === 0 && idsOf(copied).length >= 2,
    shared.length > 0
      ? `partagé(s) : ${shared.join(', ')}`
      : `${idsOf(copied).length} identifiants comparés`
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

  console.log(`\n${okCount} OK · ${failCount} FAIL`);
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(failCount > 0 ? 1 : 0);
};

void main();
