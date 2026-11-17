/**
 * Les réactions qu'un coach peut poser sur une séance faite.
 *
 * Des clés et non les émojis eux-mêmes : 👏 💪 🔥 sont un choix d'affichage,
 * qui vit côté front et peut changer sans toucher aux réponses déjà
 * envoyées. Trois, comme la maquette — une réaction se pose d'une touche
 * depuis le fil, et un choix plus large demanderait d'ouvrir quelque chose.
 */
export const REACTIONS = ['clap', 'strong', 'fire'] as const;

/** Dérivé de la liste, jamais l'inverse — voir `FeedbackTag`. */
export type Reaction = (typeof REACTIONS)[number];

/** Le même plafond que le mot du client : une réponse n'est pas une lettre. */
export const REPLY_TEXT_MAX = 2000;
