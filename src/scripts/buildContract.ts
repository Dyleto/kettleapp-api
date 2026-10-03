/**
 * Publier le contrat : un seul fichier de types, sans dépendance.
 *
 * Le front ne peut pas importer les schémas : ils tirent Zod et Mongoose, et
 * un navigateur n'a rien à faire du second. Il n'a pas besoin des schémas non
 * plus — il ne valide rien, il lit. Ce qui lui manque, ce sont les types.
 *
 * `tsc --declaration` sur le dossier `contract/` les produit déjà, mais en
 * autant de fichiers que de modules, avec leurs `import` relatifs et leurs
 * références à Zod. On préfère un fichier unique, lisible, que le front
 * range dans `src/shared/types/` et versionne comme le reste : c'est une
 * dépendance de données, et elle doit se relire dans une revue.
 *
 * L'empreinte en tête du fichier est ce qui permet au front de dire qu'il est
 * en retard sans avoir à comparer ligne à ligne.
 *
 * `--check` ne récrit rien et échoue si le fichier versionné n'est plus
 * celui que les schémas produisent. C'est ce que la CI appelle : un schéma
 * modifié sans régénération laisserait le front sur des types périmés, et
 * rien ne le dirait.
 *
 *   npm run contract:build
 *   npm run contract:check
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';

const SORTIE = join(__dirname, '..', '..', 'contract', 'kettle-contract.ts');

/**
 * Les types publiés, et dans quel ordre.
 *
 * Nommés un par un plutôt que balayés : ce qui est publié est une décision.
 * Un type ajouté au contrat n'arrive pas chez le front parce qu'il existe,
 * mais parce que quelqu'un l'a inscrit ici.
 */
const PUBLIES = [
  ['primitives', ['CustomMetricPayload']],
  [
    'user.contract',
    [
      'HealthConsentPayload',
      'UserPayload',
      'AuthPayload',
      'InviteCheckPayload',
      'MessagePayload',
      'SuccessPayload',
    ],
  ],
  ['exercise.contract', ['ExercisePayload']],
  [
    'program.contract',
    [
      'BlockExercisePayload',
      'SessionBlockPayload',
      'SessionPayload',
      'ProgramPayload',
      'ClientProgramPayload',
    ],
  ],
  [
    'completed.contract',
    [
      'PerformedSetPayload',
      'PerformedPayload',
      'BlockExerciseSnapshotPayload',
      'BlockSnapshotPayload',
      'FeedbackPayload',
      'LegacyMetricsPayload',
      'CompletedSessionPayload',
      'CompletedWrapperPayload',
      'ClientHistoryPayload',
    ],
  ],
  [
    'coach.contract',
    [
      'ClientRowPayload',
      'ClientDetailsPayload',
      'ActiveInvitationPayload',
      'GeneratedInvitationPayload',
      'LinkedCoachPayload',
      'AccountSummaryPayload',
    ],
  ],
  [
    'admin.contract',
    ['AdminStatsPayload', 'AdminCoachPayload', 'CreatedCoachPayload'],
  ],
] as const;

/**
 * Écrire un type comme TypeScript le voit, pas comme il est déclaré.
 *
 * Un `z.infer<typeof x>` ne se recopie pas : il faut demander au compilateur
 * ce qu'il en a déduit, puis l'imprimer. `NoTruncation` est indispensable —
 * sans lui, un type profond comme la séance se termine par `...` et le
 * fichier publié ne compile pas.
 */
const ecrireType = (checker: ts.TypeChecker, symbole: ts.Symbol): string => {
  const type = checker.getDeclaredTypeOfSymbol(symbole);
  return checker.typeToString(
    type,
    undefined,
    ts.TypeFormatFlags.NoTruncation |
      ts.TypeFormatFlags.InTypeAlias |
      ts.TypeFormatFlags.UseFullyQualifiedType
  );
};

const racine = join(__dirname, '..', 'contract');
const programme = ts.createProgram(
  PUBLIES.map(([fichier]) => join(racine, `${fichier}.ts`)),
  {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
    skipLibCheck: true,
  }
);
const checker = programme.getTypeChecker();

const morceaux: string[] = [];
let manquants = 0;

for (const [fichier, noms] of PUBLIES) {
  const source = programme.getSourceFile(join(racine, `${fichier}.ts`));
  if (!source) {
    console.error(`introuvable : ${fichier}.ts`);
    manquants++;
    continue;
  }
  const exportes = checker.getExportsOfModule(
    checker.getSymbolAtLocation(source)!
  );
  for (const nom of noms) {
    const symbole = exportes.find((s) => s.getName() === nom);
    if (!symbole) {
      console.error(`type absent du contrat : ${nom} (${fichier}.ts)`);
      manquants++;
      continue;
    }
    const doc = ts.displayPartsToString(
      symbole.getDocumentationComment(checker)
    );
    morceaux.push(
      (doc
        ? `/**\n${doc
            .split('\n')
            .map((l) => ` * ${l}`.trimEnd())
            .join('\n')}\n */\n`
        : '') + `export type ${nom} = ${ecrireType(checker, symbole)};`
    );
  }
}

if (manquants > 0) {
  console.error(`\n${manquants} type(s) manquant(s) : rien n'est écrit.`);
  process.exit(1);
}

const corps = morceaux.join('\n\n');
const empreinte = createHash('sha256').update(corps).digest('hex').slice(0, 12);

const entete = `/**
 * Le contrat de l'API Kettle — ENGENDRÉ, NE PAS MODIFIER À LA MAIN.
 *
 * Produit par \`npm run contract:build\` dans kettleapp-api, depuis les
 * schémas Zod de \`src/contract/\`. Ces schémas sont ce que l'API applique à
 * ses réponses : un champ qui n'y figure pas ne sort pas.
 *
 * Pour le changer : modifier le schéma côté API, relancer la génération,
 * reporter le fichier ici. Le modifier ici ne changerait rien à ce que l'API
 * envoie — cela ferait seulement mentir les types.
 *
 * Empreinte : ${empreinte}
 */

`;

const fichier = entete + corps + '\n';

mkdirSync(join(__dirname, '..', '..', 'contract'), { recursive: true });

// Passé par le formateur avant d'être écrit : un type profond s'imprime sur
// une seule ligne, et le front le versionne — il doit se relire.
const formate = (contenu: string): string => {
  const brouillon = join(__dirname, '..', '..', 'contract', '.brouillon.ts');
  writeFileSync(brouillon, contenu, 'utf8');
  execFileSync('npx', ['prettier', '--write', brouillon], { stdio: 'ignore' });
  const sortie = readFileSync(brouillon, 'utf8');
  execFileSync('rm', ['-f', brouillon]);
  return sortie;
};

const attendu = formate(fichier);

if (process.argv.includes('--check')) {
  const actuel = existsSync(SORTIE) ? readFileSync(SORTIE, 'utf8') : '';
  if (actuel === attendu) {
    console.log(
      `contract/kettle-contract.ts est à jour (empreinte ${empreinte})`
    );
    process.exit(0);
  }
  console.error(
    actuel
      ? `contract/kettle-contract.ts est périmé : les schémas donnent ${empreinte}.`
      : 'contract/kettle-contract.ts est absent.'
  );
  console.error(
    'Relancer `npm run contract:build`, puis reporter le fichier au front.'
  );
  process.exit(1);
}

writeFileSync(SORTIE, attendu, 'utf8');
console.log(
  `${morceaux.length} types publiés dans contract/kettle-contract.ts`
);
console.log(`empreinte ${empreinte}`);
