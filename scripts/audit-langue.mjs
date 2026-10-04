/**
 * La règle de langue, vérifiée plutôt que surveillée.
 *
 * Deux choses : les commentaires sont en français, les identifiants en
 * anglais. Le script est le frère de celui du front, et il est arrivé ici
 * après lui — le front avait annoncé la règle tenue quatre fois sans l'être,
 * et rien ne disait que ce dépôt s'en tirait mieux. Il ne s'en tirait pas
 * mieux : soixante identifiants français, dont une constante de contrôleur.
 *
 * Pour les commentaires, une liste de mots anglais ne suffit pas — elle est
 * incomplète par construction. Le script signale donc aussi tout bloc de six
 * mots de prose sans aucune marque de français : c'est le français qu'on
 * exige, c'est donc le français qu'on vérifie.
 *
 * Pour les identifiants, c'est une liste de mots français, avec la faiblesse
 * d'une liste ; plus une règle sans exception : un identifiant ne porte
 * jamais d'accent.
 *
 *   node scripts/audit-langue.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Le contrat est engendré par l'autre dépôt : ses commentaires lui
// appartiennent, et les réécrire ici les ferait disparaître à la prochaine
// génération.
const EXCLUDED = ['node_modules', 'dist', 'contract/kettle-contract.ts'];

const COMMENT_BLOCK = /\/\*\*?[\s\S]*?\*\/|(?:^[ \t]*\/\/[^\n]*\n)+/gm;

/**
 * Des mots qui n'existent qu'en anglais.
 *
 * Les verbes courts sont là pour les commentaires d'une ligne, qui sont
 * presque toujours de la forme « Checks … », « Returns … », « Opens … » : ce
 * sont eux qui avaient échappé au seuil.
 */
const ENGLISH =
  /\b(the|and|that|with|which|this|from|when|what|would|never|only|because|instead|its|it's|are|was|were|does|not|but|for|has|have|here|there|they|them|their|your|each|every|same|then|than|into|about|before|after|while|whether|checks?|returns?|uses?|used|needs?|gets?|sets?|makes?|builds?|sends?|reads?|writes?|keeps?|shows?|opens?|closes?|adds?|removes?|fetch(es)?|wraps?|handles?|counts?|counting|carries|carry|says?|saying|value|values|one|two|all|any|also|still|just|per|via|nobody|something|anything|without|or|of|in|to|is|by|as|at|if|we|be|do|an)\b/i;

/**
 * Ce qui ne s'écrit qu'en français.
 *
 * Un accent, un guillemet français, une élision. Pas « on », pas « plus »,
 * pas « son » : ils s'écrivent aussi en anglais, et c'est le premier angle
 * mort qui m'a coûté deux cents blocs.
 */
const FRENCH =
  /[àâäçéèêëîïôöûùüœÀÂÇÉÈÊËÎÏÔÛÙ]|[«»]|\b(le|les|une|des|du|aux|cette|qui|que|pas|pour|dans|avec|sans|donc|mais|toute|elle|leur|ne|est|ces|deux|rien|quand|parce|son|sa|ses|au|ce|il|et|ou|un|la|se)\b|\b[ldqsjnmct]'/i;

/**
 * La seconde règle, et la plus solide : de la prose sans aucune marque de
 * français.
 *
 * `ANGLAIS` est une liste, donc incomplète par construction — quatrième angle
 * mort, trouvé en relisant `ClientsList.tsx`. Le commentaire
 * « "il y a 3 semaines", in a single grammar. » ne contient, citation retirée,
 * aucun mot de la liste : ni « in », ni « a », ni « single », ni « grammar ».
 * Il passait, et le script annonçait la règle tenue.
 *
 * La règle du projet n'est pas « pas d'anglais », c'est « en français ». On
 * vérifie donc le français, qui est ce qu'on exige — et un bloc de prose
 * française porte toujours quelque chose : un accent, un guillemet, une
 * élision, un mot courant.
 *
 * Le seuil de six mots épargne ce qui n'est pas de la prose : une directive,
 * une adresse, un nom de fichier, une commande à copier. S'y ajoutent deux
 * formes qui n'en sont pas davantage : un marqueur de route — « GET
 * /api/client/program » — et un trait de séparation, dont le titre porte
 * souvent un nom de produit.
 */
const MIN_PROSE_WORDS = 4;

/** Ce qui n'est pas de la prose et n'a pas à l'être. */
const TECHNICAL =
  /eslint|ts-(expect|ignore|nocheck)|prettier-ignore|https?:\/\/|^\s*[\w./@-]+\s*$|\b(GET|POST|PUT|PATCH|DELETE)\s+\/|─{3,}|={3,}|\$\{/;

const proseWordCount = (bare) =>
  (
    bare
      .replace(/^[ \t]*(?:\/\*+|\*+\/?|\/\/)/gm, ' ')
      .match(/[A-Za-zÀ-ÿ]{2,}/g) ?? []
  ).length;

/** Ce qui est cité n'est pas de la prose : on le retire avant de juger. */
const withoutQuotes = (block) =>
  block
    .replace(/«[^»]*»/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/(^|[^A-Za-zÀ-ÿ])'[^'\n]{2,}'/g, '$1 ')
    // Une parenthèse courte est un exemple, pas de la prose. Le commentaire
    // « Strips accents from a string (é→e, à→a, ç→c…) » est anglais, et
    // l'accent de son exemple concluait au français — le troisième angle mort,
    // ressorti par la porte des parenthèses. Au-delà de quarante caractères on
    // laisse : c'est une incise, et une incise se rédige.
    .replace(/\([^()]{1,40}\)/g, ' ');

const files = [];
const walk = (path) => {
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    const rel = relative(ROOT, full);
    if (EXCLUDED.some((e) => rel === e || rel.startsWith(e + '/'))) continue;
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx|mjs)$/.test(entry)) files.push(full);
  }
};
for (const root of ['src', 'contract', 'scripts']) walk(join(ROOT, root));

const hits = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const hit of source.matchAll(COMMENT_BLOCK)) {
    const bare = withoutQuotes(hit[0]);
    const suspect =
      (ENGLISH.test(bare) || proseWordCount(bare) >= MIN_PROSE_WORDS) &&
      !TECHNICAL.test(bare);
    if (suspect && !FRENCH.test(bare)) {
      hits.push({
        file: relative(ROOT, file),
        line: source.slice(0, hit.index).split('\n').length,
        excerpt: hit[0].trim().split('\n')[0].slice(0, 80),
      });
    }
  }
}

// ─── Les identifiants ───────────────────────────────────────────────────────

/**
 * Des mots français qui ne sont pas aussi des mots anglais.
 *
 * Pour un identifiant, la règle ne peut pas se renverser comme pour la prose :
 * « est-ce que ce nom a l'air anglais » n'a pas de signal simple, là où « est-ce
 * que cette phrase a l'air française » en a plusieurs. C'est donc une liste,
 * avec la faiblesse d'une liste — elle attrape ce qu'elle connaît. Elle vient
 * du balayage des 1 770 identifiants déclarés du dépôt.
 */
const FRENCH_WORDS =
  /^(ancien|anciennete|annuler|arrivee|attente|aucune|autre|autres|avant|avec|avertir|basculer|bilan|bloc|blocs|bouton|brut|carte|champ|champs|chaque|charge|chargement|charges|chemin|choisir|cle|cles|colonne|colonnes|commencer|commentaire|communes|compteur|confidentialite|consigne|conservation|contenu|copier|couleur|courant|courbe|dans|debut|deja|delai|depuis|dernier|derniere|destinataire|deux|deuxieme|dimanche|dire|douleur|ecart|ecarts|echeance|echec|editeur|empreinte|enregistre|ensuite|entre|envoyer|erreur|etape|etapes|etat|exercice|faire|fait|faites|faits|faux|fermeture|fiche|fige|figee|figer|fois|fondement|gouttiere|grille|hebergeur|hebergeurs|heures|hier|impossible|inchange|indexe|intervalle|introuvable|jeudi|jour|journaux|jours|kilos|lectures|lettre|libelle|libre|lien|ligne|lignes|lire|liste|listes|lundi|maintenant|maladie|mercredi|minuteur|niveau|nom|noms|nouveau|nouvelle|occupe|ouvert|ouvrir|paire|paliers|partage|paysage|perdre|permises|personne|poids|poser|pourquoi|premier|premiere|prescrites|prevues|programme|pyramide|quand|quatre|quitter|quoi|rang|rapport|recherche|recommencer|recu|refus|refuser|relancer|relu|repere|repos|reprendre|reseau|ressenti|restant|restantes|reste|resultat|retour|revenir|rien|saisir|sans|sante|seance|secondes|semaine|serveur|seuil|seules|sous|sportif|structurel|suivant|suivants|suivi|tactile|tentatives|texte|titre|totaux|tours|tuile|tutoie|tutoiement|valeur|veux|vide|vider|vieux|voir|voit|vus)$/;

/**
 * Les exceptions, et chacune a sa raison.
 *
 * Les cinq premières ne sont pas des identifiants : ce sont les clés d'un
 * enregistrement déjà posé dans le `localStorage` des clients, que
 * `sessionProgress` relit pour ne pas faire perdre une séance en cours. Les
 * traduire ne renommerait rien — cela rendrait illisible ce qui est écrit sur
 * leurs téléphones.
 *
 * `dose` et `tonnage` s'écrivent pareil dans les deux langues.
 */
const EXEMPT = new Set(['dose', 'tonnage', 'vacant']);

const DECLARATIONS = [
  /\b(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-zÀ-ÿ_$][\wÀ-ÿ]*)/g,
  // Pas de `\s*` avant les deux-points, et ce n'est pas un détail : la
  // typographie française met une espace devant, donc « Ensuite : {x} » — du
  // texte JSX — passait pour une déclaration de propriété.
  /^[ \t]*([a-zA-ZÀ-ÿ_$][\wÀ-ÿ]*)\??:/gm,
  /\(\s*([a-zà-ÿ][\wÀ-ÿ]*)\s*[,:)]/g,
  /\bconst\s*[[{]([^\]}]*)[\]}]/g,
];

/** Les segments d'un nom : `champRecherche` → `champ`, `recherche`. */
const segments = (name) =>
  (name.match(/[A-Z]+(?![a-z])|[A-Z][a-z]*|[a-z]+/g) ?? []).map((s) =>
    s.toLowerCase()
  );

const names = [];
for (const file of files) {
  const rel = relative(ROOT, file);
  // Ni commentaires ni chaînes : on ne juge que des noms.
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ')
    .replace(/'[^'\n]*'|"[^"\n]*"/g, " '' ");
  const seen = new Set();
  for (const rx of DECLARATIONS) {
    for (const hit of code.matchAll(rx)) {
      for (const raw of hit[1].split(/[,:=\s]+/)) {
        if (!/^[A-Za-zÀ-ÿ_$][\wÀ-ÿ]*$/.test(raw) || seen.has(raw)) continue;
        seen.add(raw);
        if (EXEMPT.has(raw)) continue;
        // Un identifiant ne porte jamais d'accent : règle sans exception.
        const accented = /[àâäçéèêëîïôöûùüœ]/i.test(raw);
        if (accented || segments(raw).some((s) => FRENCH_WORDS.test(s)))
          names.push({ file: rel, name: raw });
      }
    }
  }
}

if (hits.length === 0 && names.length === 0) {
  console.log(
    `${files.length} fichiers : commentaires en français, identifiants en anglais.`
  );
  process.exit(0);
}

for (const { file, line, excerpt } of hits) {
  console.error(`${file}:${line}  ${excerpt}`);
}
if (hits.length > 0) {
  console.error(
    `\n${hits.length} commentaire(s) anglais. La règle du projet les veut en français.`
  );
}
for (const { file, name } of names) console.error(`${file}  ${name}`);
if (names.length > 0) {
  console.error(
    `\n${names.length} identifiant(s) français. La règle du projet les veut en anglais.`
  );
}
process.exit(1);
