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
reprenable en morceaux de 4 MiB. La validation de ce dernier lit le JSON, les
en-têtes de textures et les fenêtres d’accessors, puis calcule le checksum en
stream ; elle ne charge pas le BIN entier. Les fichiers refusés ne créent ni
souvenir ni objet de stockage. Une
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

## Valeurs binaires des accessors

Le contrôle du 11 octobre examine aussi les octets de chaque accessor, y compris
ceux qui ne sont pas utilisés par la scène initiale. Les uploads legacy et
reprenable ainsi que le viewer utilisent les mêmes règles avant stockage ou
appel du loader :

- Les composants flottants doivent être finis : NaN et les deux infinis sont
  refusés dans les valeurs de base et les remplacements sparse.
- Les bornes déclarées doivent correspondre aux extrema effectifs. Les nombres
  JSON sont arrondis en float32 avec `Math.fround` avant comparaison ; les types
  entiers normalisés conservent leurs bornes brutes, conformément au format.
- Chaque indice de primitive référence un sommet existant pour toutes les
  primitives qui l’utilisent. Les valeurs maximales réservées des uint8/16/32
  sont refusées comme indices.
- Les indices sparse sont strictement croissants, uniques et inférieurs au
  nombre d’éléments de l’accessor. Les bornes sont calculées après remplacement,
  avec les zéros implicites restants. Un accessor sans base ni sparse peut garder
  des bornes descriptives sans données, comme prévu par glTF.
- Les strides et le padding des colonnes de matrices sont respectés ; les
  octets de padding ne deviennent pas des composants.

Chaque lecture reste limitée à **64 KiB**, pour la base, les indices sparse et
leurs valeurs. Les fenêtres sont parcourues sans construire l’accessor complet
ni conserver une table de tous les remplacements. Les URI base64 sont décodées
dans la limite du JSON de 4 MiB. Le contrôle rend régulièrement la main à la
boucle d’événements, afin que le chargement reste visible. Le checksum final
reprenable conserve son parcours en stream.

Ces règles suivent les sections Accessor Bounds, Sparse Accessors et Topology
and Connectivity de la
[spécification glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).

Les tests couvrent les valeurs non finies, les bornes fausses, les trois types
d’indices, les quatre types entiers normalisés, les matrices avec padding, les
strides, les remplacements sur plusieurs fenêtres, les lectures trop courtes
et les buffers inline. Les deux uploads refusent les fichiers malformés sans
créer d’objet ni publier de souvenir. Le vrai parseur Three.js accepte aussi
une géométrie sparse valide et n’est pas appelé pour les fixtures refusées.

Les captures réelles de **10 488 752** et **13 628 224** octets passent le contrôle
en mémoire et la validation du fichier reprenable avec SHA-256. Le rendu Blender
de la seconde a été revérifié : village, textures et terrain de 65 × 65 × 118
restent visibles. Aucun changement du fichier exporté ni du code Minecraft.

Ces contrôles ne constituent pas une validation exhaustive des autres contraintes
et extensions glTF.

## Dimensions et budgets des textures

Les en-têtes des images sont examinés avant le décodeur du navigateur et avant
publication par les deux uploads. Un petit fichier compressé ne peut donc pas
annoncer une texture arbitrairement grande. Les images non utilisées comptent
aussi. Chaque entrée de texture consomme le coût de ses sources, y compris les
sources de secours des extensions ; répéter une source dans plusieurs textures
ne contourne pas le total.

| Budget commun API / viewer | Plafond |
| --- | --- |
| Largeur ou hauteur d’une image | 16 384 pixels |
| Pixels par image, plans et frames comptés | 16 777 216 |
| Pixels cumulés, sources répétées comprises | 67 108 864 |
| Taille décompressée estimée par image | 128 MiB |
| Taille décompressée estimée cumulée | 512 MiB |
| Images / textures | 1 024 / 4 096 |
| Octets lus pour les en-têtes, toutes images confondues | 8 MiB |
| En-têtes de blocs, marqueurs, boxes et extents parcourus | 16 384 |
| Fenêtre de lecture d’image | 4 KiB |

L’estimation prend huit octets par pixel ; pour KTX2, elle prend le maximum entre
ce coût et la somme des tailles décompressées déclarées par les niveaux. Les
mipmaps, couches, faces de cube et profondeur sont examinés ; la profondeur est
limitée à 16 384 et les couches à 1 024. Les plages et les tailles des niveaux
supercompressés sont contrôlées avant lecture des données codées.

PNG vérifie l’IHDR et les dimensions des frames APNG. JPEG lit les marqueurs
jusqu’au premier scan et contrôle le SOF. WebP vérifie à la fois le canvas VP8X,
les dimensions VP8/VP8L et chaque frame animée. Pour APNG et WebP animé, le budget
compte un canvas par frame, plus un canvas de composition.

Pour AVIF, le contrôle suit les items AV1 et alpha jusqu’à leurs extents, sans
concaténer l’image entière. Il lit les maxima de dimensions des véritables
Sequence Header OBUs AV1 : les propriétés d’affichage `ispe` seules ne bornent
pas les images intermédiaires. Les grilles comptent leur sortie et, par prudence,
tous les plans codés pour chaque cellule, afin de couvrir aussi les plans alpha
réutilisés. Ce calcul peut refuser une grille qu’un décodeur optimisé garderait
en moins de mémoire. Les références externes, méthodes de construction non
contrôlées, dérivations inconnues et tracks AVIF animés sont refusés. Les items
statiques, alpha et grilles restent soumis au budget commun.

Les layouts contrôlés sont décrits par les spécifications
[PNG/APNG](https://www.w3.org/TR/png-3/),
[JPEG](https://www.w3.org/Graphics/JPEG/itu-t81.pdf),
[WebP](https://developers.google.com/speed/webp/docs/riff_container),
[KTX2](https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html) et
[AVIF](https://aomediacodec.github.io/av1-avif/), ainsi que la syntaxe du
[Sequence Header AV1](https://github.com/AOMediaCodec/av1-spec/blob/master/06.bitstream.syntax.md).
Le cas d’alpha partagé entre cellules est décrit dans le
[décodeur libavif](https://github.com/AOMediaCodec/libavif/blob/main/src/read.c).

Ces contrôles d’en-têtes ne décodent pas les pixels, ne vérifient pas les CRC PNG
ou toute la syntaxe des codecs, et ne garantissent pas la mémoire totale du
processus ou du GPU. Les erreurs du décodeur restent visibles. Aucun décodeur
KTX2 n’est ajouté au viewer ; valider son budget ne rend pas ce format affichable
sur une configuration qui ne le prenait pas en charge.

Validation du 11 octobre : fixtures raster produites pour les tests (PNG/APNG,
JPEG, WebP statique/animé et AVIF avec alpha), en-têtes KTX2 et AV1 synthétiques,
dimensions excessives, références répétées, budget KTX2 cumulé, grilles AVIF,
metadata floods, données inline, MIME contradictoires et lectures tronquées.
Les uploads legacy et reprenable refusent ces fichiers avant stockage et
publication. Le viewer refuse les mêmes budgets avant d’appeler Three.js.

Les captures Minecraft réelles de **10 488 752** et **13 628 224** octets passent
encore les validations en mémoire et sur fichier avec SHA-256. Le rendu Blender
5.2.2 de la seconde a été inspecté : village, feuillage, textures et volume de
terrain de 65 × 65 × 118 restent visibles. Le format exporté et le code du mod
ne changent pas. Les fixtures synthétiques testent le contrôle d’en-têtes ; elles
ne sont pas présentées comme des images décodables.
