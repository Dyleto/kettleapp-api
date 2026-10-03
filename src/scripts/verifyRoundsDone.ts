/**
 * Vérifie `applyRoundsDone` sans base de données.
 *
 * C'est une fonction pure : elle se contrôle pour de vrai, ici, contrairement
 * à `verify:copy` qui attend un MongoDB en mémoire. Lancer :
 *
 *     npm run verify:rounds
 */
import { applyRoundsDone } from '../modules/client/completedSession.service';

let failureCount = 0;
const ok = (label: string, condition: boolean, preuve = '') => {
  if (!condition) failureCount += 1;
  console.log(
    `${condition ? 'OK  ' : 'FAIL'}  ${label}${preuve ? ' — ' + preuve : ''}`
  );
};

const blocks = () => [
  { order: 1, type: 'warmup', rounds: undefined as number | undefined },
  { order: 2, type: 'amrap', rounds: undefined as number | undefined },
  { order: 3, type: 'emom', rounds: 10 as number | undefined },
];

console.log('\n── applyRoundsDone');

// Sans rien à appliquer, rien ne bouge — et c'est la même référence.
{
  const before = blocks();
  const after = applyRoundsDone(before, undefined);
  ok('sans tours envoyés, les blocs sont rendus tels quels', after === before);
  ok(
    '  → et une liste vide ne touche à rien',
    applyRoundsDone(before, []) === before
  );
}

// Le tour se pose sur le bon bloc, et sur lui seul.
{
  const after = applyRoundsDone(blocks(), [{ blockOrder: 2, rounds: 6 }]);
  ok(
    'le score se pose sur le bloc visé',
    after.find((b) => b.order === 2)?.performedRounds === 6,
    JSON.stringify(after.map((b) => [b.order, b.performedRounds]))
  );
  ok(
    '  → et sur aucun autre',
    after.filter((b) => b.performedRounds !== undefined).length === 1
  );
}

// Le prescrit et le réalisé cohabitent : c'est leur comparaison qui a de la
// valeur pour le coach.
{
  const after = applyRoundsDone(blocks(), [{ blockOrder: 3, rounds: 8 }]);
  const emom = after.find((b) => b.order === 3);
  ok(
    "le réalisé n'écrase pas le prescrit",
    emom?.rounds === 10 && emom?.performedRounds === 8,
    `prescrit ${emom?.rounds} · réalisé ${emom?.performedRounds}`
  );
}

// Zéro est une réponse, pas une absence.
{
  const after = applyRoundsDone(blocks(), [{ blockOrder: 2, rounds: 0 }]);
  ok(
    'zéro tour est enregistré, pas effacé',
    after.find((b) => b.order === 2)?.performedRounds === 0,
    String(after.find((b) => b.order === 2)?.performedRounds)
  );
}

// Un bloc qu'on ne connaît pas n'en crée pas un.
{
  const after = applyRoundsDone(blocks(), [{ blockOrder: 99, rounds: 4 }]);
  ok(
    "un ordre inconnu n'invente pas de bloc",
    after.length === 3 && after.every((b) => b.performedRounds === undefined)
  );
}

// On ne mute pas ce qu'on reçoit : le snapshot d'origine reste intact.
{
  const before = blocks();
  applyRoundsDone(before, [{ blockOrder: 2, rounds: 5 }]);
  ok(
    "l'entrée n'est pas modifiée au passage",
    (before[1] as { performedRounds?: number }).performedRounds === undefined
  );
}

console.log(
  `\n${failureCount === 0 ? 'Tout est vert.' : `${failureCount} échec(s).`}`
);
process.exit(failureCount === 0 ? 0 : 1);
