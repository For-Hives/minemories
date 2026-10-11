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
  Leur longueur déclarée doit correspondre aux octets intégrés, avec ou sans
  padding base64 ; une URI courte ne peut pas annoncer un buffer plus grand.
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

## Disposition et budgets de géométrie

Le même contrôle commun vérifie la disposition JSON avant stockage et avant
appel du loader Three.js. Chaque vue référence un buffer existant et reste dans
sa longueur. Les offsets et strides sont entiers, alignés et compatibles avec
les types de composants ; les matrices tiennent compte du padding de colonnes.
La plage complète d’un accessor, y compris son dernier élément, doit tenir dans
la vue. Les références et plages des remplacements sparse sont aussi contrôlées.

Les primitives référencent des accessors existants, avec des nombres de sommets
identiques, des types adaptés aux attributs et des bornes POSITION finies.
Les indices utilisent un scalaire entier non signé et une topologie cohérente.
Le contrôle distingue les vues de textures, de sommets et d’indices ; plusieurs
accessors de sommets partageant une vue exigent un stride explicite. Les morph
targets, les attributs de skin, les types quantifiés déclarés et les instances GPU
passent ces contrôles de disposition. Meshopt et Draco sont refusés : le viewer
n’a pas leurs décodeurs configurés, et leurs dispositions compressées ne peuvent
pas contourner les budgets.

| Budget commun API / viewer | Plafond |
| --- | --- |
| Entrées par liste contrôlée | 16 384 |
| Éléments d’accessors cumulés, indices compris | 32 000 000 |
| Géométrie décompressée estimée en float32 | 256 MiB |
| Primitives cumulées | 4 096 |
| Éléments à dessiner, répétitions et instances comprises | 32 000 000 |
| Nœuds | 4 096 |
| Profondeur de hiérarchie | 128 |

Ces budgets sont des limites Minemories, en plus de la structure glTF. Ils portent
sur les listes complètes, y compris les données non utilisées dans la scène
initiale. Les accessors à zéros implicites et les données sparse sont comptés
avant allocation ; la taille du GLB seule ne bornerait pas leur expansion.
Les nœuds référencent des meshes existants, avec des transformations finies.
Les cycles, les parents multiples et les racines de scène incohérentes sont
refusés sans parcours récursif du graphe.

Les uploads HTTP legacy et reprenables refusent les fixtures de géométrie
incohérente avant publication ou stockage d’objet. Le viewer refuse les mêmes
dispositions avant d’invoquer le loader ; une scène triangulaire valide passe
aussi le parseur Three.js réel. Les captures Minecraft de 10 488 752 et
13 628 224 octets passent le contrôle en mémoire du viewer et celui du fichier
reprenable, qui lit seulement le JSON et les en-têtes avant son checksum en stream.
Le rendu Blender de la capture récente a été inspecté : le village, les textures
et le volume de terrain restent visibles. `bun run build`, incluant `bun check`,
passe avec 93 tests API et 64 tests web ; les fonctions et lignes du contrôle
commun sont couvertes à 100 %. Les huit scénarios Garage réels passent aussi,
y compris l’envoi reprenable, la panne et le nettoyage dans un nouveau processus.

Le contrôle JSON ne lit pas encore les valeurs binaires des attributs et indices :
il ne prouve donc pas l’absence de NaN dans le BIN, les bornes de chaque indice,
l’ordre des indices sparse ou l’accord entre valeurs et bornes annoncées.
Le budget de pixels décompressés et les validations binaires restent dans
`docs/AI/TASKS.md`. Les autres contraintes glTF et les extensions ne constituent
pas une validation exhaustive du format.
