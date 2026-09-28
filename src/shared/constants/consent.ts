/**
 * Version du texte de consentement aux données de santé.
 *
 * Le ressenti de fin de séance — douleur, maladie, sommeil, stress — est une
 * donnée de santé au sens de l'article 9 du RGPD. On ne peut la collecter que
 * sur un consentement explicite, et il faut pouvoir montrer à quoi la personne
 * a consenti.
 *
 * D'où cette version, enregistrée avec chaque décision : si le texte change,
 * on incrémente et tout le monde est redemandé. Les décisions déjà prises
 * restent lisibles, rattachées au texte qui les a obtenues.
 *
 * Format : année-mois de la rédaction.
 */
export const HEALTH_CONSENT_VERSION = '2026-09';
