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
peuvent être complétés après revue de l’inventaire avec la
[réconciliation du stockage](storage-reconciliation.md), quand leur attribution
et leur taille exacte sont récupérables.
Les objets historiques sans métadonnées et les anciennes versions d’un bucket
versionné restent également hors de cet inventaire. Ces suites restent dans
`docs/AI/TASKS.md` ; aucun scan ou effacement d’objets de production n’est effectué.

Le déploiement cible un seul processus API, comme les sessions reprenables.
Conserver SQLite et le staging sur leurs volumes persistants, et autoriser les
opérations multipart nécessaires au nettoyage. La galerie affiche ces informations.
Le client Minecraft affiche aussi l’espace et un message de quota spécifique.
La lisibilité des modes simple/avancé et du détail a été confirmée en jeu.
La capture locale est conservée après refus d’upload.

## Consulter l’espace

Le contrat oRPC fournit `account.storage()` pour une session web authentifiée.
`GET /api/mod/status` fournit le même objet `storage` avec un token de device
valide. Le propriétaire est déduit de la session ou du token ; aucune entrée
ne permet de choisir un autre compte. Les réponses portent
`Cache-Control: private, no-store` ; ce header est aussi appliqué aux autres
réponses RPC privées.

| Champ | Signification, en octets |
| --- | --- |
| `usedBytes` | Total de captures, corbeille, uploads réservés et suppressions en attente. |
| `limitBytes` | Plafond configuré sur cette API. |
| `availableBytes` | Espace réservable, jamais inférieur à zéro, même pour un compte historique au-dessus du plafond. |
| `reservedBytes` | Sessions reprenables incomplètes et intentions legacy non publiées, y compris leur nettoyage après échec. |
| `pendingDeletionBytes` | Captures définitivement supprimées ou purgées dont l’objet attend encore l’effacement. |

Le résumé est calculé dans une seule requête SQLite, sans lire les GLB ni
interroger le bucket. Un index par propriétaire accompagne la file de nettoyage.
Les anciens jobs sans taille/propriétaire restent hors du résumé, comme du quota.

La galerie rafraîchit le résumé avec ses captures toutes les douze secondes et
après ses actions. Elle indique l’espace disponible, la suppression définitive
nécessaire pour libérer la corbeille, les réservations et les effacements encore
en cours. Un quota plein rappelle que l’upload refusé conserve le GLB local.
Lorsqu’un rafraîchissement échoue, les chiffres précédents sont retirés et un
message d’indisponibilité est affiché ; les captures restent accessibles.
Une ancienne réponse lente, réussie ou en erreur, ne remplace pas un résumé plus
récent. Une fermeture de la page invalide les réponses encore attendues.

## Dans Minecraft

Le mode simple affiche un bouton `Libre : … / …` après connexion du compte.
Il ouvre le détail du stockage ; le mode avancé propose `Stockage galerie`,
à côté des réglages AFK. Le détail présente l’espace libre, le total utilisé,
les envois réservés et les effacements encore en attente, avec les actions
de libération dans la galerie. Les unités affichées (Ko, Mo, Go…) sont décimales.
Le plafond vient de l’API configurée, y compris une API personnelle.

Le statut est demandé en arrière-plan toutes les douze secondes tant que le menu
est ouvert, puis après un envoi ou un changement de réglages. Aucun statut n’est
demandé sans token. La fermeture, le changement de mode ou de compte invalident
les anciennes réponses ; une erreur retire les anciens chiffres. Une ancienne
API sans champ `storage` reste utilisable pour capturer et envoyer, avec une
indication d’espace indisponible. Un token refusé demande de reconnecter le compte.

Un HTTP 413 identifié par `storage_quota_exceeded` affiche l’espace insuffisant,
la conservation du GLB local et la suppression définitive nécessaire dans la
corbeille, puis `/minemories upload` pour réessayer. Ce refus n’est pas retenté
automatiquement et conserve l’identifiant de session local pour une reprise.
Un autre HTTP 413 conserve son message HTTP générique. Les réponses JSON de
statut, d’appairage et d’upload sont limitées à 16 KiB d’octets reçus, même sans
Content-Length ; les corps d’envoi GLB et leurs limites restent inchangés.

Cette interface est construite et testée automatiquement. Le 11 octobre 2026,
le testeur a confirmé que les deux modes et les détails sont lisibles dans le
client de développement isolé. Le premier refus sur la fixture pleine a conservé
le GLB et son fichier de reprise dans le dossier local ; la reprise vers l’API
locale réelle a ensuite abouti.

La première fixture locale simulait une galerie pleine sans recevoir de GLB.
Elle a été remplacée par l’API du dépôt, avec SQLite et stockage filesystem dans
le dossier de test isolé, un compte dédié et un quota de **200 Mo**
(200 000 000 octets). La connexion du client de test reste utilisable. Une capture
de 13 628 224 octets envoyée depuis Minecraft a été finalisée ; le téléchargement
avec une session web authentifiée restitue les mêmes octets que le GLB local.
Le résumé annonce 186 371 776 octets disponibles, sans réservation ni suppression
en attente. Ce test local ne valide pas un déploiement en production ou le JAR
distribué installé dans un profil joueur.

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
- `bun run build` incluant `bun check` : 93 tests API passent, 64 tests web passent,
  Gradle et JAR distribué construits. Le quota et la file sont couverts à 100 %
  des lignes et fonctions. `bun run api:garage` passe ses huit scénarios réels.
- Sessions HTTP/oRPC réelles : accès anonyme refusé, isolation entre comptes,
  résumé identique côté device, headers privés et sans cache. Contrat testé sur
  les quantités invalides ; interactions galerie couvrant chargement, quota plein,
  rafraîchissement, panne et réponses tardives.

- Mod : treize nouveaux tests, dont des requêtes HTTP réelles authentifiées,
  limite exacte/multioctets, API ancienne et connexion refusée, quantités invalides,
  réponses tardives et application sur le thread du client. Un refus de quota
  vérifie une seule tentative, les octets locaux inchangés, le fichier de reprise
  sans token et le rejeu du même identifiant après libération d’espace.

Aucun changement de format GLB.
