# Upload des captures volumineuses

Le mod utilise un upload séquentiel et reprenable jusqu’à **450 MiB** (471 859 200 octets). Chaque requête contient au maximum **4 MiB**.
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

La finalisation utilise un stream fichier vers S3 et des parts SDK de **8 MiB**,
envoyées une par une avec AWS SDK v3. Le nettoyage durable parcourt
toutes les pages d’uploads multipart et abandonne uniquement ceux de la clé exacte.
Les morceaux mod → API restent de **4 MiB**. Voir [le stockage S3](storage-s3.md).
Les routes de téléchargement privées et partagées utilisent également des streams. Les GLB
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
- `storage-stream.test.ts` traverse le SDK S3 réel contre une fixture HTTP et
  vérifie les parts de 8 MiB, leurs SHA-256 signés et le nettoyage après refus d’une
  part. Une source qui retient sa fin jusqu’à réception de la première part prouve
  que l’envoi commence avant lecture du fichier entier. Cela ne constitue pas un
  test Garage réel.
- `ChunkedUploaderTest` vérifie les retries bornés, la reprise du sidecar, les erreurs
  permanentes et les offsets invalides.
- Un smoke test HTTP du client Java avec `-Xmx64m` a transféré et finalisé
  200 MiB sur l’API avec le stockage filesystem (une seule capture publiée).
- `bun run build` vérifie et construit le web, l’API et le JAR NeoForge avec JDK 21.
- `bun run api:garage` valide le stockage réel, sa panne et sa reprise, ainsi que
  la reprise après redémarrage du processus API, sans doublon.
- Le parcours natif Minecraft à 200 Mio, coupure après 12 Mio et reprise après
  redémarrage client/API est [validé et documenté](native-upload-resume-validation.md) :
  une seule mémoire complète est stockée, avec checksum et métadonnées identiques.

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

## Plafond de 450 Mio

Le 16 octobre 2026, le test API finalise un GLB de 471 859 200 octets envoyé en 113 requêtes de 4 Mio au maximum ; le dernier morceau contient 2 Mio. Un octet au-delà du plafond est refusé dès l’initialisation. Les lectures de validation restent en flux. La suite complète inclut les quotas, la reprise et les erreurs de stockage.

Les anciennes bases SQLite sont migrées dans une transaction : réservations, références en préparation et références publiées sont conservées, leurs contraintes de taille et de nombre de morceaux sont relevées. Le test exerce aussi une seconde migration sans changement et les clés étrangères. Le lecteur temporel du viewer accepte le même plafond. Les preuves historiques à 200 Mio ci-dessus restent celles de leurs versions respectives.
