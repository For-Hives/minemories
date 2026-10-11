# Upload des captures volumineuses

Le mod utilise un upload séquentiel et reprenable jusqu’à **200 MiB** (209 715 200 octets,
donc aussi un fichier de 200 Mo). Chaque requête contient au maximum **4 MiB**.
L’ancien `POST /api/mod/memories` reste disponible pour les anciens clients, avec sa
limite de 100 MiB. Déployer l’API avant le nouveau mod.

## Utilisation

Après appairage, `/minemories upload` conserve le comportement habituel. L’envoi, le
calcul du SHA-256 et les lectures de fichiers tournent hors du thread du jeu. Un seul
envoi peut tourner à la fois dans le mod ; les snapshots AFK utilisent aussi ce client.

Chaque requête dispose de trois tentatives au maximum, espacées de 1 puis 2 secondes,
pour les erreurs réseau et les statuts 408, 429, 5xx ou `409 upload_busy`. Une erreur
permanente, notamment 401, est immédiatement remontée. Après une interruption durable,
relancer `/minemories upload` reprend au dernier offset confirmé par l’API.

Le fichier `capture.glb.upload.properties`, à côté du GLB, conserve l’identifiant de
session, le SHA-256 et l’identité du destinataire (empreinte de l’API et du token,
sans enregistrer le token lui-même). Il est supprimé après confirmation finale. Un
fichier modifié ou un autre compte/API crée une nouvelle session. Une modification
pendant l’envoi entraîne un échec du checksum ; ne pas réexporter le même fichier
pendant son transfert. Une session expirée peut être recommencée.

## Protocole HTTP

Toutes les routes nécessitent `Authorization: Bearer <deviceToken>` et appartiennent
au **device appairé**, pas seulement à son compte.

| Méthode et route | Contenu / résultat |
| --- | --- |
| `POST /api/mod/uploads` | JSON `{ id: UUID, size, sha256, metadata }`. Création idempotente ou reprise avec `offset`, `chunkSize`, `completed`, `expiresAt`. |
| `GET /api/mod/uploads/:id` | Offset persistant et statut de session. |
| `PUT /api/mod/uploads/:id` | Corps binaire `application/octet-stream`, header `Upload-Offset`. Morceau de 4 MiB, sauf le dernier. |
| `POST /api/mod/uploads/:id/complete` | Vérifie la taille, le conteneur GLB et le SHA-256, puis stocke et publie la capture. Rejouable sans doublon. |
| `DELETE /api/mod/uploads/:id` | Annule une session incomplète ; une capture déjà publiée reste conservée. |

Un morceau rejoué est comparé aux octets déjà écrits. Un contenu différent ou un
saut d’offset est rejeté. L’offset n’est confirmé qu’après écriture et synchronisation
du fichier. Les métadonnées d’une session existante restent celles de sa création.
Le JSON du GLB est limité à 4 MiB et le nombre de chunks GLB à 64 ; le payload BIN
n’est jamais chargé en entier pour sa validation.

## Stockage et déploiement

Les sessions sont persistées dans SQLite (`mod_uploads`) et leurs fichiers temporaires
sous `UPLOADS_PATH`. Sans configuration, ce dossier est placé à côté de la base, dans
`uploads`. **Conserver la base et ce dossier sur un volume persistant commun** pour
reprendre après redémarrage. Cette implémentation vise un seul processus API utilisant
ce volume ; les verrous en mémoire ne coordonnent pas plusieurs réplicas.

Limites : deux sessions incomplètes par device, 128 globalement, 2 GiB de taille déclarée
réservée pour les fichiers temporaires et quatre mutations/finalisations simultanées.
Les sessions expirent au bout de 24 heures. Le nettoyage tourne au démarrage, toutes
les heures et lors d’une initialisation. Il retire les fichiers temporaires et les
objets/parts S3 abandonnés après une tentative de stockage ; un stockage indisponible
conserve la session pour un nettoyage ultérieur.

Un [quota GLB par compte](account-storage-quota.md), de 2 Gio par défaut et
configurable par `ACCOUNT_STORAGE_BYTES`, s’ajoute au staging global. Il partage
le budget entre tous les devices, les uploads legacy et reprenables, la corbeille
et les suppressions en attente. Un dépassement reçoit `storage_quota_exceeded`
(HTTP 413) ; une réservation déjà obtenue n’est pas facturée deux fois au rejeu
ou à la finalisation. La libération attend le nettoyage réussi.

La finalisation utilise un stream fichier vers S3 et des parts SDK de **8 MiB**. Les
routes de téléchargement privées et partagées utilisent également des streams. Les GLB
et les métadonnées accessibles par lien de partage portent `Cache-Control: private, no-store`
pour éviter qu’un cache public continue à les servir après révocation. Une
capture devient visible uniquement après finalisation du stockage et transaction
SQLite. Après une panne entre ces deux étapes, une nouvelle finalisation remplace
l’objet réservé à cette session, puis confirme la même capture.

Le bucket doit autoriser les opérations multipart (création, liste des uploads/parts,
complétion, abandon) en plus de la lecture/écriture/suppression des objets. Prévoir
l’espace pour les fichiers temporaires et le stockage final ; en mode filesystem,
la copie finale peut temporairement doubler l’espace occupé par une capture.
Configurer le reverse proxy pour accepter une requête de 4 MiB et attendre la
finalisation S3 (timeout client de cinq minutes). Bun accepte 100 MiB par requête
pour maintenir l’ancien endpoint ; les nouveaux morceaux restent limités à 4 MiB.

## Vérifications

- `bun api:check` : routes, isolation entre devices, rejeu, quotas, expiration,
  checksum, reprise dans un nouveau processus et stockage temporairement indisponible.
- Le test API assemble et finalise un GLB de 200 MiB en 50 morceaux sans buffer du fichier entier.
- `storage-stream.test.ts` traverse le SDK MinIO réel contre une fixture HTTP et
  vérifie les parts S3 de 8 MiB. Cela ne constitue pas un test Garage réel.
- `ChunkedUploaderTest` vérifie les retries bornés, la reprise du sidecar, les erreurs
  permanentes et les offsets invalides.
- Un smoke test HTTP du client Java avec `-Xmx64m` a transféré et finalisé
  200 MiB sur l’API avec le stockage filesystem (une seule capture publiée).
- `bun run build` vérifie et construit le web, l’API et le JAR NeoForge avec JDK 21.
- `bun run api:garage` valide le stockage réel, sa panne et sa reprise, ainsi que
  la reprise après redémarrage du processus API, sans doublon.
- La validation manuelle du client Minecraft reste à faire : envoyer 200 MiB,
  couper/rétablir le réseau, redémarrer l’API, relancer l’upload et vérifier
  qu’une seule capture complète apparaît dans la galerie.

## Captures AFK

L’AFK est actif par défaut : cinq minutes d’inactivité, au plus une capture toutes
les quatre heures et un rayon de 32 blocs. Une désactivation enregistrée reste
respectée. Le bouton AFK est dans le menu simple ; les délais et le rayon sont
configurables dans le mode avancé.

La capture peut se déclencher pendant la pause et quand Minecraft n’a pas le focus.
Un joueur appairé envoie automatiquement sa capture ; sans appairage, elle reste
locale. L’AFK ne remplace pas le GLB pendant un upload déjà en cours. Les erreurs
restent dans le log local Minecraft ; aucune collecte distante n’est ajoutée.

Pour un test court, configurer temporairement les deux délais à une minute dans
les réglages avancés, puis rétablir les valeurs souhaitées. Vérifier un compte
appairé, un compte non appairé, AFK OFF, le retour du mouvement, la pause et une
API indisponible. Le fonctionnement en pause et les réglages ont été validés sur
le client de développement ; le JAR distribué et la reprise d’upload après panne
restent à exercer en jeu.
