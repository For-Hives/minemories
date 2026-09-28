# Règles de développement

## Commandes de référence

- `bun install --frozen-lockfile`: installe exactement les versions enregistrées dans `bun.lock`.
- `bun run format`: applique le formatage Biome aux fichiers web et scripts.
- `./gradlew spotlessApply`: applique Google Java Format.
- `bun run check`: Biome, vérification TypeScript, Vitest avec seuil de couverture, puis `check` Gradle dans `minemories/` (Spotless, SpotBugs, JUnit et seuils JaCoCo).
- `bun run build`: exécute les contrôles web, produit le viewer, puis construit le mod et le core.

## Politique de changement

1. Chaque correction de logique reproductible reçoit un test au niveau le plus bas qui l’exerce; privilégier `minemories/core` pour la logique indépendante du jeu.
2. Aucun avertissement SpotBugs n’est ignoré globalement. Les suppressions doivent être localisées, justifiées et accompagnées d’un commentaire.
3. La couverture Java minimale du core est de 90 % des lignes et 60 % des branches. Les utilitaires TypeScript couverts par Vitest restent à 100 %.
4. Les changements des formats GLB, des textures, de la sélection ou du rendu ont aussi besoin d’une validation visuelle documentée : les tests unitaires ne remplacent pas Blender ou une session Minecraft.
5. Les dépendances web sont installées depuis la racine, verrouillées dans `bun.lock`, et mises à jour volontairement. Les versions de plugins et outils Gradle restent explicites.
6. Une fonctionnalité ne se déclare compatible qu’avec les loaders/version réellement compilés et essayés.

La CI GitHub exécute `bun run build` sur chaque pull request et chaque push vers `main`. Les protections de branche doivent exiger ce statut avant fusion.

Le mod affiche encore des avertissements de dépréciation provenant des APIs Minecraft/NeoForge de la cible 1.21.1. Ils restent visibles dans le build; le core neutre, lui, traite tout avertissement javac comme une erreur. Migrer ces hooks nécessite une validation en jeu, donc ne pas masquer la sortie javac ni remplacer une API sans exercice du mod.
