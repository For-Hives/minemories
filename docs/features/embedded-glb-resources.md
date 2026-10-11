# Ressources embarquées des souvenirs GLB

Un souvenir doit garder sa géométrie et ses textures avec lui. Les références à
des fichiers voisins, à une URL HTTP, à un chemin local ou à un blob créé ailleurs
sont refusées par les deux uploads et par le viewer avant son parseur Three.js.
Cela concerne aussi les anciens souvenirs téléchargés et les liens partagés :
ils passent par le même chargement de scène que les fichiers ouverts localement.

La validation commune est dans `@minemories/api-contract/glb` :

- GLB 2, longueur exacte, premier bloc JSON UTF-8 valide et `asset.version=2.0`.
- Au maximum 4 MiB de JSON, puis 64 blocs supplémentaires au plus. Les extensions
  à types de blocs inconnus restent ignorables ; un second JSON est refusé, car il
  pourrait remplacer le contenu contrôlé dans le parseur. Le BIN est unique et,
  s’il existe, suit immédiatement le JSON.
- Seul le premier buffer peut utiliser ce BIN sans URI. Sa longueur déclarée est
  positive, entière et compatible avec la taille du BIN, avec trois octets de
  padding au maximum. Tout autre buffer doit fournir ses propres données via une
  URI `data:application/octet-stream` ou `data:application/gltf-buffer` en base64.
- Chaque image fournit une référence `bufferView` avec un type MIME, ou une URI
  `data:` raster intégrée. Les types acceptés sont PNG, JPEG, WebP, AVIF et KTX2.
  Les formats à extensions restent soumis aux capacités du loader ; ce contrôle
  ne prétend pas ajouter de nouveaux décodeurs au viewer. SVG est refusé.
- Les URI de métadonnées dans `extras` ne sont pas des ressources du loader et ne
  sont pas traitées comme des textures ou de la géométrie.

Ces règles suivent la structure et les ressources intégrées de la
[spécification glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html),
avec une politique Minemories qui exige l’autonomie du fichier.

Les plafonds binaires restent 100 MiB pour l’ancien upload et 200 MiB pour l’upload
reprenable en morceaux de 4 MiB. La validation de ce dernier lit le JSON et les
en-têtes de blocs, puis calcule le checksum en stream ; elle ne charge pas le BIN
entier. Les fichiers refusés ne créent ni souvenir ni objet de stockage. Une
session reprenable refusée peut être annulée ; sinon son staging privé expire
avec le mécanisme existant.

Dans le viewer, le fichier est contrôlé avant de charger une texture ou un buffer.
En cas de refus, le chargement s’arrête et un message demande de réexporter avec
les textures et la géométrie intégrées. Les anciens fichiers non autonomes ne
sont ni modifiés ni supprimés automatiquement. L’export actuel du mod conserve
son format et ses textures PNG embarquées.

Validation : URI externes/relatives/locales/blob sur les deux uploads HTTP,
absence de stockage et de publication après refus, JSON de remplacement, BIN
dupliqué ou manquant, padding, bornes du JSON et des blocs, UTF-8 invalide,
URI de données acceptées, parseur Three.js réel pour une scène autonome et refus
avant le loader de textures. Les interactions du viewer local et de la galerie
vérifient le message et la disparition du chargement. La capture Minecraft réelle
de 10 488 752 octets passe les deux validations ; son import et son rendu Blender
ont été inspectés, avec un mesh et 55 images PNG intégrées. Aucun fichier privé n’est
ajouté au dépôt ou envoyé en production pour ces tests.

La validation ne couvre pas encore toute la cohérence glTF des accessors,
bufferViews, attributs ou extensions, ni un budget de pixels décompressés. Ces
limites restent suivies dans `docs/AI/TASKS.md` ; une validation URI ne remplace pas
une validation complète des données de géométrie et d’image.
