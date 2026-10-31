# Vue d’un monde : toutes ses captures composées chunk par chunk

Remplace le lecteur « Évolution » par zone (une série par `zoneId`) et la tentative de tuiles du 27 octobre
(voir `docs/concepts/tiles-evolution-postmortem.md`). C'est le viewer normal d'un monde, pas un mode à part : l'interface ne parle donc pas de « monde évolutif ».
Chaque monde n'a plus qu'**une vue** : toutes ses
captures identifiées sont chargées dans la même scène et la pellicule de gauche fait évoluer le monde de la plus
ancienne capture à la plus récente.

## Principe : rien ne change dans le mod ni dans le format

Le bilan de la tentative précédente montrait que découper côté mod (tuiles alignées, bundle `.mmtiles`) agrandissait
les captures, effaçait du terrain avec des tuiles partielles et cassait Blender. Ici :

- le mod, le `.glb`, l'envoi et les valeurs par défaut sont **inchangés** ; toutes les captures déjà identifiées
  (`worldId`, `captureBounds`, `captureOrigin`) en profitent immédiatement, AFK comme manuelles ou sélections ;
- la composition est faite **dans le navigateur**, à partir des bornes exactes déjà présentes dans les métadonnées.

## Règle de composition

À l'étape `n`, chaque bloc affiche la capture **la plus récente ≤ n** qui le contient, parmi les captures qui ont
réellement de la géométrie dans sa colonne de chunk (16 × 16, coordonnées absolues).

- Chaque triangle est rattaché au bloc qui le possède : centroïde poussé de 1/64 de bloc contre sa normale, puis
  coordonnées absolues (`origine de la capture + position locale`). Une face posée sur une frontière de chunk
  appartient donc au bon chunk.
- Une capture plus récente ne masque l'ancienne que **dans ses bornes exactes** (pas d'alignement, pas de
  zone agrandie) et **seulement dans les chunks où elle a de la géométrie** : un chunk non chargé au moment de la
  capture ne crée jamais de trou, l'ancien contenu reste.
- Les bornes verticales comptent : une capture moins profonde laisse visibles les grottes plus anciennes en dessous.
- Les lumières ponctuelles suivent la même règle.

`apps/web/src/lib/world-evolution.ts` implémente ce modèle sans dépendance à Three.js (tests à 100 %).

## Optimisations

| Point | Choix |
| --- | --- |
| Transfert | Les routes de fichier (privée, partagée, publique) compressent en GZIP niveau 4 **en flux** quand le client l'accepte ; aucune capture n'est mise en mémoire entière. Mesuré : ~7,7× moins d'octets sur des GLB du writer réel. |
| Ordre | Téléchargements du plus ancien au plus récent, 3 en parallèle ; un seul décodage/attache à la fois pour ne pas bloquer le fil principal. La première capture s'affiche dès qu'elle est prête. |
| Budget | 256 captures et 768 Mio décompressés au plus ; au-delà, les plus récentes sont gardées (l'état actuel du monde compte le plus) et la page le signale. L'API renvoie au plus 512 métadonnées par monde. |
| Composition | Triangles triés une fois par chunk au chargement ; chaque étape recopie des plages contiguës d'indices (test par triangle seulement dans les chunks partiellement recouverts). Une capture n'est recalculée que si l'ensemble de ses captures plus récentes visibles change. |
| GPU | Un seul tampon d'indices par primitive, réécrit sur la plage utile (`addUpdateRange`) ; une primitive vide est masquée (aucun draw call). Les captures entièrement recouvertes ne coûtent donc rien au rendu. |
| Textures | Une capture entièrement recouverte à l'étape affichée libère ses textures GPU ; Three.js les renvoie depuis les images conservées si elle redevient visible (vérifié dans Chromium en revenant à la première capture). Les positions déjà chargées sont lues sans copie. |
| Lumières | 12 lumières fixes partagées par toute la scène, mises à jour à chaque étape : pas de recompilation de shaders. |

## Mesures (27 octobre 2026)

GLB produits par le **vrai writer** `dev.minemories.core.GlbScene` (générateur de terrain synthétique, hors Git),
servis par une API locale (Bun/SQLite/filesystem) et ouverts dans Chromium headless avec SwiftShader (rendu CPU) :

- histoire de 6 captures (plaine, maison, tour à l'est, lac avec un chunk non chargé, sélection, ferme) :
  5,5 Mio, chargées en 5,2 s ; la vue de dessus calculée vérifie tour, lac, extension de la ferme et **l'absence
  de trou** sur le chunk non chargé ;
- 60 captures de rayon 32 qui se recouvrent : 73,4 Mio bruts, ~10 Mio transférés, chargées en 9,3 s ; tri
  initial ≈ 4,5 ms par capture, composition d'une étape ≤ 7,4 ms, 111 214 triangles visibles sur ~2,2 millions
  chargés.

Ces mesures ne remplacent pas une validation en jeu avec de vraies captures AFK et un GPU réel.

## Interface du viewer

- **Pellicule** à gauche, jumelle de la barre d'outils de droite (même verre, centrée verticalement, hauteur
  ajustée au contenu) ; elle fait partie du studio : elle s'efface au repos et disparaît en immersion (H) comme
  les autres contrôles. Contenu : vignette de chaque capture (image envoyée par le mod), heure, séparateur par jour,
  fil doré jusqu'à la capture affichée et captures futures grisées. L'état de chargement est une pastille sur la
  vignette (rotation pendant le chargement, rouge en échec avec bouton de nouvel essai, bleue si archivée ou
  hors budget) et une fine barre de progression tant que des captures arrivent. Un bouton lecture/pause en tête
  (1,8 s par capture, repart du début à la fin) ; ← → ou ↑ ↓ passent d'une capture à l'autre. Sur téléphone,
  la pellicule devient une bande horizontale. L'ancienne barre de transport est retirée.
- **Centrage** : le pivot de la caméra va sur le joueur enregistré dans la capture (`minemoriesPlayerPosition`),
  s'il se trouvait dans la capture ; sinon (anciennes captures, sélection faite à distance) sur la surface la plus
  haute au centre de la capture, jamais au milieu du volume ni dans le vide. « Recentrer » et le double-clic
  visent la capture affichée.
- **Transitions** : en changeant de capture, le pivot de la caméra glisse vers ce point de la capture affichée
  (1,1 s, l'angle et la distance sont conservés ; une interaction de l'utilisateur interrompt le glissement) et le
  soleil tourne par le chemin le plus court jusqu'à l'heure de la capture (1,6 s). `prefers-reduced-motion`
  rend les deux instantanés.
- **Zoom** : la molette ne déplace plus le pivot vers le curseur (`zoomToCursor` désactivé) ; seul le
  déplacement (pan) le déplace.
- **Pivot** : pendant une interaction, une ombre douce est posée sur la surface visible juste sous le pivot,
  reliée par un fil vertical ; elle s'élargit et pâlit avec la hauteur. La surface est mesurée par un lancer de
  rayon vers le bas sur les maillages visibles, au plus toutes les 120 ms et seulement quand le pivot bouge.

- **Pluie et neige** s'arrêtent au bloc le plus haut de chaque colonne, comme dans Minecraft : rien ne tombe sous
  un toit, un arbre ou un surplomb. La carte des hauteurs est calculée sur les triangles visibles, seulement
  quand la météo est active et après un changement de géométrie (nouvelle capture ou étape) ; le shader masque
  les gouttes et flocons sous cette hauteur.

## Galerie

Les serveurs/mondes forment une **grille de tuiles** (mosaïque des dernières vignettes, nombre de captures,
taille, dernière visite, seed). La tuile choisie affiche ses zones en dessous ; la plus récente est choisie par
défaut. Le crayon d'une tuile ouvre la **fiche du serveur** (feuille latérale) : nom modifiable, gardé dans ce
navigateur (`localStorage`) comme les noms de zone, avec un lien pour revenir au nom d'origine ; captures, taille,
première capture, dernière visite, dimensions, seed et liste des zones. Les zones ont un onglet **Détails**
(date, dimension, biome, position X/Y/Z, heure du jeu, météo, taille, seed) à côté de Partage, Publication et
Captures. Le **clic droit** (ou la touche menu du clavier) ouvre les actions d'une zone (voir, détails, partage,
publication, captures, renommer, corbeille) ou d'un serveur (ouvrir, détails, renommer), au pointeur, navigable
au clavier. Les cartes de zone affichent dimension
(pastille de couleur), biome lisible (`Snowy taiga`), coordonnées X/Y/Z, météo et taille sous forme de puces.
Les captures sans identité complète restent groupées par proximité. Une capture archivée est signalée dans la
pellicule et peut être restaurée en l'ouvrant seule.

## Limites connues et étapes suivantes

- La géométrie de toutes les captures chargées reste en mémoire GPU, même entièrement recouverte (les textures,
  elles, sont libérées).
- La taille brute de la géométrie domine (≈ 150 octets par quad). Pistes à mesurer avant tout changement de
  format : quantification (`KHR_mesh_quantization`, lisible par Blender), `EXT_meshopt_compression`, et un
  stockage des chunks inchangés par empreinte pour ne télécharger que ce qui a changé.
- Une capture plus récente peut garder ses parois de coupe (`CutBoundary`) face à une grotte plus ancienne voisine.
- Le contrat `timelapse.frames` (série par zone) reste servi par l'API mais n'est plus utilisé par le viewer.

## Passe « taste-skill » (31 octobre 2026)

La galerie et le viewer ont été revus avec le skill [taste-skill](https://github.com/Leonxlnx/taste-skill) en
mode écran d'application (`references/app-screens.md`), style `true-black-flat` tiré avec la palette et la
typographie de la marque conservées (`--keep palette,type`). Mesures de l'inspecteur du skill sur un instantané
statique de `/gallery` (1440, 768 et 390 px) :

| | Avant | Après |
| --- | --- | --- |
| Échecs | 4 (dégradé, ombre lourde, texte < 11 px, image externe) | 1 (avatar externe bloqué par le réseau du conteneur) |
| Alertes | 7 | 4, défendues ci-dessous |
| Titre | 52 px, accueil « Your memories, Alex. » sous un surtitre | 28 px, nom de l'écran et constat (captures, mondes, dernière visite) |

- Relief par paliers de luminosité, sans bordure ni ombre au repos ; la tuile choisie prend le motif du style
  (bordure 1,5 px de l'accent et teinte pâle).
- L'or ne sert qu'aux données et à la sélection ; une seule action principale inversée par écran, les autres
  actions sont des pilules discrètes ; chaque tuile ouvre son monde en un clic (« Open »).
- Plus de dégradés, de flou de verre, de surtitres ni de monospace hors code ; texte à 12–13 px minimum.
- Exceptions déclarées (`taste-skill-ignore`) : les pastilles de ciel et la piste de l'heure, qui montrent le
  ciel qu'elles sélectionnent.
- Alertes laissées : ombres des éléments qui flottent sur la 3D (barres, panneaux, menu, feuille) ; bordure de
  la barre de navigation du site (hors galerie) ; colonne secondaire d'appairage/stockage plus courte que la
  rangée de tuiles ; « crème » détecté sur l'encre de la marque (`#f2efdf`, une couleur de texte).
