/**
 * Vérifie `applyRoundsDone` sans base de données.
 *
 * C'est une fonction pure : elle se contrôle pour de vrai, ici, contrairement
 * à `verify:copy` qui attend un MongoDB en mémoire. Lancer :
 *
 *     npm run verify:rounds
 */
import { applyRoundsDone } from '../services/completedSessionService';

let echecs = 0;
const ok = (libelle: string, condition: boolean, preuve = '') => {
  if (!condition) echecs += 1;
  console.log(
    `${condition ? 'OK  ' : 'FAIL'}  ${libelle}${preuve ? ' — ' + preuve : ''}`
  );
};

const blocs = () => [
  { order: 1, type: 'warmup', rounds: undefined as number | undefined },
  { order: 2, type: 'amrap', rounds: undefined as number | undefined },
  { order: 3, type: 'emom', rounds: 10 as number | undefined },
];

console.log('\n── applyRoundsDone');

// Sans rien à appliquer, rien ne bouge — et c'est la même référence.
{
  const avant = blocs();
  const apres = applyRoundsDone(avant, undefined);
  ok('sans tours envoyés, les blocs sont rendus tels quels', apres === avant);
  ok(
    '  → et une liste vide ne touche à rien',
    applyRoundsDone(avant, []) === avant
  );
}

// Le tour se pose sur le bon bloc, et sur lui seul.
{
  const apres = applyRoundsDone(blocs(), [{ blockOrder: 2, rounds: 6 }]);
  ok(
    'le score se pose sur le bloc visé',
    apres.find((b) => b.order === 2)?.performedRounds === 6,
    JSON.stringify(apres.map((b) => [b.order, b.performedRounds]))
  );
  ok(
    '  → et sur aucun autre',
    apres.filter((b) => b.performedRounds !== undefined).length === 1
  );
}

// Le prescrit et le réalisé cohabitent : c'est leur comparaison qui a de la
// valeur pour le coach.
{
  const apres = applyRoundsDone(blocs(), [{ blockOrder: 3, rounds: 8 }]);
  const emom = apres.find((b) => b.order === 3);
  ok(
    "le réalisé n'écrase pas le prescrit",
    emom?.rounds === 10 && emom?.performedRounds === 8,
    `prescrit ${emom?.rounds} · réalisé ${emom?.performedRounds}`
  );
}

// Zéro est une réponse, pas une absence.
{
  const apres = applyRoundsDone(blocs(), [{ blockOrder: 2, rounds: 0 }]);
  ok(
    'zéro tour est enregistré, pas effacé',
    apres.find((b) => b.order === 2)?.performedRounds === 0,
    String(apres.find((b) => b.order === 2)?.performedRounds)
  );
}

// Un bloc qu'on ne connaît pas n'en crée pas un.
{
  const apres = applyRoundsDone(blocs(), [{ blockOrder: 99, rounds: 4 }]);
  ok(
    "un ordre inconnu n'invente pas de bloc",
    apres.length === 3 && apres.every((b) => b.performedRounds === undefined)
  );
}

// On ne mute pas ce qu'on reçoit : le snapshot d'origine reste intact.
{
  const avant = blocs();
  applyRoundsDone(avant, [{ blockOrder: 2, rounds: 5 }]);
  ok(
    "l'entrée n'est pas modifiée au passage",
    (avant[1] as { performedRounds?: number }).performedRounds === undefined
  );
}

console.log(`\n${echecs === 0 ? 'Tout est vert.' : `${echecs} échec(s).`}`);
process.exit(echecs === 0 ? 0 : 1);
