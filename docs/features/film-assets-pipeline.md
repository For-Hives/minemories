# Pipeline d'assets du film d'accueil

Le film de la page `/` ([landing-film.md](landing-film.md)) lit six captures GLB (`S0` à `S4`, `personnages`) de 1,3 Mo chacune. Cette pipeline les transforme **sans perte** en assets optimisés, hachés, accompagnés d'un manifeste, et vérifie à chaque exécution que rien n'a changé de ce que le moteur voit. Le résultat est un dossier de fichiers statiques et un `manifest.json` : il ne dépend d'aucun framework (la stack du site peut changer, le navigateur n'a besoin que du manifeste et de `lib/capture-delta.ts`).

Conception et mesures de départ : piste `three-diet` du banc de stacks (28/10/2026, hors dépôt). Tout ce qui est décrit ici comme « retenu » a été **prouvé identique** (données décodées et pixels du canvas) ; tout ce qui changeait un pixel est écarté.

## Commandes

| Commande | Effet |
|---|---|
| `bun run hero:assets` | Lit `apps/web/public/hero/captures/*.glb`, reconstruit, prouve, écrit `apps/web/public/hero/captures-opt/` (fichiers hachés, `.br`, `.gz`, `manifest.json`, `report.json`). ~20 s. Échoue si le budget d'octets est dépassé. |
| `bun run hero:assets --check` | Mêmes calculs en mémoire, **n'écrit rien**. Échoue si le dossier généré existe et diffère de ce que donnent les sources (les `.br` et `.gz` sont comparés par leur contenu décompressé), ou si le budget est dépassé. Lancé après `hero:assets` dans les scripts `build`. |
| `bun run hero:assets --inventory` | Inventaire JSON des captures brutes (octets de géométrie et de textures, sommets, primitives, images, images partagées entre fichiers). |
| `bun run hero:assets --update-budget` | Réécrit les valeurs de référence de `scripts/hero-assets/budget.json` (acte volontaire, à relire en PR). |
| `bun run hero:check` | Tests de la pipeline puis `--check` ; fait partie de `bun check`. |

`bun run hero:assets` puis `hero:assets --check` sont aussi lancés par le script `build` de `@minemories/web` (donc par Railpack) et par `bun run build` avant le bundle. En développement (`bun web:dev`), le dossier généré n'existe pas tant que la commande n'a pas été lancée : le film télécharge alors les GLB bruts, comme avant.

Dépendances de développement ajoutées à la racine (versions exactes, aucun binaire téléchargé) : `meshoptimizer` (déjà dans `bun.lock` via `@types/three`), `@jsquash/oxipng` (oxipng en WASM, + `wasm-feature-detect`) et `pngjs` (décodeur PNG de la preuve) ; `wasm-feature-detect` n'est pas déclaré : c'est la dépendance propre d'oxipng (il l'importe), donc nécessaire. `bun.lock` a été complété à la main pour ces trois entrées (Bun 1.3.14 local ne lit pas ce format de verrou) : c'est `bun install --frozen-lockfile` de la CI qui le valide.

## Ce que fait la pipeline

Code : `scripts/hero-assets/` (Node, ESM). Configuration : `config.json` (liste des captures, rôle, priorité, base), `budget.json`.

1. **Inventaire** (`inventory.mjs`).
2. **Reconstruction** (`rebuild.mjs`), au niveau du conteneur GLB, sans Blender ni aller-retour par un graphe de scène : chaque flux de sommets meshopt est décodé puis ré-encodé avec le codec courant de `meshoptimizer` (flux version 1, plus petit) ; chaque PNG passe par oxipng niveau 6 (`optimiseAlpha: false`, entrelacement désactivé) ; les flux d'indices, le JSON (matériaux, nœuds, lumières, échantillonneurs, ordre des primitives) et la disposition des vues ne sont pas touchés. Le flux version 1 n'est légal que sous le nom `KHR_meshopt_compression` : l'extension est renommée (texte du JSON uniquement), `GLTFLoader` de three l'enregistre sous les deux noms.
3. **Preuve** (`equivalence.mjs`), par un décodeur **indépendant** de celui qui a reconstruit (le décodeur meshopt de three lui-même) : le JSON est égal (aux décalages et au renommage près), chaque flux compressé (positions, normales, UV, indices : tous) se décode en octets identiques, chaque image est soit les mêmes octets, soit les mêmes pixels RGBA avec les mêmes blocs de colorimétrie (`gAMA`, `cHRM`, `sRGB`, `iCCP`, `cICP` : présence **et contenu** identiques). Une seule différence fait échouer la commande ; des tests injectent un sommet déplacé, une texture teintée, un matériau renommé.
4. **Delta des stades** (`delta.mjs`) : `S1` à `S4` et `personnages` sont encodés comme une suite « copier depuis `S0` / ajouter des octets » contre le `S0` reconstruit. Un delta commence par un octet de version (`DELTA_VERSION`, 1) : un format futur est refusé par les anciens clients, qui retombent sur le GLB plein. Chaque delta est rejoué avec **l'applicateur qui part en production** (`apps/web/src/lib/capture-delta.ts`, importé tel quel par Node) et comparé octet pour octet.
5. **Compression de livraison** : brotli niveau 11 (fenêtre 16 Mo) et gzip 9, un fichier `.br` et un `.gz` à côté de chaque asset.
6. **Hachage et manifeste** : les fichiers sont nommés `<nom>.<10 premiers hex du SHA-256>.glb|patch` ; `manifest.json` donne, par nom logique, le fichier, `kind` (`base` ou `delta`), `base`, `size` et `sha256` du GLB reconstruit, `priority`. `report.json` (inventaire, octets bruts/gzip/brotli, empreintes des sources, preuve) sert la CI et cette page. Mêmes sources, mêmes octets : vérifié par un test unitaire et par `--check` qui regénère et compare, sur une seule machine (Linux, Node 24.15, `meshoptimizer` 1.1.1, `@jsquash/oxipng` 2.3.0) ; rien ne prouve que brotli ou oxipng donnent les mêmes octets sur une autre version ou plate-forme, c'est pourquoi `--check` compare les copies `.br`/`.gz` à ce qu'elles décompressent et non à leurs octets.

### Où vont les fichiers générés

`apps/web/public/hero/captures-opt/`, **ignoré par git et généré au build**. Choix : les captures brutes restent la source versionnée (`public/hero/captures/`, repli du film) ; committer en plus 700 Ko de binaires dérivés alourdirait l'historique à chaque régénération (la sortie change dès qu'une capture ou un outil change) et ne prouverait rien que `--check` ne prouve mieux. Le coût est un build plus long de ~20 s et la dépendance du build aux paquets d'outils verrouillés. Pour changer de décision (versionner la sortie), retirer la ligne de `.gitignore` : `--check` compare alors le dossier committé aux sources.

## Côté navigateur

`apps/web/src/lib/capture-delta.ts` (module pur, couverture 100 % lignes, branches, fonctions) :

- `loadCaptureManifest` : télécharge et valide le manifeste ; toute anomalie donne `null`.
- `createGlbFetcher` : télécharge la base une seule fois, reconstruit chaque stade depuis son delta (`applyDelta`), vérifie la taille puis le SHA-256 (si `crypto.subtle` existe : origines sécurisées), et **retombe sur le GLB plein** (`/hero/captures/<nom>.glb`) à la moindre erreur : manifeste absent ou invalide, delta absent, tronqué, de mauvaise taille ou de mauvais hachage, base indisponible. Un serveur qui répond une page HTML en 200 pour un fichier manquant est ainsi sans effet (la taille ne correspond pas).
- Les deltas sont demandés avec `fetch(…, { priority: 'low' })`.
- Entrées bornées : `applyDelta` refuse une version inconnue, un nombre d'opérations impossible, une opération vide hors dernière, une copie hors de la base, et reçoit la taille attendue (`size` du manifeste) qu'il vérifie **avant** d'allouer ; une réponse annonçant ou dépassant plus que la taille attendue (+ 64 octets de table pour un delta) est refusée ; le manifeste n'accepte que des noms `<nom>.<10 hex>.glb|patch`, sans prototype.
- **Un repli n'est jamais silencieux** : chaque repli (manifeste absent, delta refusé…) fait un `console.warn('[hero-assets] fallback', nom, raison)` et incrémente `window.__hero.captureFallbacks` (`{ count, last }`). Le harnais d'identité lit ce compteur (0 attendu) en plus des requêtes réseau.
- Un échec de téléchargement d'une base est retenu pour la session (pas de nouvelle tentative à chaque stade) ; les bases sont mises en cache par fichier.

`HeroFilm.tsx` demande le manifeste **en même temps** que le morceau JavaScript du film (pas d'aller-retour de plus avant `S0`) et passe le chargeur à `mountHero({ fetchGlb })`. Dans `scene.js` (module vendorisé), seuls trois points sont touchés, repérés par « hero-assets anchor » : la variable `glbFetcher`, la première ligne de `fetchGlb`, l'option `fetchGlb` de `mount()`. `scene-anchor.test.js` échoue si une resynchronisation avec le prototype les efface.

Ordre de chargement : `S0` d'abord (image 1 du film) ; `S1` à `S4` partent quand le film atteint 4 s (ou après 2,5 s), l'option `preload: 'auto'` existante, donc bien avant ~28,8 s de film, un stade à la fois et à basse priorité. `personnages` n'est lu que si les PNG des personnages échouent (voie de repli du film) : priorité `low`. Le poster est inchangé.

## Leviers retenus et écartés

| Levier | Statut | Raison / mesure (S0) |
|---|---|---|
| Flux de sommets ré-encodés (codec v1) | **retenu** | -13,5 Ko en brotli ; décodé identique ; renommage `KHR_` (réserve ci-dessous) |
| PNG recompressés sans perte (oxipng) | **retenu** | -14,8 Ko en brotli ; mêmes pixels RGBA et mêmes blocs de colorimétrie |
| Delta des stades contre `S0` | **retenu** | S1..S4 : 524 Ko (fichiers pleins reconstruits) -> 183 Ko en brotli ; sans état, indépendant de l'ordre de chargement |
| brotli 11 précompressé | **retenu** | -13 % sur le JS, -17 % sur les GLB par rapport à gzip (si le serveur le sert, voir « Serveur ») |
| Hachage de contenu | **retenu** | permet `immutable` sur les captures |
| Quantification des positions sur la grille 1/16 | écarté | **faux** : 10,65 % des composantes de `S0` sont hors grille (herbe, fougères, bûches : décalages aléatoires) ; et le film lit `geometry.attributes.position.array` en flottants monde |
| Filtre exponentiel de meshopt | écarté | 22 000 à 47 000 composantes différentes après décodage : pas identique |
| Fusion de primitives | écarté | 137 matériaux aux noms uniques, aucune paire de primitives n'en partage un ; fusionner exige un atlas, qui casse `NEAREST`/`REPEAT` et l'ordre de dessin |
| KTX2 / Basis | écarté | transcodage avec perte, pas identique avec `NEAREST` |
| Réordonner les sommets (`reorder`) | écarté | change l'ordre de dessin et le motif d'indices ; gain incertain |
| Décodeur meshopt SIMD seul | écarté du build | -2 Ko gzip, mais casse les navigateurs sans WASM SIMD |
| Compression Dictionary Transport (S0 en dictionnaire) | écarté | -49 Ko de mieux que le delta mais Chromium seulement ; le delta d'octets marche partout |
| Delta enchaîné (S2 contre S1…) | écarté | -22 Ko seulement, dépend de l'ordre de chargement |
| Blender / gltf-transform | écarté | la reconstruction se fait au niveau du conteneur : le JSON et l'ordre des vues restent ceux de la source (gltf-transform les réécrit), et il n'y a pas de dépendance de plus |
| Recompression des posters JPEG | non fait | pas d'outil sans perte déjà présent (`jpegtran`, `mozjpeg`) : télécharger un binaire est exclu |
| Leviers JS de la piste `three-diet` (catalogue i18n, retrait de code de three, CSS) | hors périmètre | autre chantier : cette pipeline ne traite que les assets |

## Budget d'octets

`scripts/hero-assets/budget.json` garde les valeurs mesurées ; chaque métrique échoue à **valeur + 3 %** (`marginPercent`). Métriques : `baseBrotli` (S0), `deltasBrotli` (S1..S4), `stagesBrotli` (S0..S4), `stagesGzip`, `charactersBrotli`. Un ajout de métrique sans valeur de référence échoue aussi. Un dépassement **échoue** même pendant la génération (pas un simple avertissement) : le même code tourne dans la CI et dans le build de déploiement, et une régression de poids ne doit pas arriver en production sans relecture ; la sortie de secours est `--update-budget`, visible dans le diff de la PR. Après un changement volontaire (nouvelle capture, mise à jour d'un outil) : `bun run hero:assets --update-budget` et relire le diff du fichier en PR.

Garde-fous réels de la CI : tests unitaires de la pipeline, preuve de décodage (à chaque génération et à chaque `--check`), budget, déterminisme. La comparaison « dossier généré = sources » de `--check` ne joue que lorsque le dossier existe (après `bun run hero:assets`, ou sur un poste de dev) : sur une CI fraîche il n'existe pas, `--check` le dit et ne compare rien.

## Ajouter une capture

1. Copier `NOM.glb` (et `NOM.json`) dans `apps/web/public/hero/captures/`.
2. Ajouter une entrée à `scripts/hero-assets/config.json` : `name`, `role` (`stage` ou `characters`), `priority`, et **`delta: true`** : seule la base (`S0`, champ `base`) peut être livrée en fichier plein, la pipeline refuse une seconde entrée sans `delta` (un delta se calcule contre une base unique). Un delta ne vaut que si la capture ressemble à `S0` : vérifier la taille dans `report.json`.
3. `bun run hero:assets --update-budget`, relire `budget.json`, puis `bun run hero:check`.
4. Côté film : ajouter le nom à `STAGE_NAMES` de `scene.js` s'il s'agit d'un stade ; le chargeur lit le manifeste, rien d'autre à brancher.
5. Toute capture neuve exige quand même la validation visuelle de `docs/concepts/development-workflow.md` (Minecraft ou Blender) : les tests ne la remplacent pas.

## Serveur

Constat sur la production actuelle (29/10/2026, `curl -I`) : `nginx/1.31.8` répond **sans `Cache-Control`** (ni sur `/assets/*.js`, ni sur `/hero/…`), **sans `X-Robots-Tag`**, avec des `ETag`/`Last-Modified` et le type `application/octet-stream` pour les `.glb`, en gzip même quand le client accepte brotli, et **répond 200 pour des chemins inexistants** (`/hero/captures-opt/manifest.json` avant déploiement). `deploy/nginx.web.conf` répond 404 pour un fichier absent, pose `Cache-Control` et `X-Robots-Tag` avec `always` : ce fichier **n'est donc pas appliqué** par ce déploiement. Cause probable : le site est déployé comme « site statique » par Coolify, dont le nginx par défaut sert `apps/web/dist` sans le fichier du dépôt ; `coolify-railpack.md` demande de l'appliquer « ou ses locations dans le Nginx existant », ce qui est une étape manuelle dans Coolify, vraisemblablement jamais faite. Rien n'a été modifié côté Coolify ; à faire : coller la configuration de `deploy/nginx.web.conf` dans la configuration nginx personnalisée de l'application, ou construire une image avec ce fichier. Sans cela, les captures s'envoient en gzip à la volée, sans cache durable.

Ce que la configuration du dépôt fait maintenant :

- `/hero/captures-opt/*.glb` et `*.patch` : `Cache-Control: public, max-age=31536000, immutable`, type MIME fixé (`model/gltf-binary`, `application/octet-stream` pour les deltas), `X-Robots-Tag` répété (un `add_header` de location remplace ceux du serveur).
- `/hero/captures-opt/manifest.json` : `Cache-Control: no-cache` (revalidation par ETag), **jamais immuable** : le dossier est vidé à chaque build, un manifeste gardé un jour pointerait vers des hachages supprimés et tous les visiteurs récurrents recevraient les GLB pleins.
- `/hero/` (non haché) : un jour + `stale-while-revalidate`, inchangé.
- `gzip_static on` (module standard de nginx : sert le `.gz` précalculé), `gzip_vary on`, `gzip_types` (`model/gltf-binary` et `application/octet-stream` compris, pour la compression à la volée des fichiers sans `.gz`). Ces directives sont **dans `server {}`**, pas au niveau `http` : si le nginx hôte active déjà `gzip` dans son `nginx.conf`, une seconde déclaration au même niveau fait échouer `nginx -t` (« "gzip" directive is duplicate »). Les règles de cache immuable ne visent que `\.[0-9a-f]{10}\.(glb|patch)$` (regex entre guillemets : sinon les accolades sont de la syntaxe nginx).
- `brotli_static on` est **commenté** : il demande le module `ngx_brotli`, absent de l'image nginx standard ; sans le module, nginx refuse de démarrer sur une directive inconnue. Les fichiers `.br` produits (321 Ko au lieu de 375 Ko pour les captures) ne servent qu'avec ce module ou derrière un CDN qui lit les `.br`.
- Cette configuration n'a pas été exécutée dans un nginx réel (ni binaire ni image nginx sur ce poste, et aucune image n'a été téléchargée) : `nginx -t` au premier montage, y compris avec un `nginx.conf` hôte qui active déjà gzip.

## Résultats mesurés

Mesures du 29/10/2026 sur ce poste (Chromium 153, GPU réel `--use-angle=gl`, `apps/web/dist` servi en local contre la landing en ligne `https://minemories.xenos.lightin.io/`). Les « octets sur le fil » viennent de CDP (`encodedDataLength`). Deux colonnes pour le candidat : **gzip à la volée** (ce que la production actuelle ferait de ces fichiers : nginx standard sans module brotli) et **brotli précompressé** (avec `brotli_static`, ou un CDN qui sert les `.br`). Ne pas lire le chiffre brotli comme le résultat de la production tant que le serveur n'a pas changé.

| Octets sur le fil (captures GLB de `/`, 1440 px) | Landing en ligne | Candidat, gzip à la volée | Candidat, brotli précompressé |
|---|---|---|---|
| `S0` (première image) | 217 045 | 169 232 | **138 325** |
| `S1` à `S4` | 829 812 (gzip, 4 GLB pleins) | 210 651 (4 deltas) | **183 590** (4 deltas) |
| Total GLB + deltas | 1 046 857 | **379 883** (-63,7 %) | **321 915** (-69,2 %) |
| Manifeste (`manifest.json`) | n/a | 752 | 752 |
| Page `/` en entier, 390 px | 1 940 891 | 1 201 838 (-38 %) | 1 143 870 (-41 %) |
| Page `/` en entier, 1440 px | 2 113 818 | 1 374 538 (-35 %) | 1 316 570 (-38 %) |

Le total de la page garde ~0,75 Mo de JavaScript, de polices et d'images que cette pipeline ne touche pas.

Temps (harnais commun du banc, 2 répétitions, médiane ; machine partagée, donc indicatif) : film prêt (`readyAt`) à 390 px, CPU x4, 4G lente : **9,4 s -> 8,6 à 8,8 s** ; à 1440 px sans bridage : **2,28 s -> 1,85 à 1,93 s**. Le LCP n'est pas modifié (le poster ne change pas).

Si le serveur de production reste en gzip, le gain réel est de **-64 % sur les captures** ; il passe à -69 % avec brotli.

Octets reconstruits (`bun run hero:assets`, sans compression de transport) : `S0` 1 334 540 -> 1 027 996 octets (la reconstruction seule), `S1`..`S4` et `personnages` en deltas de 31 à 134 Ko bruts. Détail par capture dans `report.json`. Budget actuel : voir `budget.json` (S0 138 060 ; deltas 182 460 ; S0..S4 320 520 en brotli).

### Identité visuelle (journal)

Un seul lancement de Chromium, graine aléatoire fixe, `?autoplay=0&q=high`, horloge pilotée par `window.__hero.goto(t)`, canvas seul (interface masquée), la landing en ligne et le candidat dans le même lancement, 390 et 1440 px. Instants : 10,6 / 30,8 / 51,8 s (canoniques) et 21 autres couvrant les cinq stades (carte de la landing : S0 1-31 s, S1 32-33, S2 34-35, S3 36, S4 37-43, S2 44, S0 45-58), soit 24 instants par largeur. Les journaux des requêtes du candidat prouvent que la voie « delta » a réellement servi (un `S0.<hash>.glb`, quatre `.patch`, **aucune** requête sur `/hero/captures/S0..S4.glb`) : sans cela un 0 px ne prouverait rien, puisque les GLB bruts sont ceux de la landing.

| Largeur | Instants canoniques | 24 instants | Pixels écartés de plus d'un niveau | Stades affichés identiques |
|---|---|---|---|---|
| 390 px | **0 px** | 4 px (0,7 s : 2 ; 1,1 s : 1 ; 36 s : 1), 1 niveau de canal | 0 | oui (S0 à S4) |
| 1440 px | **0 px** | 12 px (1,1 s : 9 ; 36 s : 2 ; 44 s : 1), 1 niveau de canal | 0 | oui (S0 à S4) |

Seconde passe après les correctifs de relecture (même méthode, un lancement) : canonique 0 px aux deux largeurs, 24 instants 4 px (390) et 7 px (1440), aucun écart > 1 niveau, `window.__hero.captureFallbacks` = `{ count: 0 }` et mêmes requêtes (1 base hachée, 4 deltas, 0 GLB brut), y compris l'instant 36 s à 390 px (stade S3). Les rares pixels non nuls sont du bruit de rendu GPU d'un niveau de canal, aux mêmes instants que ceux relevés sur une landing comparée à elle-même (piste `three-diet`, `fidelity.md`). Le script de comparaison (`identity.cjs`, dérivé de `mega-fid.cjs` et `stages.cjs` de la piste) dépend de chemins locaux (Playwright du portfolio, Chromium en cache) et n'est pas dans le dépôt.

## Limites et réserves

- **`KHR_meshopt_compression`** : les flux version 1 exigent que `GLTFLoader` accepte ce nom. C'est le cas de three 0.186 (vérifié à chaque génération par `assertThreeAcceptsKhrMeshopt`, qui échoue si une montée de version retire l'un des deux noms) ; un autre lecteur de ces fichiers (outil externe, décodeur meshopt plus ancien que 0.23) pourrait les refuser. Les captures brutes, elles, restent en `EXT_`.
- **Delta contre `S0`** : un stade ne se charge pas seul (il lui faut `S0`, toujours chargé en premier) ; tout échec retombe sur le GLB plein.
- **Posters JPEG** (197, 120 et 47 Ko) non recompressés.
- **Identité** : la comparaison de pixels est faite dans Chromium avec GPU réel (voir le journal ci-dessous) ; un écart d'un niveau de canal sur quelques pixels à 1440 px est le bruit du rendu GPU, présent aussi entre deux chargements de la même page. Safari et Firefox n'ont pas été testés.
- Les mesures de temps sont indicatives (machine partagée).
