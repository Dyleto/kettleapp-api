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
import { copySessionToClient } from '../controllers/coachController';

const main = async () => {
  let vert = 0;
  let rouge = 0;
  const ok = (label: string, condition: boolean, preuve = '') => {
    console.log(`${condition ? 'OK  ' : 'FAIL'}  ${label}${preuve ? ' — ' + preuve : ''}`);
    if (condition) vert += 1;
    else rouge += 1;
  };

  let mongo;
  try {
    mongo = await MongoMemoryServer.create();
  } catch (erreur) {
    // Le premier lancement télécharge un binaire MongoDB. Derrière un réseau
    // fermé, l'échec sort en pile d'appels illisible : on dit ce qui manque.
    console.error(
      'Impossible de démarrer un MongoDB de test.\n' +
        "`mongodb-memory-server` télécharge un binaire au premier lancement, et\n" +
        "le dépôt n'est pas joignable d'ici. Relancez depuis un poste qui atteint\n" +
        'fastdl.mongodb.org, ou pointez MONGOMS_SYSTEM_BINARY sur un `mongod`\n' +
        'déjà installé.\n\n' +
        String(erreur instanceof Error ? erreur.message : erreur)
    );
    process.exit(2);
  }
  await mongoose.connect(mongo.getUri());

  const coachId = new Types.ObjectId();
  const autreCoachId = new Types.ObjectId();

  const creerClient = async (coach: Types.ObjectId) =>
    Client.create({ userId: new Types.ObjectId(), coaches: [{ coachId: coach }] });

  const source = await creerClient(coachId);
  const cible = await creerClient(coachId);
  const etranger = await creerClient(autreCoachId);

  const exercice = await Exercise.create({
    name: 'Kettlebell Swing',
    coachId,
  });

  const programmeSource = await Program.create({ clientId: source._id });
  const seance = await Session.create({
    programId: programmeSource._id,
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
          { exerciseId: exercice._id, order: 1, reps: 15, note: 'épaule droite' },
        ],
      },
    ],
  });

  // La cible a déjà une séance : la copie doit se poser après.
  const programmeCible = await Program.create({ clientId: cible._id });
  await Session.create({ programId: programmeCible._id, order: 1, blocks: [] });

  /** Appelle le contrôleur et rend ce qu'il a répondu, ou l'erreur levée. */
  const appeler = async (targetId: string, body: unknown) => {
    let statut = 0;
    let corps: unknown = null;
    let erreur: Error | null = null;
    const req = { params: { clientId: targetId }, body, requestId: 'test' };
    const res = {
      locals: { coach: { _id: coachId } },
      status(code: number) {
        statut = code;
        return this;
      },
      json(data: unknown) {
        corps = data;
        return this;
      },
    };
    await (copySessionToClient as unknown as (
      q: unknown,
      r: unknown,
      n: (e?: Error) => void
    ) => Promise<void>)(req, res, (e) => {
      if (e) erreur = e;
    });
    return { statut, corps, erreur };
  };

  // ── La copie arrive bien, et au bon endroit ───────────────────────────────
  const r = await appeler(String(cible._id), {
    sourceClientId: String(source._id),
    sourceSessionId: String(seance._id),
  });
  ok('la copie répond 201', r.statut === 201, `statut ${r.statut}${r.erreur ? ' · ' + (r.erreur as Error).message : ''}`);

  const chezCible = await Session.find({ programId: programmeCible._id }).sort({ order: 1 }).lean();
  ok('  → le client de destination a maintenant deux séances', chezCible.length === 2, `${chezCible.length}`);

  const copie = chezCible[1];
  ok('  → elle se pose à la fin de son programme', copie?.order === 2, `order ${copie?.order}`);
  ok('  → avec la consigne de séance', copie?.notes === 'Garder le dos droit', copie?.notes ?? '(vide)');
  ok('  → et son bloc, réglages compris',
     copie?.blocks?.[0]?.type === 'emom' &&
     copie?.blocks?.[0]?.rounds === 10 &&
     copie?.blocks?.[0]?.intervalMinutes === 2,
     JSON.stringify({ type: copie?.blocks?.[0]?.type, rounds: copie?.blocks?.[0]?.rounds, interval: copie?.blocks?.[0]?.intervalMinutes }));
  ok('  → et la consigne que le coach avait écrite sur l\'exercice',
     copie?.blocks?.[0]?.exercises?.[0]?.note === 'épaule droite',
     copie?.blocks?.[0]?.exercises?.[0]?.note ?? '(vide)');

  // ── Deux séances distinctes, qui ne partagent aucun identifiant ───────────
  // Les sous-documents portent bien un `_id` à l'exécution — Mongoose le pose
  // par défaut — mais le type du bloc ne le déclare pas.
  const idDe = (o: unknown) => String((o as { _id?: unknown })?._id ?? '');
  const originale = await Session.findById(seance._id).lean();
  ok('la copie ne partage pas l\'identifiant de séance',
     String(copie?._id) !== String(originale?._id));
  ok('  → ni celui de son bloc',
     idDe(copie?.blocks?.[0]) !== idDe(originale?.blocks?.[0]),
     `${idDe(copie?.blocks?.[0]).slice(-6)} ≠ ${idDe(originale?.blocks?.[0]).slice(-6)}`);
  ok('  → ni celui de son exercice',
     idDe(copie?.blocks?.[0]?.exercises?.[0]) !==
       idDe(originale?.blocks?.[0]?.exercises?.[0]));
  ok('  → l\'originale n\'a pas bougé de place', originale?.order === 1);
  ok('  → et garde ses jours conseillés',
     JSON.stringify(originale?.suggestedDays) === '[0,3]',
     JSON.stringify(originale?.suggestedDays));

  // ── Les jours conseillés ne suivent pas ───────────────────────────────────
  // Ils appartiennent à la semaine de quelqu'un, pas à l'entraînement.
  ok('les jours conseillés ne suivent pas la copie',
     !copie?.suggestedDays || copie.suggestedDays.length === 0,
     JSON.stringify(copie?.suggestedDays ?? []));

  // ── Deux autorisations, pas une ───────────────────────────────────────────
  const versEtranger = await appeler(String(etranger._id), {
    sourceClientId: String(source._id),
    sourceSessionId: String(seance._id),
  });
  ok('copier vers un client qui n\'est pas le sien est refusé',
     (versEtranger.erreur as { statusCode?: number } | null)?.statusCode === 404,
     String((versEtranger.erreur as Error | null)?.message ?? 'aucune erreur'));

  const depuisEtranger = await appeler(String(cible._id), {
    sourceClientId: String(etranger._id),
    sourceSessionId: String(seance._id),
  });
  ok('  → et copier DEPUIS un client qui n\'est pas le sien aussi',
     (depuisEtranger.erreur as { statusCode?: number } | null)?.statusCode === 404,
     String((depuisEtranger.erreur as Error | null)?.message ?? 'aucune erreur'));

  const inconnue = await appeler(String(cible._id), {
    sourceClientId: String(source._id),
    sourceSessionId: String(new Types.ObjectId()),
  });
  ok('  → une séance qui n\'existe pas donne un 404, pas une copie vide',
     (inconnue.erreur as { statusCode?: number } | null)?.statusCode === 404,
     String((inconnue.erreur as Error | null)?.message ?? 'aucune erreur'));

  const apres = await Session.countDocuments({ programId: programmeCible._id });
  ok('  → et aucun de ces refus n\'a rien écrit', apres === 2, `${apres} séances`);

  console.log(`\n${vert} OK · ${rouge} FAIL`);
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(rouge > 0 ? 1 : 0);

};

void main();
