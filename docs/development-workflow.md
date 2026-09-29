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

Dans le client de développement, ouvre un monde puis le menu pause : le bouton **Minemories** permet de capturer autour du joueur, d'exporter une sélection déjà définie par commandes, d'entrer le code d'appairage du web et d'envoyer le GLB manuellement. Vérifie visuellement le menu avec plusieurs boutons ajoutés par d'autres mods, à petite échelle GUI, le raccourci Ctrl+M/⌘+M si aucune place ne reste, le retour au jeu, l'état des boutons, l'échec d'un code invalide et le fichier `~/export/capture.glb` après capture. Démarre `bun api:dev` et `bun web:dev` pour exercer l'appairage et l'envoi ; les contrôles Java seuls ne couvrent pas ces interactions.

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
