# Règles de développement

## Commandes de référence

- `bun install --frozen-lockfile`: installe exactement les versions enregistrées dans `bun.lock`.
- `bun format`: applique le formatage Biome aux fichiers web et scripts.
- `bun mod:check`: applique Spotless puis lance `check` Gradle. `bun mod:check:ci` vérifie sans modifier les sources.
- `bun check`: Biome, vérification TypeScript, Vitest avec seuil de couverture, puis `check` Gradle dans `mod/minemories/` (Spotless, SpotBugs, JUnit et seuils JaCoCo).
- `bun api:check`: Biome, vérification TypeScript puis tests Bun de l'API. Les tests utilisent une base SQLite et un stockage temporaires isolés.
- `bun build`: exécute les contrôles du dépôt, produit le viewer, puis construit le mod et le core.

## Boucle courte pour le mod

Depuis la racine du dépôt, avec JDK 21 :

```sh
bun mod:dev
```

Cette commande lance la tâche Gradle `:neoforge:runClient` du POC NeoForge directement à partir des classes compilées. Gradle réutilise ses caches et ne construit pas le JAR de distribution ni les applications web. Au premier lancement il doit télécharger Minecraft et NeoForge, donc il sera plus long. Les suivants recompilent les sources modifiées. Le profil de développement est dans `mod/minemories/run/` (ignoré par Git) : il garde les options, ressources et mondes de test d'un lancement à l'autre. Ne copie pas le dossier de sauvegardes réel pour tester.

Dans le client de développement, ouvre un monde puis le menu pause : le bouton **Minemories** permet de capturer autour du joueur, d'exporter une sélection déjà définie par commandes, d'entrer le code d'appairage du web et d'envoyer le GLB manuellement. Un bouton identique est ajouté à l'écran des options, et la touche **M** (rebindable dans Contrôles) ouvre l'interface depuis n'importe quel écran, y compris les menus remplacés par FancyMenu/FTB/BHMenu. Vérifie visuellement le menu avec plusieurs boutons ajoutés par d'autres mods, à petite échelle GUI, la touche M quand aucune place ne reste, le retour au jeu, l'état des boutons, l'échec d'un code invalide et le fichier `~/export/capture.glb` après capture. Démarre `bun api:dev` et `bun web:dev` pour exercer l'appairage et l'envoi ; les contrôles Java seuls ne couvrent pas ces interactions.

Chaque upload joint les coordonnées du joueur, la dimension, le biome, l'heure du monde, la météo, le nom du monde ou du serveur, et la miniature disponible. La seed est envoyée uniquement en solo, car le client ne la connaît pas sur les serveurs distants. Les métadonnées sont conservées avec la capture et affichées dans la galerie ; les anciennes captures sans métadonnées restent compatibles.

Pour reproduire un problème de modpack, place seulement les JARs requis et compatibles **Minecraft 1.21.1 / NeoForge 21.1.248** dans `mod/minemories/run/mods/`, puis copie les fichiers de configuration nécessaires dans `mod/minemories/run/config/`. Commence avec le client vierge, puis ajoute les dépendances utiles au cas testé ; un modpack complet peut réintroduire son temps de démarrage. Un changement de Java nécessite un redémarrage du client pour une validation fiable. Pour inspecter vite la sérialisation GLB sans lancer Minecraft :

```sh
cd mod/minemories
./gradlew :core:test --tests "dev.minemories.core.GlbSceneTest"
./gradlew spotlessCheck
```

Sur Windows, utilise `gradlew.bat` à la place de `./gradlew`. `spotlessApply` formate le Java ; `spotlessCheck` vérifie sans modifier. Pour le test d'intégration final : `./gradlew build`, puis exercice en jeu et inspection du GLB dans Blender ou le viewer. Les raccourcis ne changent pas les cibles supportées (voir [Support des loaders](loader-support.md)).

## Politique de changement

1. Chaque correction de logique reproductible reçoit un test au niveau le plus bas qui l’exerce; privilégier `mod/minemories/core` pour la logique indépendante du jeu.
2. Aucun avertissement SpotBugs n’est ignoré globalement. Les suppressions doivent être localisées, justifiées et accompagnées d’un commentaire.
3. La couverture Java minimale du core est de 90 % des lignes et 60 % des branches. Les utilitaires TypeScript couverts par Vitest restent à 100 %.
4. Les changements des formats GLB, des textures, de la sélection ou du rendu ont aussi besoin d’une validation visuelle documentée : les tests unitaires ne remplacent pas Blender ou une session Minecraft.
5. Les dépendances web sont installées depuis la racine, verrouillées dans `bun.lock`, et mises à jour volontairement. Les versions de plugins et outils Gradle restent explicites.
6. Une fonctionnalité ne se déclare compatible qu’avec les loaders/version réellement compilés et essayés.

La CI GitHub exécute `bun build` sur chaque pull request et chaque push vers `main`. Les protections de branche doivent exiger ce statut avant fusion.

Le mod affiche encore des avertissements de dépréciation provenant des APIs Minecraft/NeoForge de la cible 1.21.1. Ils restent visibles dans le build; le core neutre, lui, traite tout avertissement javac comme une erreur. Migrer ces hooks nécessite une validation en jeu, donc ne pas masquer la sortie javac ni remplacer une API sans exercice du mod.

## Galerie et ambiance du viewer

Le site utilise un thème sombre. La galerie affiche chaque monde/serveur comme un dossier repliable façon liste de serveurs Minecraft : icône 64 px (miniature de la capture la plus récente), nom et MOTD (`N captures · Seed … · last visit …`). Les captures solo sont regroupées par nom de monde et seed, les multijoueur par nom de serveur. Les anciennes captures sans ces informations restent dans « Other captures ». Deux serveurs enregistrés sous le même nom sont regroupés ensemble tant qu'aucun identifiant de serveur n'est disponible. Dans un même monde, les captures distantes de moins de 64 blocs horizontalement sont empilées visuellement (« Same area · N captures · Near x, y, z ») pour montrer qu'il s'agit de la même zone. Chaque carte affiche un aperçu du modèle 3D lui-même : à la première ouverture d'une capture sans miniature, le viewer rend la scène (400×250 JPEG, recadrage cover sans étirement, downscale haute qualité) et la persiste via `memories.setThumbnail`. La capture d'écran du monde (solo) ou l'icône du serveur (multi) envoyée par le mod sert de repli, puis un motif de blocs. Les avatars utilisent les images de compte quand elles existent, sinon des pixel-art générés via DiceBear avec une seed hachée (aucun e-mail envoyé au CDN). Le bandeau « Your mod is paired » reste affiché tant qu'une snapshot date de moins de deux mois ; au-delà, la galerie propose de ré-appairer.

Le viewer propose quatre éclairages fixes (matin, midi, coucher du soleil, nuit). L'éclairage initial reprend l'heure capturée (`dayTime` en ticks converti en minutes) et le preset le plus proche est surligné. La skybox s'adapte à la dimension et au biome (`getAtmosphere`) : halo de braise fixe sans soleil ni étoiles dans le Nether, nuit étoilée violette fixe dans l'End, obscurité atténuée dans le deep dark, cycle jour/nuit classique ailleurs ; les teintes hémisphériques suivent la dimension. Les ombres sont filtrées en PCF doux, sur une carte de 4096 pixels. Les nuages continuent à avancer à 0,6 bloc/seconde vers +X pendant que l'éclairage reste fixe. La couche utilise le motif `assets/minecraft/textures/environment/clouds.png` de Minecraft Java 1.21.1 (copie locale dans `apps/web/public/textures/minecraft-clouds.png`), avec des cellules de 12 × 12 blocs et une épaisseur de 4 blocs. Le rendu place la couche au-dessus du modèle (`bounds.max.y + 24`) avec un matériau non éclairé opaque façon « fast graphics », teinté par la lumière du jour ; l'opaque évite que les nuages se dessinent devant le feuillage transparent. Les coordonnées de la capture, la position caméra et un décalage déduit de la seed (hachage 0-255) décalent le motif ; l'heure enregistrée sert de point de départ reproductible au mouvement (`ticks * 0,03`). Le Minecraft vanilla utilise un motif indépendant de la seed et une horloge de rendu locale : le décalage par seed distingue les mondes sans prétendre à une synchronisation image par image. Les nuages sont masqués pour les dimensions autres que l'Overworld. Un GLB local sans métadonnées utilise une origine de secours (0,64,0).

`/minemories export` et les boutons de capture utilisent un rayon horizontal de 128 blocs (8 chunks), sur toute la hauteur de la dimension. `/minemories export 16` réduit ce rayon à 16 blocs ; `/minemories export selection` exporte les coins sélectionnés. Le client ne force pas le chargement des chunks absents. Cette zone est beaucoup plus coûteuse que l'ancienne boîte de 8 blocs : l'export reste synchrone et peut suspendre momentanément l'affichage. La limite d'upload de 100 Mio reste inchangée.
