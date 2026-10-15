# Galerie publique et classement

## Contrat et publication

Les procédures `discovery` du contrat partagé distinguent catalogue public,
publication propriétaire et modération. Les souvenirs restent privés à l’upload.
Un propriétaire soumet explicitement un titre, une description, une catégorie,
une miniature éventuelle et `consent: true`. Le candidat est `pending` ; il reste
absent du catalogue et son GLB n’est consultable que par un modérateur.

Un autre modérateur peut l’approuver ou le refuser avec un motif. Toute nouvelle
soumission reçoit un nouvel UUID et repasse en attente : elle ne conserve ni
approbation ni votes. La révocation retire le catalogue et le fichier public ;
la mise à la corbeille fait la même chose dans la transaction SQLite, y compris
si un autre chemin du serveur modifie la mémoire. Restaurer depuis la corbeille
ne republie jamais automatiquement. La suppression définitive cascade les votes,
les signalements et la publication.

Le DTO public ne contient que les champs choisis, l’UUID de publication, sa date
et les votes. Il ne reprend ni adresse de serveur, seed, coordonnées, propriétaire,
UUID privé, clé de stockage ou métadonnées privées. Le GLB lui-même devient public
après approbation ; ses textures et contenus capturés doivent donc faire partie
du consentement présenté au propriétaire. Le partage privé par lien est séparé.

## Modération et protections

`PUBLIC_MODERATOR_IDS` contient les identifiants Better Auth des modérateurs,
séparés par virgules, configurés par l’opérateur avant démarrage. Vide par défaut,
il n’accorde de rôle à personne : les soumissions restent en attente. Un compte ne
peut pas approuver sa propre publication. Aucun client ne peut s’attribuer ce rôle.
Les files `pending`, `approved`, `rejected` et `reported` sont réservées à ces rôles.
Les signalements ne rendent pas automatiquement un souvenir invisible ; un
modérateur examine le GLB et décide. Les vingt derniers motifs sont affichés par
candidat et les signalements sont effacés après sa décision.

Les votes et signalements nécessitent une session réelle. Une clé primaire
publication/compte impose un seul vote, et voter pour son propre souvenir est
refusé. L’état désiré `voted` rend les retries idempotents. Les compteurs SQLite
limitent, par compte et tranche fixe d’une heure UTC, cinq soumissions, trente changements de vote
et dix signalements. Ils survivent au redémarrage ; les vieux compteurs sont
nettoyés par lots bornés. Cela limite les rafales et doublons par compte, sans
prétendre identifier les personnes derrière plusieurs comptes.

Le catalogue recherche littéralement titre/description, filtre par catégorie et
trie par récence ou nombre de votes, avec pagination de 24 résultats. Les requêtes
SQL utilisent des paramètres. Les réponses et GLB utilisent `private, no-store` ;
les fichiers ajoutent `nosniff`. Le serveur recontrôle la publication après
l’ouverture asynchrone du stockage, avant d’envoyer la réponse : une révocation
commise pendant cette attente l’emporte. Un fichier déjà reçu par un visiteur
ne peut pas être retiré de sa machine.

## Validation

Les tests du service couvrent propriété, séparation des DTO, revue indépendante,
révocation/réédition, corbeille/restauration/suppression, seuils persistés,
signalements, recherche littérale, pagination et classement. Des processus SQLite
indépendants exercent les votes dupliqués et une révocation concurrente.

Les essais HTTP utilisent Better Auth, un véritable client oRPC, un appareil
appairé, un upload GLB et le stockage filesystem. Ils vérifient consentement,
autorisations, fichier réservé à la revue, catalogue après approbation, votes
parallèles, absence des champs privés, panne de stockage et révocation pendant
l’ouverture du flux. La couverture de `discovery.ts` est de 100 % lignes/fonctions.

## Interfaces et preuve locale

`/explorer` et `/classement` affichent le catalogue réel, ses filtres et ses votes
serveur. Le choix « Essayer la démonstration » ouvre `?demo=1` : favoris, votes et
partages de ces exemples restent distincts et ne publient aucune capture privée.
La carte d’une capture privée propose « Publication publique », avec titre,
description, catégorie, consentement décoché et retrait. Les états et motifs
proviennent de l’API. Le rôle modérateur donne accès au lien **Modération**, aux
files et à la revue du GLB via `/public/:id?review=1` ; le serveur contrôle ce mode,
le paramètre URL ne confère aucun rôle.

Les motifs de signalement et de décision sont saisis dans la page. Les tests
couvrent filtres/pagination, vote sans doublon inventé localement, signalement,
refus/retry, consentement obligatoire, retrait, rôle et décisions, chargement
public et revue, refus de revue et lien privé existant. Les routes dynamiques
`/public/` et `/moderation` utilisent le fallback SPA dans Vite preview/Nginx,
restent `noindex` et sont exclues des robots/sitemap.

Le 15 octobre 2026, une API/filesystem et un site isolés ont exercé dans le
navigateur : connexion propriétaire, soumission du souvenir privé avec consentement,
connexion d’un autre compte modérateur, approbation, apparition dans le catalogue,
vote, signalement, examen du motif, refus et retrait explicite par le propriétaire.
La recherche serveur et les champs/actions sur fond sombre sont inspectés.
Les comptes, clés de stockage et GLB sont des fixtures locales, sans production.

Le navigateur intégré disponible désactive WebGL : la construction du renderer
échoue avant lecture du fichier. Le rendu Three.js n’est donc pas prétendu validé
visuellement dans cet environnement. Les tests vérifient le branchement du viewer
et le GLB téléchargé anonymement depuis la route publique est identique au fichier
Minecraft original (63 096 octets, SHA-256
`dd4cc0ca5112be59255ccf7d7080ab046bbad10bf8212438f0c2e0738fbcaa51`).
Son import/rendu dans Blender 5.2.2 est inspecté : tour et terrain texturés,
1 mesh, 12 images, dimensions 5 × 5 × 11. Le renderer et le format GLB existants
ne sont pas modifiés par cette fonctionnalité.

Artefacts hors Git :
`~/.local/state/minemories-validation/public-discovery-20261015/` (API/SQLite
isolées, captures de soumission/catalogue/modération/retrait, GLB téléchargé,
checksum et rendu/log Blender). `bun check` et `bun run build` passent ; la CI
vérifie également le cycle Garage réel avant fusion.
