# Kettle API — conventions du projet

## La règle de langue

Elle est fixe et ne se discute pas au cas par cas.

| Ce dont il s'agit | Langue |
|---|---|
| Tout ce qui est technique — identifiants, types, noms de fichiers, de dossiers, de branches, de scripts npm | **anglais** |
| **Tous** les commentaires, y compris les blocs de documentation en tête de fichier | **français** |
| Tout texte qui remonte au client — messages d'erreur d'API, libellés d'e-mails | **français** |

Pourquoi cette répartition : le code s'écrit dans la langue de son écosystème,
les commentaires dans celle de l'équipe qui les lit, et ce qui remonte à
l'utilisateur dans celle des personnes qui s'en servent. Kettle s'adresse à des
francophones.

Un message d'erreur renvoyé par l'API finit sous les yeux d'un coach ou d'un
client : il est en français. Un nom de champ dans un JSON est technique : il
est en anglais.

`npm run lint:langue` vérifie les deux plutôt que de les surveiller, et la CI
l'appelle. Pour les commentaires, une liste de mots anglais ne suffit pas —
elle est incomplète par construction : le script signale aussi tout bloc de
quatre mots de prose sans aucune marque de français, parce que c'est le
français qu'on exige. Pour les identifiants, c'est une liste de mots français,
plus une règle sans exception — un identifiant ne porte jamais d'accent.

Il est arrivé ici après le front, qui avait annoncé la règle tenue quatre fois
sans l'être. Ce dépôt ne s'en tirait pas mieux : soixante identifiants
français, dont une constante de contrôleur.

## Les commentaires

Chaque fonction, contrôleur, service et middleware exporté porte un commentaire
qui dit **pourquoi**, pas ce que le code fait déjà lire. Un nom bien choisi dit
le quoi ; le commentaire sert à ce que le code ne peut pas dire : la contrainte
qui a imposé cette forme, le défaut que cela répare, le piège qui attend celui
qui voudra simplifier.

Ce qui vaut d'être écrit :

- ce qu'on a essayé avant et pourquoi ça ne marchait pas ;
- une mesure plutôt qu'une impression ;
- la raison d'un choix qui paraîtra arbitraire dans six mois ;
- un défaut qu'on a corrigé, pour que personne ne le réintroduise.

Ce qui ne vaut pas la peine : paraphraser la ligne suivante.

## Les couches

Un contrôleur lit la requête, appelle un service, répond. Il ne porte pas de
logique métier, pas de transaction, pas de réconciliation. Ce qui décide vit
dans un service, qui ne connaît ni `req` ni `res` et se teste sans serveur.

La validation façonne la requête : `validate` écrit dans `req` la valeur
validée, donc un contrôleur qui lit `req.body` lit quelque chose qui a
correspondu à un schéma. Ne jamais revenir en arrière là-dessus — c'est ce qui
ferme le mass assignment.

Le contexte d'une requête se lit avec `coachOf(res)` / `clientOf(res)`, jamais
avec une assertion de type : un garde oublié doit donner un 403, pas un
TypeError.

## Le contrat de sortie

Rien ne quitte l'API sans passer par un schéma de `src/contract/`. Un
contrôleur ne répond pas avec `res.json(...)` mais avec
`respond(res, status, schema, data)` : Zod ne garde que les clés déclarées,
donc ce qui n'est pas au contrat ne sort pas.

Ce n'est pas une vérification mais un filtre. Avant lui, `res.json(history)`
envoyait des documents Mongoose entiers — `clientId`, `programId`, `__v`, les
dates internes — que personne ne lisait. Ne pas revenir là-dessus : un champ
qui doit sortir s'ajoute au schéma, jamais à côté.

Un écart donne un 500, pas une réponse tronquée : une réponse à laquelle il
manque un champ est un défaut du serveur, et le client n'a aucun moyen de le
savoir.

Les types se dérivent des schémas (`z.infer`), et c'est de là que viennent
ceux du front. Deux descriptions de la même charge utile divergent toujours.

Attention aux chemins imbriqués de Mongoose — un objet littéral dans un
schéma, sans `new Schema`. Sur un document hydraté ils ne sont jamais
absents : Mongoose les rend comme des objets dont les clés valent
`undefined`. `vacant()` les ramène à `undefined` ; sans lui, `metrics` et
`customMetric` faisaient répondre 500 à tout l'historique.

## La discipline de vérification

Un vert ne vaut que si on l'a cassé. Pour chaque mécanisme vérifié, on le
sabote dans le code et on s'assure que l'assertion qui le couvre tombe — et
elle seule.

Un script de sabotage doit vérifier qu'il a bien saboté quelque chose.

## Les vérifications

`npm run verify` lance tout ce qui tourne sans base de données : le
gestionnaire d'erreurs, les gardes, la validation, les plafonds, le contrat
de sortie. La CI l'appelle.

`verify:contract` éprouve de vrais documents Mongoose et non des objets
ordinaires : c'est la seule façon de voir les chemins imbriqués vides, qui
n'existent que sur un document.

`verify:copy` et `verify:rounds` exigent `mongodb-memory-server`, qui
télécharge un binaire MongoDB : ils ne sont pas branchés à la CI et n'ont
jamais tourné. À lancer depuis une machine en réseau avant un déploiement.

## Ce qui garde le projet

La CI (`.github/workflows/ci.yml`) lance à chaque poussée : `typecheck`,
`lint`, `format:check`, `build` et `verify`. Rien ne doit être fusionné sur une
CI rouge.
