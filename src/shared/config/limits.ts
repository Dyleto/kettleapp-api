/**
 * La taille qu'un corps de requête peut atteindre.
 *
 * `express.json()` applique un défaut de 100 Ko : la limite existait, elle
 * était seulement implicite — et trop basse pour la seule requête qui peut
 * légitimement grossir, l'atelier envoyant le programme entier à chaque
 * enregistrement. Mesuré, cinq séances de neuf blocs et dix-huit exercices
 * pèsent 5,4 Ko ; un programme vingt fois plus chargé atteint donc 107 Ko.
 * 256 Ko laisse une quarantaine de fois le programme d'essai et refuse
 * toujours un corps arbitraire.
 *
 * Une constante et non une valeur écrite dans `index.ts` : le test des
 * plafonds éprouvait sa propre copie, si bien que changer celle de
 * l'application ne faisait rien tomber.
 */
export const BODY_LIMIT = '256kb';
