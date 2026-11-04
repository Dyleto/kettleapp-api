import mongoose from 'mongoose';
import '../shared/config/loadEnv';
import Session from '../models/Session';
import CompletedSession from '../models/CompletedSession';

/**
 * « Pyramide » et « Échelle » n'étaient qu'un seul format sous deux noms.
 *
 * Mesuré avant de fusionner : les deux types ne différaient qu'en trois
 * endroits, tous cosmétiques — le libellé, la description du sélecteur, et le
 * schéma proposé par défaut (`5-10-15-20-15-10-5` contre `5-10-15-20`).
 * Partout ailleurs ils passaient par la même branche, et l'API ne les
 * distinguait que par une entrée d'énumération. Rien ne reliait même le nom au
 * schéma : une « Pyramide » dont le coach tapait `5-10-15` continuait de
 * s'annoncer pyramide alors qu'elle montait tout droit.
 *
 * Tout devient donc `ladder`, et `pyramid` disparaît. Une pyramide reste
 * parfaitement lisible : c'est une échelle dont le schéma redescend, et le
 * schéma est justement ce qu'on ne touche pas.
 *
 * ── Pourquoi un script et non une conversion au premier enregistrement ─────
 *
 * Le projet a déjà fusionné deux formats ainsi — `every` vers `emom`, converti
 * au premier enregistrement, « la donnée converge au rythme où le coach touche
 * à ses séances ». Cette fois le type disparaît de l'énumération, donc du
 * contrat de sortie : un programme resté en `pyramid` ferait répondre 500 à
 * tout l'écran du client. Converger lentement n'est pas une option quand
 * l'ancienne valeur cesse d'être valide.
 *
 * D'où l'ordre de déploiement, qui n'est pas négociable :
 *
 *   1. ce script, sur la base de production ;
 *   2. puis seulement la version qui ne connaît plus `pyramid`.
 *
 * ── L'historique aussi ─────────────────────────────────────────────────────
 *
 * `CompletedSession.blocks[].type` est une chaîne libre, délibérément : « un
 * bilan de l'an dernier peut porter un format qui n'existe plus, et il doit
 * rester lisible ». L'historique survivrait donc tel quel au retrait de
 * l'énumération — mais le front, qui ne connaîtrait plus ce type, retomberait
 * sur sa valeur brute et afficherait « pyramid » à un francophone.
 *
 * On le migre donc, et ce n'est pas rétro-remplir : rien n'est inventé, aucune
 * donnée manquante n'est devinée. C'est un format renommé, et ce que le client
 * a réellement fait — le schéma, les charges, les tours — n'est pas touché.
 */
const FROM = 'pyramid';
const TO = 'ladder';

/** Combien de documents portent encore au moins un bloc à migrer. */
const remaining = async () => ({
  sessions: await Session.countDocuments({ 'blocks.type': FROM }),
  completed: await CompletedSession.countDocuments({ 'blocks.type': FROM }),
});

/**
 * Renomme le type dans tous les blocs concernés, et seulement eux.
 *
 * `arrayFilters` plutôt qu'une relecture document par document : l'écriture
 * est atomique, elle ne charge rien en mémoire, et elle est rejouable — un
 * second passage ne trouve plus rien à faire.
 *
 * Sur la collection brute et non à travers Mongoose : une migration ne veut ni
 * validateur, ni cast, ni middleware. Celle-ci renomme justement une valeur
 * que le schéma n'acceptera plus, et le pilote, lui, ne s'en soucie pas. Cela
 * rend aussi le script utilisable dans les deux sens de l'ordre de
 * déploiement, si l'énumération est déjà partie.
 */
const rename = async (collection: mongoose.Collection) => {
  const { modifiedCount } = await collection.updateMany(
    { 'blocks.type': FROM },
    { $set: { 'blocks.$[block].type': TO } },
    { arrayFilters: [{ 'block.type': FROM }] }
  );
  return modifiedCount;
};

const main = async () => {
  // À blanc par défaut. Une migration lancée par mégarde ne doit rien
  // réécrire : c'est `--apply` qui engage.
  const apply = process.argv.includes('--apply');

  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/kettleapp';
  await mongoose.connect(uri);
  console.log(`Base : ${uri.replace(/\/\/[^@]*@/, '//***@')}`);

  const before = await remaining();
  console.log(
    `À migrer : ${before.sessions} séance(s) du programme, ` +
      `${before.completed} bilan(s) d'historique.`
  );

  if (before.sessions === 0 && before.completed === 0) {
    console.log('Rien à faire — déjà migré, ou aucun bloc en pyramide.');
    await mongoose.disconnect();
    return;
  }

  if (!apply) {
    console.log(
      "\nÀ blanc : rien n'a été écrit. Relancer avec --apply pour migrer."
    );
    await mongoose.disconnect();
    return;
  }

  const sessions = await rename(Session.collection);
  const completed = await rename(CompletedSession.collection);
  console.log(`Migré : ${sessions} séance(s), ${completed} bilan(s).`);

  // Le script vérifie son propre travail plutôt que de l'annoncer : une
  // migration qu'on croit passée est pire qu'une migration qu'on sait à
  // refaire.
  const after = await remaining();
  await mongoose.disconnect();

  if (after.sessions > 0 || after.completed > 0) {
    console.error(
      `\nÉCHEC : il reste ${after.sessions} séance(s) et ` +
        `${after.completed} bilan(s) en « ${FROM} ». Ne pas déployer la ` +
        `version qui retire ce type.`
    );
    process.exit(1);
  }

  console.log(
    `\nPlus aucun bloc en « ${FROM} ». La version qui retire ce type peut ` +
      `partir.`
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
