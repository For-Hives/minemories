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
