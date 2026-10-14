# Upload reprenable de 200 Mio depuis Minecraft

L’issue [#81](https://github.com/For-Hives/minemories/issues/81) a été exercée le
15 octobre 2026 avec le JAR de distribution chargé depuis `mods/`, trois processus
Minecraft et deux processus de l’API réelle. Aucun compte ou service de production
n’a été utilisé.

## Fixture et versions

Minecraft 1.21.1 / NeoForge 21.1.248, Temurin 21.0.12.1+1 et Minemories
0.1.1-dev.1 ; Mesa llvmpipe OpenGL 4.6 dans un profil isolé. SHA-256 du JAR :
`34d6bf346cfe97d869325df9282295f9a67598a7a749705e20e4ec715646068f`.
L’API utilise le code de main, Bun 1.4.3, Better Auth, Hono/oRPC, SQLite persistée
et le driver filesystem, sur une adresse loopback. Un compte de test est créé et
le mod échange un vrai code à six chiffres via `/api/mod/pair` ; le token est
persisté par le client dans son fichier de configuration.

Le fichier est dérivé d’un GLB réellement capturé dans Minecraft. Sa géométrie,
ses textures et ses accessors sont conservés ; la partie BIN inutilisée est
étendue avec des zéros et la longueur du buffer/du conteneur est ajustée pour
atteindre exactement **209 715 200 octets (200 Mio)**. Cela teste la frontière du
protocole d’envoi ; ce fixture n’est pas une mesure de construction d’une scène
naturelle de 200 Mio.

SHA-256 du fichier :
`783a515d3bd761be4460fe3eb09278b1e9380e2d61b804a993a42d8fcee6e2b2`.

## Coupure et redémarrages

1. Le premier client Minecraft appaire l’appareil auprès de l’API réelle puis
   appelle le transport normal du mod avec le fichier de 200 Mio.
2. Après le commit de trois morceaux de 4 Mio, l’observateur constate l’offset
   **12 582 912**, bloque les nouvelles requêtes d’upload et arrête le processus
   API. Le client reçoit une erreur après ses retries bornés.
3. Le fichier local et son sidecar de session restent présents. L’UUID du sidecar
   correspond à la session interrompue dans SQLite. Le client Minecraft termine.
4. Un nouveau processus API ouvre la même SQLite, le même staging et le même port.
   Un nouveau client Minecraft conserve son appairage et reprend le même fichier.
5. La trace HTTP du second processus montre le premier `Upload-Offset` à
   **12 582 912**, puis les 47 morceaux restants. Les deux processus API ont reçu
   **50 morceaux** au total, aux offsets 0, 4 Mio, …, 196 Mio.
6. La finalisation conserve le même UUID et produit une seule mémoire de 200 Mio.
   Le SHA-256 du fichier stocké est identique, ainsi que les métadonnées fournies
   (`worldName`, `capturedAt`, `captureStartedAt`, `captureFinishedAt`). Le sidecar
   est supprimé après succès ; le GLB local complet reste présent.

La vérification du fichier stocké utilise `validateUploadFile`, le même lecteur
borné et validateur que la finalisation de production : en-têtes, ressources,
valeurs d’accessors et checksum sont lus sans buffer BIN complet.

## Limites, quota et allocations

Un troisième client Minecraft tente **200 Mio + 4 octets**. Le transport du JAR
refuse le fichier et ne crée pas de sidecar/session distante. L’API refuse également
une initialisation de cette taille (HTTP 400 `invalid_upload`).

Le compte isolé dispose de 300 Mio. Après stockage de 200 Mio, l’initialisation
d’un autre upload de 150 Mio est refusée avec HTTP 413 `storage_quota_exceeded`.
Les refus n’ajoutent ni mémoire ni session ; il reste une seule capture publiée.

Les deux envois sont enregistrés par JFR (`jdk.ObjectAllocationOutsideTLAB`, piles
incluses), en filtrant les allocations dont la pile contient `ChunkedUploader`.
Le plus grand objet observé est **4 194 320 octets**, soit un tableau de payload
4 Mio avec son en-tête JVM, avant et après redémarrage. Aucun objet de taille
200 Mio n’est observé dans ces piles. Le code conserve un seul morceau 4 Mio et
utilise un buffer de checksum 64 Kio ; cette mesure ne décrit pas la heap entière
du jeu ni les allocations de son renderer.

## Portée et preuves

Les artefacts sont locaux dans
`~/.local/state/minemories-validation/upload-200m-verified-20261015/` : fixture,
empreintes, journal HTTP, offset de coupure, rapports de session/résumption,
JFR/allocations, résultats des limites/quotas et logs des processus.
Les tokens, cookies, bases, mondes, enregistrements JFR et GLB ne sont pas committés.

Cette validation complète le parcours mod → API réelle → stockage filesystem
avec coupure API et redémarrage du client. Les tests existants et la CI couvrent
les sessions/contrats réels, Garage, sa panne et sa reprise dans un nouveau processus.
Elle ne prouve pas les erreurs réseau d’un déploiement de production ni les profils
particuliers des joueurs, qui restent dans #83.
