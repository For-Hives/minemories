# Taille des GLB : mesures et optimisation

L’issue #73 réduit les fichiers sans changer les données visibles : indices au
plus petit type entier possible et PNG d’atlas dont les zones inutilisées sont
uniformisées. Le format reste glTF 2.0 autonome, sans nouvelle extension.

## Corpus réel et mesures avant/après

Cinq captures Minecraft existantes sont rejouées dans les deux JAR identifiés.
L’ancien writer reproduit chaque fichier original **octet pour octet** : le
benchmark reçoit donc les mêmes quads, PNG, matériaux et lumières, sans confondre
l’optimisation avec une animation de texture ou un mouvement d’entité.
Les fixtures d’upload étendues artificiellement à 200 Mio sont exclues.

| Capture | Avant (octets) | Après (octets) | Gain | Triangles | Images |
| --- | ---: | ---: | ---: | ---: | ---: |
| AFK progressif rayon 8 | 605 228 | 267 072 | 55,87 % | 2 766 | 17 |
| AFK progressif rayon 32 | 2 501 392 | 2 012 360 | 19,55 % | 27 220 | 26 |
| Tour et surface | 63 096 | 59 396 | 5,86 % | 412 | 12 |
| Hauteur complète | 483 628 | 446 728 | 7,63 % | 5 716 | 25 |
| Modèles, alpha et lumières | 819 204 | 438 740 | 46,44 % | 4 416 | 32 |

La dernière scène contient lit, coffres, panneau, chat, loup, mouton, cochon,
joueur et zombie équipé, du verre, de l’eau, de la végétation teintée et 144
lumières. Le grand export contient aussi un ours polaire. Les matériaux OPAQUE,
MASK et BLEND ainsi que l’émissivité sont conservés.

Sur le rayon 32 initial : positions et normales occupent chacune 653 280 octets,
UV 435 520, indices 326 640 et PNG 331 100 (hors JSON/padding). Sur le rayon 8,
les PNG dominent avec 327 378 octets, dont 321 233 pour l’atlas de blocs : seules
18 × 18 cellules, marge comprise, sont nécessaires à l’objet tenu. Son PNG passe
à 2 245 octets sans changer ses dimensions ni les coordonnées d’échantillonnage.

## Encodage exact des indices

Les deux writers choisissent le plus petit type compatible avec le nombre de
sommets de la primitive : 8 bits jusqu’à 255 sommets, 16 bits jusqu’à 65 535, puis
32 bits. Les quads ajoutent quatre sommets ; les frontières réellement exercées
sont donc 252/256 et 65 532/65 536.

La [spécification glTF](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#meshes)
interdit la valeur maximale du type d’indice, réservée au primitive restart.
Le nombre de sommets, borne exclusive des indices, empêche donc l’émission de
255/65 535 dans les types correspondants. Les valeurs corrompues sont refusées,
sans troncature silencieuse. L’ordre et le nombre de triangles restent identiques.

Le writer spoolé garde les indices temporaires 32 bits et les compacte seulement
pendant la copie finale, dans le buffer existant de 64 Kio. Le spool temporaire
peut donc être plus grand que le GLB publié.

## PNG d’atlas : préserver les échantillons, sans déplacer les UV

Pour les images `rendered/...textures/atlas/...`, le writer agrège les UV de
**tous** les matériaux référençant la même image. Il conserve le rectangle de
texels potentiellement échantillonnés et une marge d’un pixel. Les autres texels
sont remplacés par une couleur uniforme, plus compressible. Les dimensions,
samplers NEAREST sans mipmaps, UV, positions, normales, facteurs alpha/teinte et
liens émissifs restent inchangés. Les textures d’entités et sprites ordinaires ne
sont pas traités comme des atlas.

Des UV répétés, négatifs, non finis ou atteignant la borne supérieure entraînent
un retour au PNG initial. Les utilisations couvrant au moins la moitié de l’image
sont laissées intactes. Le décodage est limité à un PNG de 16 Mio / 4 millions de
pixels à la fois ; un réencodage illisible ou plus gros conserve l’original.
Le traitement vérifie l’interruption de capture. Il n’ajoute ni texture ni
matériau et ne réduit pas le coût GPU de l’image, dont les dimensions sont gardées.

Dans le spool, cette étape intervient après fermeture des streams d’ajout et
avant calcul du layout final ; elle ne touche que le fichier temporaire possédé,
après contrôle de son identité et de sa taille. La publication atomique reste en
vigueur. Les limites de spool, de capture et d’upload ne sont pas relevées.

## Fusion exacte des sommets (issue #173, phase 1)

Les deux writers partagent `VertexCache` et `QuadGeometry` : un sommet n'est écrit qu'une fois par primitive quand
position, normale et UV sont **identiques bit à bit** ; les indices des quads suivants le réutilisent. La table est à
adressage direct de 65 536 entrées (≈ 2,6 Mio d'entiers, taille constante quelle que soit la capture) : une collision
évince l'ancienne entrée, ce qui ne fait manquer qu'une fusion et ne change jamais le rendu. Le writer spoolé garde
donc sa borne de heap (test à 32 Mio inchangé) ; les fichiers temporaires ne contiennent que les sommets uniques.
Les arêtes voisines se partagent surtout entre quads proches dans le temps (médiane 35 quads, 90e centile 66 sur le
rayon 32), ce qui rend une fenêtre bornée presque aussi efficace qu'une fusion globale.

Un quad dont aucun des deux triangles n'a de surface (`0,1,2` puis `0,2,3`) est supprimé au lieu d'être écrit avec une
normale nulle ; la normale d'un quad « triangle » (coin répété) vient du premier triangle non dégénéré. Un triangle
dont deux indices deviennent égaux après fusion n'est pas émis. Les overlays volontaires (`RenderedLayer`) sont
séparés par un décalage de position : ils ne sont ni fusionnés ni supprimés.

Mesures sur les cinq captures de référence rejouées (même quads, PNG et matériaux, `Replay` hors Git) :

| Capture | Avant (octets) | Après (octets) | Sommets | Doublons exacts restants |
| --- | ---: | ---: | ---: | ---: |
| AFK progressif rayon 32 | 2 012 360 | 1 835 420 (−8,8 %) | 54 440 → 48 911 | 5 536 → 7 |
| AFK progressif rayon 8 | 267 072 | 255 300 (−4,4 %) | 5 532 → 5 165 | 368 → 1 |
| Hauteur complète | 446 728 | 393 540 (−11,9 %) | 11 432 → 9 770 | 1 669 → 7 |
| Tour et surface | 59 396 | 58 788 (−1,0 %) | 824 → 805 | 19 → 0 |
| Modèles, alpha et lumières | 438 740 | 432 084 (−1,5 %) | 8 832 → 8 624 | 209 → 1 |

Rendu Blender 5.2.2 (Cycles CPU, 16 échantillons, graine 42, 560 × 480) avant/après sur le rayon 32 et la scène
modèles/lumières : **identique pixel pour pixel** (écart maximal 0). Le gain reste modeste, comme prévu par la phase 0 :
la vraie réduction vient de la quantification (phase 3). Les mesures sont celles du writer rejoué hors jeu ; la
validation en jeu des captures progressives reste à faire avec le prochain JAR.

## Format 2 : catégories, métadonnées et plages par chunk (issue #173, phase 2)

Le glTF reste autonome et sans extension nouvelle ; seuls la structure et `extras` changent.

- **Nœuds nommés par catégorie** : `terrain` (cubes pleins), `decor` (modèles de bloc non pleins : plantes, neige,
  tapis, dalles), `fluids`, `block_entities` (coffres, lits, panneaux…), `entities`, plus un nœud par lumière
  ponctuelle. Chaque nœud porte un mesh du même nom ; seules les catégories présentes sont écrites. Une primitive par
  (catégorie, matériau) : le nombre d'appels de dessin reste celui d'avant, à une primitive près par catégorie et
  matériau partagés. Pas de nœud par entité : `MAX_GLB_NODES`/`MAX_GLB_PRIMITIVES` valent 4096 et une ferme
  d'entités les dépasserait. Dans Blender, chaque catégorie devient un objet que l'on peut supprimer ou masquer.
- **`asset.extras.minemories`** : `format: 2`, versions Minecraft / loader / mod, identifiant de dimension, `chunkSize`
  et nombre de quads par catégorie. Champs fermés et validés (`GlbMetadata`) : aucune donnée personnelle, aucun
  nom de monde, de serveur ou de joueur, aucune graine, aucun chemin, aucun texte de panneau ou de livre, et **aucune
  coordonnée absolue**. Les bornes et l'origine de capture restent dans le fichier de métadonnées déjà envoyé à l'API.
  `scenes[0].extras.minemoriesPlayerPosition` est conservé.
- **Plages par chunk** : chaque primitive peut porter `extras.minemoriesChunks = [x, z, premierTriangle, nombre, …]`,
  `x`/`z` étant relatifs au chunk qui contient l'origine de capture. Le parcours de capture est désormais **chunk par
  chunk** (`CaptureCursor` et export manuel), le propriétaire est la cellule source (entité : son chunk). Une primitive
  sans chunk connu ou qui dépasserait le budget de 40 000 plages par scène n'en publie pas : le JSON reste borné
  (limite de 4 Mio) et un lecteur retombe sur son propre tri.
- Les anciens GLB (un seul mesh, aucun `extras`) restent lus par le viewer et les deux validateurs : le viewer
  ne dépend pas de ces champs. **Le viewer n'utilise pas encore les plages** : sa composition a besoin du bloc de
  chaque triangle (couverture partielle d'un chunk) et son tri ne coûte que ≈ 4,5 ms par capture (mesure de
  `world-evolution.md`) ; elles servent aux outils tiers et à la suite (dérivé, LOD).

Mesures sur les cinq captures rejouées avec catégories (heuristique sur les noms de matériaux, hors jeu, plages dans
l'ordre d'origine donc plus nombreuses qu'avec le parcours chunk-major) : rayon 32 1 835 420 → 1 859 984 octets
(+1,3 %, dont ≈ 24 Kio de JSON), hauteur complète 393 540 → 396 848. Le coût est celui du JSON ; la vraie réduction
vient de la phase 3.

Validation : les cinq GLB passent le validateur du viewer et celui de l'API (5/5). Blender 5.2.2 importe un objet par
catégorie (ex. `terrain` 1 400 faces, `decor` 1 748, `fluids` 336, `block_entities` 132, `entities` 800) ; rendu Cycles
identique pixel pour pixel sur le rayon 32, et 49 pixels différents (6 avec écart > 8, écart max 18 sur 268 800) sur
la scène modèles/lumières, imputés à l'ordre de rendu des matériaux translucides entre objets. Le viewer charge le
fichier (Chromium headless, SwiftShader) et affiche la scène complète. Validation en jeu : non faite.

## Quantification `KHR_mesh_quantization` (issue #173, phase 3)

Les deux writers quantifient la géométrie ; le fichier reste du glTF 2.0 autonome, lisible par Blender 5.2.2 (mesuré,
voir `docs/features/glb-v2-decisions.md`), `extensionsUsed`/`extensionsRequired` déclarent `KHR_mesh_quantization`.

| Attribut | Avant | Après |
| --- | --- | --- |
| POSITION | 3 × float32 (12 o) | 3 × int16 + 2 o de remplissage (8 o), échelle `1/2^k` et translation entière portées par le nœud de catégorie |
| NORMAL | 3 × float32 (12 o) | 3 × int8 normalisé + 1 o (4 o) |
| TEXCOORD_0 | 2 × float32 (8 o) | 2 × uint16 normalisé (4 o) |

- Les attributs sont écrits avec `byteStride` (8/4/4), exigé par glTF pour les éléments non multiples de 4 octets.
- **Échelle** : choisie à l'écriture, par catégorie, d'après l'étendue réelle des positions : la plus fine des grilles
  `1/128`…`1/16` de bloc dont l'étendue tient dans ±32 766. La grille de Minecraft (1/16) est donc **exacte** ; les
  modèles tournés et les fluides sont arrondis au plus à 1/256 de bloc sur les petites captures et 1/32 sur les très
  grandes, au plus près du seuil de 1/64 de bloc du viewer. Une catégorie plus étendue que ±1 024 blocs garde des
  positions float32.
- **UV** : uint16 seulement si tous les UV d'une primitive sont dans [0, 1] ; sinon float32 (UV répétés). Erreur
  maximale 1/65 535 de l'image, soit 0,016 texel sur l'atlas 1024.
- **Normales** : conservées (int8) plutôt que supprimées : sans normales, `GLTFLoader` active `flatShading`, que le
  viewer évite (NaN signalés sur Firefox/NVIDIA, voir `viewer-scene.ts`), et recalculer les normales après fusion
  lisserait les arêtes.
- Dans le writer spoolé, le spool temporaire reste en float32 ; la conversion se fait à la copie finale, dans un
  tampon de 64 Kio (plus un tampon de sortie de même taille) : la borne de heap et les limites de spool/fichier ne
  changent pas. Les deux writers produisent toujours des fichiers identiques octet pour octet.
- Dans Blender, chaque catégorie importée porte une **échelle de 0,0078** (1/128, ou plus sur les grandes captures) :
  appliquer l'échelle (*Object → Apply → Scale*) avant de modéliser. Les positions de lumière restent en float32.
- Le validateur de `@minemories/api-contract/glb` acceptait déjà ces types (quantification, `byteStride`) ; le viewer
  lit les positions via la matrice du nœud (`localPositions`), donc sans changement.

Mesures (écriture rejouée, hors jeu ; « avant » = fin de la phase 2) :

| Capture | Avant (octets) | Après (octets) | Gain | gzip avant → après |
| --- | ---: | ---: | ---: | ---: |
| AFK rayon 32 | 1 859 984 | 1 085 060 | −41,7 % | 280 279 → 259 366 |
| AFK rayon 8 | 260 368 | 182 588 | −29,9 % | 38 927 → 34 435 |
| Hauteur complète | 396 848 | 243 820 | −38,6 % | 60 637 → 58 676 |
| Tour et surface | 60 616 | 49 884 | −17,7 % | 9 762 → 9 468 |
| Modèles, alpha et lumières | 438 832 | 306 856 | −30,1 % | 71 932 → 62 322 |
| Capture réelle (modpack) | 20 299 828 (original) | 10 651 588 | −47,5 % | 2 599 432 → 2 408 324 |

Le gain après compression de transfert est faible (gzip −7 %, brotli de la capture réelle 1 492 397 → 1 578 659,
légèrement pire) car les entiers quantifiés se compressent moins bien que des floats très répétitifs : la réduction
du transfert viendra du dérivé Meshopt (phase 4). La quantification réduit surtout la mémoire de chargement et le
stockage non compressé.

Validation : les six fichiers passent le validateur du viewer et celui de l'API ; Blender 5.2.2 les importe, rendu
Cycles (560 × 480, 16 échantillons, graine 42) : écart moyen 0,85/255 sur la scène modèles/lumières et 0,35/255 sur
le rayon 32 (0,24/255 en moyenne par bloc de 8 × 8 pixels), jusqu'à 18/255 en moyenne de bloc de 8 × 8 sur les
plantes. Ce n'est plus pixel pour pixel ; la cause n'a pas été isolée entre normales int8, UV 16 bits et positions des
modèles tournés. Le viewer (Chromium headless, SwiftShader) affiche la scène sans différence visible. Validation en
jeu : non faite.

Textures : mesure faite, aucune modification. Sur le corpus et la capture réelle, 0 image dupliquée (83 images
uniques), tous les PNG ont moins de 256 couleurs et pèsent 3 à 76 Kio au total : déduplication et PNG indexé
n'apportent rien d'utile. Le coût est la VRAM : un atlas de blocs de 1 024 × 512 (2 Mio en RGBA 8 bits) dont seules
2 à 27 cellules de 16 × 16 sur 2 048 servent dans le corpus (221 sur la capture modée, 11 %). Un repack des seuls
sprites utilisés réduirait la VRAM à quelques centaines de Kio par capture ; il remappe les UV et touche
l'échantillonnage NEAREST et le recadrage des atlas de #73 : il reste à faire (suivi dans l'issue).

## Coût de préparation

Mesures locales sur Ryzen 5 3600, Btrfs, Temurin 21.0.12.1+1, heap 512 Mio :
médiane de cinq exports après trois chauffes, dans des JVM séparées par version.
Le temps inclut ingestion dans le writer spoolé et publication, mais pas la
capture du jeu ni l’encodage PNG initial des pixels GPU.

| Capture | Avant (ms) | Après (ms) |
| --- | ---: | ---: |
| Rayon 8 | 44,89 | 78,03 |
| Rayon 32 | 152,98 | 184,33 |
| Tour et surface | 15,49 | 16,48 |
| Hauteur complète | 49,73 | 47,52 |
| Modèles/lumières | 61,97 | 112,29 |

Le réencodage des atlas coûte ici environ 30–50 ms supplémentaires, en échange
principalement d’un fichier plus petit. En AFK il reste sur le worker. Le choix
préserve exactement les attributs et pixels utilisés ; greedy meshing/LOD et
compressions nécessitant une extension ne sont pas introduits par cette version.
Ces mesures ne prétendent pas établir un minimum théorique pour tout modpack.

## Validations

- Tests core : frontières des types, indices réservés/corrompus, concordance des
  deux writers, agrégation des UV, marge, RGBA translucides/cutout, fichiers
  incorrects, fallback sans croissance et interruption. JaCoCo/SpotBugs passent
  sans modification des seuils.
- Les cinq comparaisons indépendantes vérifient attributs POSITION/NORMAL/UV
  identiques en binaire, indices décodés identiques, matériaux/nœuds/lumières
  identiques, dimensions d’images et tous les RGBA des rectangles protégés.
- Les dix GLB rejoués et quatre nouveaux exports natifs passent à la fois le
  validateur commun viewer et le validateur API de fichier borné : 14/14.
- Blender 5.2.2 importe et rend les cinq paires, caméra/lumières inchangées,
  560 × 480, Cycles CPU, 16 samples, seed 42 : les cinq rendus RGB sont identiques
  pixel pour pixel (écart maximal de canal : 0). La scène avec modèles/lumières
  est également inspectée visuellement.

L’essai natif du 15 octobre 2026 utilise Minecraft 1.21.1 / NeoForge 21.1.248,
Mesa llvmpipe OpenGL 4.6 et le JAR 0.1.1-dev.1 chargé depuis `mods/`, core embarqué
compris. Il exerce exports manuels/progressifs rayon 8/32 en pause, PACK/PBO,
activité/reprise, désactivation, reload des ressources, retrait de chunk, dimension
et déconnexion : aucun faux commit et nettoyage du worker. Les captures AFK
prennent ici 1,53 s / 14,80 s sur 43 / 469 frames ; les pas maximaux de capture
sont 2,33 / 2,02 ms (2 / 1 dépassements du budget coopératif de 2 ms). La durée
totale d’une frame inclut aussi rendu logiciel, limitation FPS et GC.

Empreintes des JAR :

- Avant : `34d6bf346cfe97d869325df9282295f9a67598a7a749705e20e4ec715646068f`.
- Après, également testé en jeu :
  `be45cff30a5aad0201a4f75a272e8aae9566caf05a9ab3a655d68dc7f774d8d2`.

Artefacts hors Git : `~/.local/state/minemories-validation/glb-size-20261015/`
(corpus/empreintes, replay Java, mesures, vérification indépendante, validateurs,
rendus avant/après et comparaison, pilote/logs/scénarios natifs). `bun check` et
`bun run build` passent ; la CI complète reste requise avant fusion.
