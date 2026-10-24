// Le build de production se charge-t-il avec les seules dépendances de
// production ?
//
// Render lance `npm install && npm run build` avec `NODE_ENV=production`,
// donc npm écarte les devDependencies. La CI, elle, fait `npm ci` : elle les
// installe toutes, et son `npm run build` vert ne disait donc rien du build
// qui compte. Treize erreurs de types sont parties en production sur une CI
// verte, et c'est le journal de déploiement qui les a dites.
//
// Compiler ne suffit pas à vérifier : une dépendance rangée dans
// `devDependencies` par erreur passe le compilateur — `skipLibCheck` et les
// types ambiants suffisent souvent — puis manque au premier `require`. On
// charge donc chaque module produit, ce que seul le démarrage ferait sinon,
// et le démarrage attend une base de données.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name))
      : entry.name.endsWith('.js')
        ? [join(dir, entry.name)]
        : []
  );

let modules;
try {
  modules = walk('dist');
} catch {
  console.error("dist/ est absent : lancer `npm run build` d'abord.");
  process.exit(1);
}

// Garde de vacuité : un `dist/` presque vide — un build partiel, une
// exclusion trop large dans `tsconfig.build.json` — ferait passer ce script
// sans qu'il ait rien chargé.
const FLOOR = 40;
if (modules.length < FLOOR) {
  console.error(
    `dist/ ne porte que ${modules.length} modules, ${FLOOR} attendus au moins.`
  );
  process.exit(1);
}

// Les intrus se signalent avant qu'on charge quoi que ce soit.
//
// Ni les tests ni les scripts n'ont leur place en production : ils importent
// `vitest` et `mongodb-memory-server`, et c'est exactement ce qui faisait
// échouer le déploiement. L'ordre compte — la première version chargeait
// d'abord et signalait ensuite, donc elle *exécutait* l'intrus : charger
// `buildContract` lui a fait lire `src/contract/` et se plaindre de fichiers
// absents, au milieu de la sortie du contrôle.
const strays = modules.filter(
  (file) =>
    file.includes('.test.') || file.startsWith(join('dist', 'scripts') + '/')
);

if (strays.length > 0) {
  for (const file of strays)
    console.error(`N'A RIEN À FAIRE EN PRODUCTION ${file}`);
  process.exit(1);
}

// `index.js` écarté : il se connecte à la base et écoute un port.
const loadable = modules.filter((file) => file !== join('dist', 'index.js'));

const failures = [];
for (const file of loadable) {
  try {
    require(`../${file}`);
  } catch (error) {
    failures.push([file, String(error.message).split('\n')[0]]);
  }
}

if (failures.length > 0) {
  for (const [file, message] of failures)
    console.error(`ÉCHEC ${file} → ${message}`);
  process.exit(1);
}

console.log(
  `${loadable.length} modules chargés avec les seules dépendances de production.`
);
