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
limitent, par compte et heure civile, cinq soumissions, trente changements de vote
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

## Validation et travail restant pour #69

Les tests du service couvrent propriété, séparation des DTO, revue indépendante,
révocation/réédition, corbeille/restauration/suppression, seuils persistés,
signalements, recherche littérale, pagination et classement. Des processus SQLite
indépendants exercent les votes dupliqués et une révocation concurrente.

Les essais HTTP utilisent Better Auth, un véritable client oRPC, un appareil
appairé, un upload GLB et le stockage filesystem. Ils vérifient consentement,
autorisations, fichier réservé à la revue, catalogue après approbation, votes
parallèles, absence des champs privés, panne de stockage et révocation pendant
l’ouverture du flux. La couverture de `discovery.ts` est de 100 % lignes/fonctions.

Le raccordement des pages `/explorer` et `/classement`, le contrôle de publication
propriétaire, l’interface de modération et leurs interactions restent à terminer
avant de fermer #69. Les démonstrations restent distinctes des captures réelles.
