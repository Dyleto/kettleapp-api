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

Il vérifie aussi la voix : **Kettle tutoie tout le monde**, coach compris, et
un message d'erreur de l'API s'affiche comme n'importe quel autre texte. Le
script refuse « vous », « votre », « vos », « veuillez » et tout verbe en
« -ez » hors commentaires — sept messages vouvoyaient encore quand le front a
tranché, tous sur des chemins d'échec que personne ne relit. `src/scripts` en
est exempté : ces scripts parlent à la personne qui les lance.

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

`src/routes.test.ts` le vérifie plutôt que de l'espérer : il parcourt la
pile des vrais routeurs et refuse qu'une route lisant un corps ou un paramètre
n'embarque pas `validateRequest`. Quatre y échappaient — `/auth/google-onetap`
qui passait un jeton Google non validé à `google-auth-library`,
`/client/health-consent` qui est l'écriture la plus sensible juridiquement de
l'application, `/auth/verify-invite-token`, et `/coach/generate-invitation`,
dont le `req.body.expiresIn || 7` laissait demander un lien de rattachement
valide deux siècles.

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

`npm test` (Vitest) éprouve tout ce qui tourne sans base de données : ce qui
arrête le démarrage, la couverture des routes par les schémas, ce que la fin
d'une séance laisse passer, ce que décide `applySessionResults` — le réalisé
des séries, les tours bouclés, le résultat d'une échelle ou d'un chipper — et,
sur des applications Express nues montées avec supertest, le gestionnaire
d'erreurs, les gardes, la validation, les plafonds et le contrat de sortie.
266 tests.

Il remplace huit scripts `verify:*`, qui portaient chacun sa copie d'un
`ok(label, condition)`. Les trois premiers convertis lui ont valu deux défauts
trouvés dans l'heure. Un paramètre par défaut sur `devRoutesEnabled` rendait
le cas « NODE_ENV absent » inexprimable : passer `undefined` relisait
`process.env`, et l'assertion ne passait que parce que ts-node n'avait pas la
variable. Et `/dev-login` n'avait aucun schéma, invisible au script puisque la
route n'était pas montée sous son ts-node — alors que Vitest pose
`NODE_ENV=test`. Les cinq suivants ont rendu une assertion creuse : la fusion
de la chaîne de requête restait verte une fois supprimée, parce que la route
d'essai ne façonnait rien — la valeur validée et la brute étaient les mêmes.

`src/contract/contract.test.ts` éprouve de vrais documents Mongoose et non des
objets ordinaires : c'est la seule façon de voir les chemins imbriqués vides,
qui n'existent que sur un document.

Une agrégation ne se teste pas sans base, mais ce qu'elle décidait si : un
service fait tourner la requête, une fonction pure met en forme ce qui en
revient. `roster.service` en est l'exemple — lire le lien de rattachement de
CE coach, rendre absent un ressenti que `$first` rend `null` (et que le
contrat refusait, ce qui faisait répondre 500 à toute la liste).

Ce qui entoure une règle — qui a le droit, ce qui est marqué, ce qui est
enregistré — se teste aussi sans base : les lectures sont remplacées par ce
qu'elles rendraient, `save` par un espion (`reply.service.test.ts`). Le
piège est connu : une lecture remplacée ne regarde pas ce qu'on lui demande.
Retirer le coach du filtre qui cherche le lien entre lui et le client
laissait tout vert, jusqu'à ce qu'une assertion porte sur la requête
elle-même. Un filtre qui autorise s'éprouve par ce qu'il demande.

`verify:copy` exige `mongodb-memory-server`, qui télécharge un binaire
MongoDB : il n'est pas branché à la CI, et il ne peut pas l'être. À lancer
depuis une machine en réseau avant un déploiement. C'est le dernier script
`verify:*`, hormis `verify:production` qui charge le build.

## Les migrations

`migrate:ladder` fusionne « Pyramide » dans « Échelle » : les deux n'étaient
qu'un format sous deux noms — trois différences, toutes cosmétiques — et
`pyramid` disparaît de l'énumération.

L'ordre de déploiement n'est pas négociable, et c'est tout l'intérêt d'un
script plutôt que d'une conversion au premier enregistrement :

1. `npm run migrate:ladder` sur la base de production — à blanc par défaut,
   `--apply` engage ;
2. puis seulement la version qui ne connaît plus `pyramid`.

Dans l'autre ordre, un programme resté en `pyramid` ne passe plus le contrat
de sortie et fait répondre 500 à tout l'écran du client. Le projet avait
converti `every` vers `emom` au premier enregistrement, mais là l'ancienne
valeur restait valide ; ici elle cesse de l'être.

Le script migre aussi l'historique. `CompletedSession.blocks[].type` est une
chaîne libre et y survivrait, mais le front retomberait sur la valeur brute et
afficherait « pyramid » à un francophone. Ce n'est pas rétro-remplir : rien
n'est deviné, c'est un format renommé, et ce que le client a fait — le schéma,
les charges, les tours — n'est pas touché.

Il se vérifie lui-même : il recompte après avoir écrit et sort en erreur s'il
reste quoi que ce soit. Comme `verify:copy`, il demande une vraie base et ne
peut pas tourner en CI.

## Ce que ce dépôt ne fait pas

Il n'envoie pas d'e-mail. `src/emails/` a porté deux gabarits React Email —
`ClientJoined` et `ProgramUpdated` — que rien n'importait, et quatre
dépendances de production avec eux : `resend`, les deux `@react-email` et
`react`. Les gabarits sont dans l'historique si la fonctionnalité revient
(`git log -- src/emails`), mais l'arbre de production ne porte plus un
framework d'interface pour du code que le serveur n'exécute jamais.

## Ce qui garde le projet

La CI (`.github/workflows/ci.yml`) lance à chaque poussée : `typecheck`,
`lint`, `lint:langue`, `format:check`, `build`, `contract:check`, les tests
et le build de production. Rien ne doit être fusionné sur une
CI rouge.
