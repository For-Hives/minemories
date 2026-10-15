# Règles de développement

## Commandes de référence

- `bun install --frozen-lockfile`: installe exactement les versions enregistrées dans `bun.lock`.
- `bun format`: applique le formatage Biome aux fichiers web et scripts.
- `bun mod:check`: applique Spotless puis lance `check` Gradle. `bun mod:check:ci` vérifie sans modifier les sources.
- `bun check`: Biome, vérification TypeScript, Vitest avec seuil de couverture, puis `check` Gradle dans `mod/minemories/` (Spotless, SpotBugs, JUnit et seuils JaCoCo).
- `bun api:check`: Biome, vérification TypeScript puis tests Bun de l'API. Les tests utilisent une base SQLite et un stockage temporaires isolés.
- `bun run build`: exécute les contrôles du dépôt, produit le viewer, puis construit le mod et le core.

## Boucle courte pour le mod

Depuis la racine du dépôt, avec JDK 21 :

```sh
bun mod:dev
```

Cette commande lance la tâche Gradle `:neoforge:runClient` du POC NeoForge directement à partir des classes compilées. Gradle réutilise ses caches et ne construit pas le JAR de distribution ni les applications web. Au premier lancement il doit télécharger Minecraft et NeoForge, donc il sera plus long. Les suivants recompilent les sources modifiées. Le profil de développement est dans `mod/minemories/run/` (ignoré par Git) : il garde les options, ressources et mondes de test d'un lancement à l'autre. Ne copie pas le dossier de sauvegardes réel pour tester.

Dans le client de développement, ouvre un monde puis le menu pause : le bouton **Minemories** permet de capturer autour du joueur, d'exporter une sélection déjà définie par commandes, d'entrer le code d'appairage du web et d'envoyer le GLB manuellement. Un bouton identique est ajouté à l'écran des options, et la touche **M** (rebindable dans Contrôles) ouvre l'interface depuis n'importe quel écran, y compris les menus remplacés par FancyMenu/FTB/BHMenu. Vérifie visuellement le menu avec plusieurs boutons ajoutés par d'autres mods, à petite échelle GUI, la touche M quand aucune place ne reste, le retour au jeu, l'état des boutons, l'échec d'un code invalide et le fichier `~/export/capture.glb` après capture. Démarre `bun api:dev` et `bun web:dev`, puis règle l’API du mod sur `http://localhost:3001` dans le mode avancé pour exercer l’appairage et l’envoi ; les contrôles Java seuls ne couvrent pas ces interactions.

Chaque upload joint les coordonnées du joueur, la dimension, le biome, l'heure du monde, la météo, le nom du monde ou du serveur, et la miniature disponible. La seed est envoyée uniquement en solo, car le client ne la connaît pas sur les serveurs distants. Les métadonnées sont conservées avec la capture et affichées dans la galerie ; les anciennes captures sans métadonnées restent compatibles.

Pour reproduire un problème de modpack, place seulement les JARs requis et compatibles **Minecraft 1.21.1 / NeoForge 21.1.248** dans `mod/minemories/run/mods/`, puis copie les fichiers de configuration nécessaires dans `mod/minemories/run/config/`. Commence avec le client vierge, puis ajoute les dépendances utiles au cas testé ; un modpack complet peut réintroduire son temps de démarrage. Un changement de Java nécessite un redémarrage du client pour une validation fiable. Pour inspecter vite la sérialisation GLB sans lancer Minecraft :

```sh
cd mod/minemories
./gradlew :core:test --tests "dev.minemories.core.GlbSceneTest"
./gradlew spotlessCheck
```

Sur Windows, utilise `gradlew.bat` à la place de `./gradlew`. `spotlessApply` formate le Java ; `spotlessCheck` vérifie sans modifier. Pour le test d'intégration final : `./gradlew build`, puis exercice en jeu et inspection du GLB dans Blender ou le viewer. Les raccourcis ne changent pas les cibles supportées (voir [Support des loaders](../features/loader-support.md)).

## Politique de changement

1. Chaque correction de logique reproductible reçoit un test au niveau le plus bas qui l’exerce; privilégier `mod/minemories/core` pour la logique indépendante du jeu.
2. Aucun avertissement SpotBugs n’est ignoré globalement. Les suppressions doivent être localisées, justifiées et accompagnées d’un commentaire.
3. La couverture Java minimale du core est de 90 % des lignes et 60 % des branches. Les utilitaires TypeScript couverts par Vitest restent à 100 %.
4. Les changements des formats GLB, des textures, de la sélection ou du rendu ont aussi besoin d’une validation visuelle documentée : les tests unitaires ne remplacent pas Blender ou une session Minecraft.
5. Les dépendances web sont installées depuis la racine, verrouillées dans `bun.lock`, et mises à jour volontairement. Les versions de plugins et outils Gradle restent explicites.
6. Une fonctionnalité ne se déclare compatible qu’avec les loaders/version réellement compilés et essayés.

La CI GitHub exécute `bun run build` sur chaque pull request et chaque push vers `main`. Les protections de branche doivent exiger ce statut avant fusion.

Le wrapper Gradle utilise la version 9.8.1 et vérifie le SHA-256 officiel de la distribution avant son installation. Le JAR du wrapper mis à jour a aussi été comparé à l’empreinte publiée par Gradle. Foojay Resolver 1.0.0 reste compatible avec cette version. Le développement local et le jeu utilisent toujours Java 21 ; les toolchains de `:core` et `:neoforge` ciblent explicitement Java 21. Les prérequis officiels sont décrits dans la [matrice Gradle](https://docs.gradle.org/current/userguide/compatibility.html) et le [README Foojay](https://github.com/gradle/foojay-toolchains/blob/main/README.md).

En CI, `setup-java` installe Java 21 puis Java 25 : le dernier exécute Gradle, tandis que `JAVA_HOME_21_X64` expose explicitement le JDK de compilation et de test du mod. Cette séparation ne change ni les prérequis d’installation du joueur ni le développement local sous Java 21. Voir les [installations multiples de setup-java](https://github.com/actions/setup-java/blob/main/README.md#multiple-jdks-and-maven-toolchains) et les [emplacements de toolchains Gradle](https://docs.gradle.org/current/userguide/toolchains.html#sec:custom_loc).

Le mod affiche encore des avertissements de dépréciation provenant des APIs Minecraft/NeoForge de la cible 1.21.1. Ils restent visibles dans le build; le core neutre, lui, traite tout avertissement javac comme une erreur. Migrer ces hooks nécessite une validation en jeu, donc ne pas masquer la sortie javac ni remplacer une API sans exercice du mod.

## Galerie et ambiance du viewer

Le site utilise un thème sombre. La galerie affiche chaque monde/serveur comme un dossier replié par défaut façon liste de serveurs Minecraft : icône 64 px (miniature de la capture la plus récente), nom et MOTD (`N captures · Seed … · last visit …`). Les captures solo sont regroupées par nom de monde et seed, les multijoueur par nom de serveur. Les anciennes captures sans ces informations restent dans « Other captures ». Deux serveurs enregistrés sous le même nom sont regroupés ensemble tant qu'aucun identifiant de serveur n'est disponible. Dans un même monde, les captures distantes de moins de 64 blocs horizontalement sont empilées visuellement (« Same area · N captures · Near x, y, z ») pour montrer qu'il s'agit de la même zone. Chaque carte affiche un aperçu du modèle 3D lui-même : à la première ouverture d'une capture sans miniature, le viewer rend la scène (400×250 JPEG, recadrage cover sans étirement, downscale haute qualité) et la persiste via `memories.setThumbnail`. L'icône du monde/serveur envoyée par le mod reste affichée sur le dossier (`metadata.icon`) : l'upload range l'image du mod dans `icon` et laisse `thumbnail` vide, et les anciennes captures voient leur image promue en `icon` à leur prochaine ouverture. Les avatars utilisent les images de compte quand elles existent, sinon des pixel-art générés via DiceBear avec une seed hachée (aucun e-mail envoyé au CDN). Le bandeau « Your mod is paired » reste affiché tant qu'une snapshot date de moins de deux mois ; au-delà, la galerie propose de ré-appairer.

Le viewer propose quatre éclairages fixes (matin, midi, coucher du soleil, nuit). L'éclairage initial reprend l'heure capturée (`dayTime` en ticks converti en minutes) et le preset le plus proche est surligné. La skybox s'adapte à la dimension et au biome (`getAtmosphere`) : halo de braise fixe sans soleil ni étoiles dans le Nether, nuit étoilée violette fixe dans l'End, obscurité atténuée dans le deep dark, cycle jour/nuit classique ailleurs ; les teintes hémisphériques suivent la dimension. Les ombres sont filtrées en PCF doux, sur une carte de 2048 pixels. Les nuages continuent à avancer à 0,6 bloc/seconde vers +X pendant que l'éclairage reste fixe. La couche utilise le motif `assets/minecraft/textures/environment/clouds.png` de Minecraft Java 1.21.1 (copie locale dans `apps/web/public/textures/minecraft-clouds.png`), avec des cellules de 12 × 12 blocs et une épaisseur de 4 blocs. Le rendu place la couche au-dessus du modèle (`bounds.max.y + max(32, empreinteHorizontale × 1,6)`) avec un matériau non éclairé opaque façon « fast graphics », teinté par la lumière du jour ; l'opaque évite que les nuages se dessinent devant le feuillage transparent. Les coordonnées de la capture, la position caméra et un décalage déduit de la seed (hachage 0-255) décalent le motif ; l'heure enregistrée sert de point de départ reproductible au mouvement (`ticks * 0,03`). Le Minecraft vanilla utilise un motif indépendant de la seed et une horloge de rendu locale : le décalage par seed distingue les mondes sans prétendre à une synchronisation image par image. Les nuages sont masqués pour les dimensions autres que l'Overworld. Un GLB local sans métadonnées utilise une origine de secours (0,64,0).

`/minemories export` sans argument utilise un rayon horizontal de 128 blocs (8 chunks). Les boutons du menu utilisent le rayon configuré dans les réglages avancés, 32 blocs par défaut, avec une profondeur limitée aux visites locales par défaut (voir [réglages](../features/mod-distribution.md)). `/minemories export 16` réduit ce rayon à 16 blocs ; `/minemories export selection` exporte les coins sélectionnés. Le client ne force pas le chargement des chunks absents. Cette zone est beaucoup plus coûteuse que l'ancienne boîte de 8 blocs : l'export reste synchrone et peut suspendre momentanément l'affichage. Le nouveau client envoie les captures jusqu’à 200 MiB en morceaux reprenables de 4 MiB ; l’ancien endpoint conserve sa limite de 100 MiB. Voir [le protocole d’upload](../features/resumable-uploads.md).

Les snapshots se renomment depuis leur carte (80 caractères max) et les zones empilées depuis leur bandeau (stocké dans le navigateur). La corbeille (`deleted_at`, `purge_after`, listée via `memories.listTrash` avec `purgeAt`) garde les nouvelles snapshots 30 jours (`TRASH_RETENTION_MS`) avant purge au démarrage puis toutes les heures. La migration protège les anciennes échéances ; le site affiche l’échéance reçue de l’API. Voir [les délais de récupération](../features/trash-retention.md) et [les suppressions durables](../features/durable-deletions.md). Un lien de partage (`/share/:token`, jeton stocké haché, révocable) ouvre la snapshot en lecture seule sans compte via `/api/shared/:token` et `/file`.


### Tests des parcours web et API

Les tests React dans `apps/web/src/pages/interactions.test.tsx` utilisent jsdom : connexion,
inscription, rafraîchissement de galerie, états et annulation du polling d'appairage, choix
et erreurs de fichier local du viewer. Le moteur WebGL est remplacé par une fixture ; ces
cas ne valident pas le rendu 3D. La couverture à 100 % reste limitée aux utilitaires `src/lib`.

`apps/api/src/session-rpc.test.ts` crée de vraies sessions Better Auth et traverse les routes
HTTP/oRPC pour l'appairage, l'isolation entre comptes, les captures, les miniatures, le
partage, la corbeille, la restauration, la suppression et la déconnexion.

`storage-s3.test.ts` exerce le SDK S3 réel contre un serveur HTTP de test, y compris une
panne, le retry d'initialisation et les octets binaires. Pour vérifier un Garage réel, utiliser
un bucket de test dédié et les variables `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY` et `S3_REGION`, puis lancer :

```sh
RUN_GARAGE_INTEGRATION=1 bun test apps/api/src/storage-garage.test.ts
```

Sans cette variable, ce test est ignoré. `bun run api:garage` crée un Garage Docker jetable, exerce les sessions HTTP/oRPC,
l’appairage et l’envoi de 5 MiB par morceaux, la lecture et la suppression, puis une panne
réelle de Garage et une reprise dans un nouveau processus API. Le scénario vérifie
l’absence de doublon et les octets du GLB. Il supprime uniquement son projet Docker
`minemories-integration`. La CI exécute ce parcours après le build. La couverture API impose 90 % des lignes et 80 % des fonctions **dans chaque fichier**,
via `apps/api/bunfig.toml`, avec les reporters texte et LCOV. Le contrôle d’inventaire
`check-api-coverage.mjs` refuse un fichier source absent du rapport ; les tests, fixtures
et déclarations `.d.ts` sont exclus de cet inventaire. Un test négatif exécute le vrai Bun
sur une fixture dont la moyenne dépasse les seuils mais dont un fichier reste faible :
le processus doit échouer. Voir la [documentation Bun](https://bun.sh/docs/test/code-coverage).

### Modes et distribution

Le menu démarre en mode simple (connexion et capture/envoi). Le mode avancé présente le dossier local, l’API personnalisée, les exports locaux et l’AFK. L’AFK est actif par défaut (5 min d’inactivité / 4 h entre captures / rayon 32), y compris en pause et en arrière-plan ; une désactivation existante est conservée. Le mode simple propose le bouton AFK, et le sous-écran avancé les délais et le rayon. Voir [réglages et distribution](../features/mod-distribution.md). `runClient` déclare les sources de `:core` et de `:neoforge` comme un seul mod, pour retrouver en développement les mêmes classes que dans le JAR autonome.

Validation viewer du 10 octobre 2026 : ouverture locale du GLB réel de 189,6 MiB dans Chromium avec rendu du terrain et textures. Le parcours galerie affiche désormais le téléchargement avant le chargement 3D, annule les requêtes en quittant la page et donne priorité au souvenir demandé sur un ancien fichier local. La lecture authentifiée du même souvenir en production reste à confirmer.

Validation Three.js 0.186.1 du 11 octobre 2026 : `bun run build` passe sur la branche
rebasée, avec 82 tests API et 62 tests web. Le viewer local ouvre le GLB réel de
10 MiB (134 matériaux, 55 textures intégrées et 128 lumières importées, plafonnées
à 32 par le viewer) ; terrain, neige, végétation et sous-sol sont visibles après
la préparation. Le même fichier est importé et rendu dans Blender 5.2.2.
La première compilation des shaders est longue sur le navigateur de test ;
son profilage reste suivi dans [issue #74](https://github.com/For-Hives/minemories/issues/74). Les adaptations du
[guide de migration officiel](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
remplacent `PCFSoftShadowMap` par `PCFShadowMap` et appellent `super.dispose()`
dans les nuages, avec vérification de l’événement de libération. Le bundle viewer
mesure environ 656 kB minifiés / 166 kB gzip : le léger dépassement de
l’avertissement de 650 kB reste visible, sans modification du seuil.

Le chargement animé couvre désormais le téléchargement API, la lecture GLB, les textures et la compilation des shaders. Le viewer attend la préparation et le premier rendu avant de retirer cet état ; un test d’interaction vérifie la présence du spinner pendant ces phases. Le rendu d’une capture AFK réelle a été revérifié dans Chromium. Les demandes de limitation à la profondeur visitée et de fermeture terre/pierre des bordures sont détaillées dans les issues #7 et #8 ; la limitation de profondeur est implémentée et [validée par un parcours comparatif](../features/exploration-depth-validation.md), la fermeture des bordures est implémentée et validée ci-dessous.


Validation locale des coupes du 10 octobre 2026 : exports NeoForge sur une copie isolée
du monde de test, puis import/rendu Blender 5.2.2. Une capture de surface de 17 × 17
blocs mesure 5 blocs de haut et présente des côtés terre/pierre fermés, avec neige et
végétation préservées. Une capture avec historique profond mesure environ 60 blocs de
haut et referme les ouvertures de grottes sur les bords. Les visites sont persistées
après redémarrage ; le suivi actif est effectué à chaque tick pour enregistrer les
courtes descentes, avec un contrôle de rendu en pause. Les modèles déclarant des quads
sans direction de culling sont filtrés seulement lorsqu’ils coïncident avec la coupe.

Une fixture supplémentaire sur la copie isolée contient un bassin traversant le plan
de coupe, du verre, des feuilles et un escalier. L’export en pause conserve les matériaux
MASK (verre/feuilles), BLEND (eau) et le modèle non cubique de l’escalier. Six quads d’eau
sont présents sur la coupe est malgré l’eau voisine hors capture. Le rendu Blender de
cette capture de 17 × 17 × 5 blocs a été inspecté : pas de paroi opaque au-dessus du
fond du bassin, section terre/pierre fermée, transparence conservée.

### Studio du viewer — octobre 2026

Le viewer local, celui de la galerie et les liens partagés utilisent désormais la
même chaîne de rendu HDR : ACES, bloom modéré sur pyramide de résolutions, sortie
sRGB et FXAA. L’environnement de réflexion est généré localement depuis le ciel
(PMREM) et recalculé uniquement aux changements d’ambiance, jamais à chaque image.
Les surfaces transparentes reçoivent une rugosité plus faible ; ce sont des reflets
d’environnement, pas des reflets des objets voisins ni du ray tracing. Les textures
restent pixelisées de près, avec mipmaps interpolées et anisotropie plafonnée à 4.
Les lumières ponctuelles sont regroupées par cellules puis plafonnées à 12 ; les
ombres solaires de 2048 pixels sont mises à jour au changement d’éclairage/capture.
Aucun format GLB ni export Minecraft n’est modifié.

Les palettes désert/badlands/savane, neige/glace et jungle/marais complètent les
ambiances Nether, End et deep dark. Les réglages Limpide, Brume et Couvert sont des
variantes artistiques locales, sans pluie simulée ni modification du souvenir.
Le coucher du soleil vise 17 h 15 pour garder des ombres rasantes. L’ouverture des
captures très profondes vise leur surface, avec possibilité d’explorer les sous-sols
par déplacement de la caméra. Les nuages sont placés au-dessus du cadrage initial.

La qualité Auto démarre avec un DPR plafonné à 1,5 et diminue par paliers de 0,25
(jusqu’à 0,75) si plus de 100 des 180 images mesurées dépassent 26 ms. Le bloom est
coupé à DPR <= 1 dans ce cas. Le mode Cinéma autorise DPR 2 ; Économie force DPR 1
sans bloom. Le rendu s’arrête dans un onglet masqué et avant ouverture d’un modèle.
La préférence de mouvement réduit immobilise les nuages ; la contemplation ne
démarre que sur demande. Le chargement reste affiché jusqu’au premier rendu composé.
Les chargements annulés sont écartés et leurs ressources libérées ; le remplacement conserve la capture précédente jusqu’à la compilation réussie, comme le lecteur de timelapse.

Les commandes communes offrent rotation contemplative, plein écran et carte postale
JPEG locale. La carte postale est recadrée en 1920 × 1080 depuis la résolution de
rendu disponible. Depuis une capture de galerie, le panneau de partage explique
l’accès par lien, puis exige une action explicite pour créer ce lien et permet sa
révocation. Un fichier local n’est jamais publié par ces commandes.

Validation : tests d’interaction des ambiances/qualité/contemplation/carte postale,
non-régression des chargements obsolètes et de la libération des textures partagées,
palettes couvertes à 100 %. Inspection Chromium des captures réelles de la fixture
NeoForge (entités, coffres, lit, sol) et import/rendu Blender 5.2.2 de la capture AFK.
La refonte est suivie dans l’issue #93. La mesure comparative GPU sur matériels identifiés reste à faire dans l’issue #74 ;
le rendu logiciel de Chromium ne constitue pas une preuve de 60 FPS sur mobile.
