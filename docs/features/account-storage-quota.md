# Quota de stockage par compte

L’API borne les octets de GLB alloués à un compte. Le plafond par défaut est
**2 Gio**, soit 2 147 483 648 octets. `ACCOUNT_STORAGE_BYTES` permet de le changer
au démarrage ; la valeur doit être un entier positif, représentable exactement
en JavaScript. Une valeur invalide arrête l’API avant l’ouverture de SQLite.
Ce plafond technique ne définit pas une offre commerciale ni un abonnement.

Le total additionne, pour un même propriétaire :

- les captures finalisées, y compris celles dans la corbeille ;
- les tailles déclarées des sessions reprenables non terminées, même expirées
  tant que leur nettoyage n’a pas réussi ;
- les octets des uploads legacy en cours ou abandonnés ;
- les objets dont la suppression physique reste en attente.

Tous les appareils appairés au compte partagent ce total. Les autres comptes
gardent leur propre budget. Les reçus de sessions déjà terminées ne sont pas
comptés une seconde fois. La limite porte sur les GLB ; les métadonnées SQLite,
les miniatures et le surcoût du stockage multipart ne sont pas des octets GLB.
Le quota temporaire global de staging reste indépendant.

## Réservation et publication

Les deux endpoints refusent une allocation supplémentaire qui dépasserait le
plafond avec HTTP 413 et `{"error":"storage_quota_exceeded"}`. Atteindre
exactement le plafond reste autorisé. Les plafonds par fichier ne changent pas :
100 MiB legacy, 200 MiB reprenable et morceaux de 4 MiB.

Une initialisation reprenable vérifie le budget avant création du staging, puis
le revérifie dans une transaction SQLite `IMMEDIATE` au moment de l’inscription
de la session. Cette seconde vérification couvre un upload legacy arrivé pendant
l’attente des opérations disque. Un refus à ce stade retire le fichier temporaire.
Le rejeu de la même initialisation restitue son reçu sans nouvelle allocation.

Une finalisation convertit la réservation en capture dans une seule transaction.
Son rejeu n’ajoute pas d’octets. Une réservation historique qui porterait déjà
le compte au-dessus du plafond ne peut pas être finalisée avant libération
d’espace ; les captures existantes restent accessibles. Le changement de plafond
n’entraîne aucune suppression automatique supplémentaire.

Le legacy inscrit, avant tout envoi au stockage, une intention de nettoyage avec
la clé, le propriétaire et le nombre d’octets dans `object_deletions`. Cette
inscription et le contrôle de quota sont transactionnels : deux uploads
simultanés ne peuvent pas réserver le même espace disponible. La file ignore
cette intention tant que l’upload est actif dans le processus courant.
La publication du souvenir et le retrait de l’intention forment une autre
transaction atomique. Un crash avant publication conserve donc une clé connue,
ses octets réservés et un nettoyage à reprendre.

Après échec, le legacy libère sa protection en mémoire et tente le nettoyage de
l’objet et des parts multipart abandonnées. Une panne conserve l’intention,
son quota et ses retries. Un nouveau processus reprend la file ; elle relit
chaque job avant effacement pour qu’un ancien batch ne puisse pas supprimer
un upload qui vient d’être publié.

## Libérer de l’espace et migrer

Mettre une capture à la corbeille ou la restaurer ne modifie pas le total.
La suppression définitive ou la purge transfère ses octets vers la file de
suppression dans la transaction qui retire ses métadonnées. L’espace redevient
disponible après effacement physique et acquittement SQLite. Pendant une panne
S3, ce délai empêche de contourner le quota par une succession de suppressions
et d’uploads. L’annulation ou l’expiration d’une session reprenable suit le
même principe : sa réservation reste présente jusqu’au nettoyage réussi.

La migration ajoute `user_id`, `size` et `discard_upload` aux jobs existants,
sans réinitialiser leurs échéances ou leurs tentatives. Les anciens jobs dont
la taille et le propriétaire ont déjà été oubliés restent à nettoyer, mais
ne peuvent pas être attribués rétrospectivement au total sans réconciliation.
Les objets historiques sans métadonnées et les anciennes versions d’un bucket
versionné restent également hors de cet inventaire. Ces suites restent dans
`docs/AI/TASKS.md` ; aucun scan ou effacement d’objets de production n’est effectué.

Le déploiement cible un seul processus API, comme les sessions reprenables.
Conserver SQLite et le staging sur leurs volumes persistants, et autoriser les
opérations multipart nécessaires au nettoyage. Le client reçoit actuellement
le code d’erreur HTTP ; l’affichage du total utilisé/disponible et d’un message
de quota spécifique dans le mod et la galerie reste une tâche distincte.
La capture locale est conservée après refus d’upload.

## Vérifications

- Tests de frontières, isolation entre propriétaires/appareils, addition des
  réservations et de la corbeille, valeurs numériques invalides, migration et rejeu.
- Requêtes concurrentes legacy/legacy et legacy/reprenable : une seule allocation
  à la frontière, absence de staging refusé, aucun double comptage à la publication.
- Suppression, purge et expiration avec panne de nettoyage : conservation des
  octets jusqu’à l’acquittement ; reprise après réouverture SQLite.
- Test Garage réel : un processus est interrompu juste avant l’inscription d’un
  souvenir, après un upload legacy multipart de 9 MiB. Le GLB stocké est comparé
  octet pour octet, la fixture est arrêtée, le nettoyage échoue dans un nouveau
  processus, puis réussit après redémarrage de Garage dans un autre processus.
- `bun run build` incluant `bun check` : 82 tests API passent, 57 tests web passent,
  Gradle et JAR distribué construits. Le quota et la file sont couverts à 100 %
  des lignes et fonctions. `bun run api:garage` passe ses huit scénarios réels.

Aucun changement de format GLB ni de comportement du client Minecraft.
