# GLB v2 : mesures de la phase 0 et décisions (issue #173)

Ce document précède toute modification du format. Il consigne les mesures faites le 2 novembre 2026 sur le
corpus de #73 (`docs/features/glb-size.md`) et sur une capture réelle de 20 Mio, puis les choix qui en découlent.
Rien ici n'est validé en jeu : les mesures portent sur des GLB déjà produits par le vrai writer.

## Outil de mesure

`python3 scripts/glb-report.py [--json] fichier.glb …` (bibliothèque standard, `brotli` du système en option) :
octets par catégorie (positions, normales, UV, indices, PNG, JSON), quads, sommets dupliqués (exacts / par position
seule), gzip 6 et brotli 9, VRAM des textures en RGBA 8 bits sans mipmaps. Les variantes ont été produites avec
`gltfpack 1.3` et `@gltf-transform` + `draco3dgltf` (hors Git, dans `~/.local/state/minemories-validation/glb-v2-20261102/`).

## État de départ

| Capture | Octets | Quads | Sommets | Doublons exacts | Doublons par position | gzip | brotli | VRAM textures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| AFK rayon 32 | 2 012 360 | 13 610 | 54 440 | 5 536 (10,2 %) | 32 866 | 278 144 | 121 233 | 2,08 Mio |
| AFK rayon 8 | 267 072 | 1 383 | 5 532 | 368 (6,7 %) | 3 091 | 36 890 | 27 293 | 2,04 Mio |
| Hauteur complète | 446 728 | 2 858 | 11 432 | 1 669 (14,6 %) | 7 877 | 62 375 | 39 390 | 25 Kio |
| Tour et surface | 59 396 | 206 | 824 | 19 (2,3 %) | 422 | 9 209 | 8 039 | 12 Kio |
| Modèles, alpha, lumières | 438 740 | 2 208 | 8 832 | 209 (2,4 %) | 5 209 | 69 446 | 53 910 | 3,09 Mio |
| Capture réelle (modpack) | 20 299 828 | 134 951 | 539 804 | 72 714 (13,5 %) | 361 272 | 2 599 432 | 1 492 397 | 2,14 Mio |

Constats :

- La géométrie fait 82–86 % des octets dès que la capture dépasse quelques milliers de quads (rayon 32 : positions
  et normales 653 280 octets chacune, UV 435 520, indices 156 846 après #73, PNG 11 861). Sur la capture réelle :
  positions 6,5 Mio, normales 6,5 Mio, UV 4,3 Mio, indices 2,7 Mio, PNG 76 Kio, JSON 293 Kio.
- Sur les petites captures, le JSON (matériaux, accessors) pèse presque autant que la géométrie (28 Kio sur 59 Kio).
- La fusion **exacte** des sommets (position + normale + UV) retire 2 à 15 % des sommets : réel mais modeste,
  comme l'issue le prévoyait. La fusion par position seule retirerait 60 % des sommets, mais elle fusionnerait des
  sommets de normales/UV différentes et changerait le rendu : écartée. Blender fusionne déjà les doublons exacts
  à l'import (54 440 → 48 904 sommets sur le rayon 32), ce qui explique les « sommets superposés » vus avec
  *Merge by distance* : ce sont majoritairement des sommets de faces différentes.
- Les textures ne sont pas un enjeu de VRAM : 2–3 Mio sur tout le corpus, y compris la capture modée de 20 Mio.

## Variantes testées hors ligne (rayon 32, octets bruts / gzip / brotli)

| Variante | Brut | gzip | brotli |
| --- | ---: | ---: | ---: |
| Actuel (#73) | 2 012 360 | 278 144 | 121 233 |
| gltfpack : quantification seule (`KHR_mesh_quantization`, positions 14 bits, UV 12 bits, normales 8 bits) | 1 049 264 | 187 372 | 148 589 |
| gltfpack + Meshopt (`-c`) | 386 948 | 100 953 | 95 328 |
| gltfpack + Meshopt (`-cc`) | 380 668 | 99 231 | 94 019 |
| glTF Transform : weld + Draco | 178 484 | 67 466 | 61 918 |

Même tendance sur les autres captures (modèles : 438 740 → 289 856 → 185 608 → 151 144 en Draco ; hauteur complète :
446 728 → 235 916 → 101 860 → 57 732).

Décodage (Node/Bun, parse compris, médiane) : Meshopt 8,6 ms sur le rayon 32, Draco 40,3 ms (5×) ; sur la capture
« modèles », 5,1 ms contre 8,5 ms. Les captures évoluant dans le viewer sont chargées par dizaines : le coût de
décodage s'additionne (cf. post-mortem des tuiles, point 2).

## Blender 5.2.2 (paquet Arch `/usr/bin/blender`)

| Variante | Import |
| --- | --- |
| Original (float32) | OK, 1 objet, 54 440 sommets |
| `KHR_mesh_quantization` | **OK**, mêmes 27 220 faces, rendu Cycles 560 × 480, 16 échantillons, graine 42 visuellement identique (écart de canal limité aux arêtes, dû à la quantification gltfpack 12 bits UV / 8 bits normales) |
| `EXT_meshopt_compression` | **ÉCHEC** : « Meshopt decoder library not found … libbf_intern_meshopt_bridge.so » (bibliothèque native absente de ce paquet) |

Conséquence : une extension de compression ne peut pas entrer dans le `capture.glb` local, ouvrable dans Blender
(leçon du post-mortem, point 5). Le support de Meshopt par d'autres builds de Blender n'est pas établi ici ; une
recherche web n'a pas fourni de source primaire. Seule la mesure locale fait foi.

## Décisions

1. **Deux niveaux**, comme proposé dans l'issue : le fichier local/téléversé reste du glTF 2.0 autonome, avec au plus
   `KHR_mesh_quantization` (importé par Blender, déjà accepté par `validateSelfContainedGlb`) ; la compression
   Meshopt est réservée à un **dérivé de diffusion produit côté API**, l'original restant téléchargeable.
2. **Meshopt, pas Draco** pour le dérivé : 4 à 5× plus rapide à décoder, déjà fourni par three.js
   (`MeshoptDecoder`, `meshoptimizer` est déjà installé comme dépendance transitive), et il conserve l'ordre des
   triangles, donc les plages de triangles par chunk (Draco réordonne). Draco est plus petit (gzip 67 Kio contre
   99 Kio) mais ce gain ne justifie ni le décodeur supplémentaire ni la perte des plages ; réexaminable si le
   stockage devient le facteur dominant.
3. **KTX2/BasisU abandonné pour l'instant** : la VRAM mesurée est de 2–3 Mio par capture ; le risque de flou sur le
   pixel art n'est pas justifié. Le gain se réévaluera si une capture dépasse plusieurs dizaines de Mio de textures.
4. **Métadonnées dans `extras` glTF** (JSON libre importé par Blender comme propriétés personnalisées), pas
   `EXT_structural_metadata`/`EXT_mesh_features` : ces extensions ne sont pas importées par Blender et alourdissent
   le fichier sans bénéfice pour le viewer.
5. **Pas de KHR_texture_basisu, pas de greedy meshing, pas de LOD, pas de tuiles** à ce stade (phase 6 conditionnelle).

Les points de format détaillés (échelle de quantification, normales, nœuds par catégorie, plages de chunks) sont
fixés dans `docs/features/glb-size.md` au moment où chaque phase les implémente.

## Suite (phase 4)

La variante Meshopt est implémentée comme **variante de transport à la demande**, sans stockage durable : voir
`docs/features/glb-derivative.md` (stockage, quota, durée de vie, mesures, limites).
