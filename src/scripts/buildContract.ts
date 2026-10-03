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

const OUTPUT = join(__dirname, '..', '..', 'contract', 'kettle-contract.ts');

/**
 * Les types publiés, et dans quel ordre.
 *
 * Nommés un par un plutôt que balayés : ce qui est publié est une décision.
 * Un type ajouté au contrat n'arrive pas chez le front parce qu'il existe,
 * mais parce que quelqu'un l'a inscrit ici.
 */
const PUBLISHED = [
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
      'BlockTypePayload',
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
const writeType = (checker: ts.TypeChecker, symbol: ts.Symbol): string => {
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  return checker.typeToString(
    type,
    undefined,
    ts.TypeFormatFlags.NoTruncation |
      ts.TypeFormatFlags.InTypeAlias |
      ts.TypeFormatFlags.UseFullyQualifiedType
  );
};

const root = join(__dirname, '..', 'contract');
const program = ts.createProgram(
  PUBLISHED.map(([file]) => join(root, `${file}.ts`)),
  {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
    skipLibCheck: true,
  }
);
const checker = program.getTypeChecker();

const chunks: string[] = [];
let missingKeys = 0;

for (const [file, names] of PUBLISHED) {
  const source = program.getSourceFile(join(root, `${file}.ts`));
  if (!source) {
    console.error(`introuvable : ${file}.ts`);
    missingKeys++;
    continue;
  }
  const exported = checker.getExportsOfModule(
    checker.getSymbolAtLocation(source)!
  );
  for (const name of names) {
    const symbol = exported.find((s) => s.getName() === name);
    if (!symbol) {
      console.error(`type absent du contrat : ${name} (${file}.ts)`);
      missingKeys++;
      continue;
    }
    const doc = ts.displayPartsToString(
      symbol.getDocumentationComment(checker)
    );
    chunks.push(
      (doc
        ? `/**\n${doc
            .split('\n')
            .map((l) => ` * ${l}`.trimEnd())
            .join('\n')}\n */\n`
        : '') + `export type ${name} = ${writeType(checker, symbol)};`
    );
  }
}

if (missingKeys > 0) {
  console.error(`\n${missingKeys} type(s) manquant(s) : rien n'est écrit.`);
  process.exit(1);
}

const body = chunks.join('\n\n');
const fingerprint = createHash('sha256')
  .update(body)
  .digest('hex')
  .slice(0, 12);

const header = `/**
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
 * Empreinte : ${fingerprint}
 */

`;

const file = header + body + '\n';

mkdirSync(join(__dirname, '..', '..', 'contract'), { recursive: true });

// Passé par le formateur avant d'être écrit : un type profond s'imprime sur
// une seule ligne, et le front le versionne — il doit se relire.
const formatType = (source: string): string => {
  const draft = join(__dirname, '..', '..', 'contract', '.brouillon.ts');
  writeFileSync(draft, source, 'utf8');
  execFileSync('npx', ['prettier', '--write', draft], { stdio: 'ignore' });
  const output = readFileSync(draft, 'utf8');
  execFileSync('rm', ['-f', draft]);
  return output;
};

const expected = formatType(file);

if (process.argv.includes('--check')) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
  if (current === expected) {
    console.log(
      `contract/kettle-contract.ts est à jour (empreinte ${fingerprint})`
    );
    process.exit(0);
  }
  console.error(
    current
      ? `contract/kettle-contract.ts est périmé : les schémas donnent ${fingerprint}.`
      : 'contract/kettle-contract.ts est absent.'
  );
  console.error(
    'Relancer `npm run contract:build`, puis reporter le fichier au front.'
  );
  process.exit(1);
}

writeFileSync(OUTPUT, expected, 'utf8');
console.log(`${chunks.length} types publiés dans contract/kettle-contract.ts`);
console.log(`empreinte ${fingerprint}`);
