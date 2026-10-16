# Mises à jour et recherches de dépendances

Renovate utilise `renovate.json`. Les dépendances Bun, outils Gradle, actions CI et images conservent le preset recommandé. La PR #113 met à jour l’outil de remappage Architectury Loom de 1.17.487 à 1.17.493 ; ce changement ne constitue pas une validation native d’un nouveau loader.

Les quatre échecs de recherche signalés en #4 venaient de dépendances d’exécution résolues comme si elles étaient toutes sur Maven Central :

- `com.mojang:minecraft` utilise maintenant le manifeste officiel Mojang, transformé par la datasource personnalisée Renovate en versions de releases stables.
- Fabric Loader et Fabric API utilisent explicitement `https://maven.fabricmc.net/`.
- Forge utilise explicitement `https://maven.minecraftforge.net/`.

Les versions d’exécution sont contraintes à la matrice réellement validée dans `config/mod-targets.json`. Elles continuent d’être recherchées : aucune dépendance n’est ignorée et les avertissements ne sont pas masqués. Un changement de Minecraft, Fabric Loader/API ou Forge se fait avec une modification explicite de la matrice, des contraintes correspondantes et des scénarios en jeu, avant de revendiquer la nouvelle compatibilité. Les outils de construction restent éligibles aux mises à jour ordinaires de Renovate.

`dependencyDashboardAutoclose` permet au bot de fermer son tableau quand il ne reste aucune mise à jour. Le tableau ne doit pas être fermé manuellement pour cacher une erreur de recherche ; le prochain passage hébergé doit confirmer la disparition des avertissements.

## Validation locale

Le validateur officiel `renovate-config-validator --strict renovate.json` et une exécution officielle Renovate `--platform=local --dry-run=lookup` vérifient l’extraction des vrais fichiers Gradle et les recherches, sans écrire sur GitHub ni modifier les dépendances. Renovate 44.164.10 attend Node 24 ; Node 26 peut effectuer les recherches mais retourne une erreur d’environnement et ne constitue donc pas une exécution réussie. Utiliser Node 24.15+ pour cette validation.

Les journaux privés de validation ne sont pas committés. Le passage hébergé, la CI du remappage et les tests du dépôt complètent cette vérification ; une nouvelle version de JAR n’est pas annoncée comme validée en jeu sur cette seule base.

Références : [datasources personnalisées](https://docs.renovatebot.com/modules/datasource/custom/), [Maven](https://docs.renovatebot.com/modules/datasource/maven/), [fermeture automatique du tableau](https://docs.renovatebot.com/configuration-options/#dependencydashboardautoclose).
