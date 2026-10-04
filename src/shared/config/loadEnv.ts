import dotenv from 'dotenv';

/**
 * Charger `.env` avant que quoi que ce soit ne lise l'environnement.
 *
 * Un module à effet de bord, importé en premier, et ce n'est pas une
 * coquetterie : `dotenv.config()` vivait au milieu de `index.ts`, après
 * l'import des routes. En CommonJS, TypeScript place les `require` là où
 * l'import est écrit, donc `auth.routes` était chargé — et son
 * `if (process.env.NODE_ENV !== 'production')` évalué — avant que `.env`
 * n'ait été lu. En développement, `NODE_ENV` vivant dans `.env`, le garde
 * jugeait sur une variable encore absente.
 *
 * Isolé ici, l'ordre est dit par la position de l'import et non par la
 * position d'un appel au milieu du fichier. Et cela survivra au passage en
 * ESM, où les imports sont hissés et où l'ancienne forme ne marcherait plus
 * du tout.
 */
dotenv.config();
