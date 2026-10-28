# Spécification : build multi-versions rapide et reproductible

Statut : **proposition** (28 octobre 2026), phase 0 (mesures) réalisée. Le reste n'est pas implémenté. Les tâches suivies vivent dans les GitHub Issues ; ce fichier porte la décision d'architecture et les critères d'acceptation.

## 1. Problème

La cible est une matrice **versions de Minecraft × loaders** (NeoForge, Fabric, Forge, plus les versions antérieures comme 1.20.1). Aujourd'hui :

- Une seule version est dans le build principal (`mod/minemories`, 1.21.1). 1.20.1 vit dans un second build (`mod/minemories-1.20.1`) qui **copie puis modifie par regex** les sources partagées (`adapt.gradle`). Chaque nouvelle version ajouterait un build, une copie et un lot de regex à maintenir.
- La CI reconstruit chaque cible à froid : `setup-java` avec `cache: gradle` ne sauve que `~/.gradle/caches`, et le Gradle de la machine est relancé sans daemon (`org.gradle.daemon=false`).
- `build-release-target.mjs` exécute `clean :core:check :common:check` dans **chaque** cellule de la matrice, donc les mêmes tests et analyses sont répétés N fois.

Le code Java est petit (environ 14 000 lignes pour `common`). Le coût dominant n'est donc pas `javac` : la phase 0 (section 4) confirme que le démarrage à froid est dominé par la préparation de Minecraft et la résolution des dépendances, pas par les tâches de compilation.

## 2. Décisions d'architecture

### D1. Un seul arbre de sources, plusieurs versions via Stonecutter
Remplacer `adapt.gradle` (regex fragiles, copie de fichiers) par **Stonecutter** (préprocesseur par commentaires, `//? if >=1.21`), qui exprime les différences de version dans le source lui-même, compilables et relisibles. Un build échoue si un bloc ne compile pas, au lieu de ne pas correspondre en silence.

- Les différences d'API *larges* restent derrière `ClientPlatform` (déjà en place). Stonecutter ne sert qu'aux différences *locales* (signature, import, méthode renommée).
- Un seul Gradle racine, un sous-projet par version de Minecraft, un adaptateur par loader dans chacun.
- Alternatives écartées : un dépôt ou dossier par version (dérive garantie) ; multi-module Architectury seul (n'adresse pas les différences d'API entre versions de Minecraft).

### D2. Une seule source de vérité pour la matrice
`config/mod-targets.json` reste la source. Gradle (`settings.gradle`) et la CI en dérivent leurs listes ; aucun numéro de version Minecraft ou loader n'est dupliqué dans un `build.gradle`. Le catalogue `gradle/libs.versions.toml` ne porte que les versions d'outils et de bibliothèques.

### D3. Compiler une fois ce qui ne dépend pas de Minecraft
- `:core` n'a aucune dépendance Minecraft : il est compilé **une fois** avec `--release 17` (plus petit commun dénominateur) puis réutilisé par toutes les cellules. Cela supprime `Math.clamp`/`getLast` du code partagé ou les isole derrière un utilitaire commun.
- `:core:check` (JUnit, JaCoCo, SpotBugs) tourne dans **un job unique**, pas dans chaque cellule.
- Spotless/format : un job unique.

### D4. Mise en cache à trois couches
| Couche | Contenu | Où | Écrit par |
| --- | --- | --- | --- |
| Local | daemon, build cache, config cache | machine du développeur | le développeur |
| Distante | sorties de tâches Gradle (Minecraft décompilé et remappé, classes compilées) | **nœud de cache Gradle privé** (conteneur sur l'infra existante) | `main` et un job nocturne seulement |
| CI | dépendances Maven, wrapper | `setup-gradle` | `main` |

Le cache distant est en **lecture seule** pour les PR et les forks. Le cache d'Actions seul est insuffisant : sa limite par dépôt (10 Go) et son éviction après inactivité ne tiennent pas avec des dizaines de cibles décompilées.

### D5. Contraintes légales et de sécurité
- Les sources décompilées, les jars remappés et les images contenant du Minecraft **ne sont jamais publiés** : cache distant privé et authentifié, aucune image Docker publique préremplie, aucun artefact de CI contenant autre chose que le mod.
- Le cache distant n'est jamais accessible en écriture depuis une PR issue d'un fork (risque d'empoisonnement). Les JAR de release sont vérifiés par l'empreinte existante (`verify-mod-artifact`) et reconstruits **sans lire le cache distant** lors d'une release (`--no-build-cache`) : le cache accélère, il ne fait pas autorité.
- Vérification du wrapper Gradle et `dependency-verification` (`gradle/verification-metadata.xml`) pour figer les plugins.

### D6. Pipeline en niveaux
| Déclencheur | Contenu | Objectif |
| --- | --- | --- |
| PR | Qualité (D3) + cellules **touchées** par le diff + une cellule de référence par loader | retour rapide |
| `main` | Qualité + **toute la matrice** (`assemble`, sans re-tester `core`) | cache chaud, détection de casse |
| Nocturne | Matrice complète à froid contre le cache | alimente et valide le cache |
| Release | Matrice complète, `--no-build-cache`, checksums, manifestes | reproductible et autoritaire |

La sélection par diff : un changement limité à `apps/**`, `docs/**` ou `packages/**` n'exécute aucune cellule Java ; `core/**` et `common/**` exécutent toute la matrice ; un dossier d'adaptateur n'exécute que ses cellules.

### D7. Rust : écarté
La charge est du téléchargement, de la décompilation et de l'IO exécutés par les plugins Minecraft de l'écosystème Gradle, hors de notre contrôle. Réécrire en Rust n'accélère aucune étape mesurable et sort de l'écosystème des toolchains de mods. À reconsidérer seulement si le profilage montre un outil maison dominant (par exemple le packaging dans `scripts/`).

## 3. Exigences

1. Ajouter une version de Minecraft ou un loader = **une entrée dans `mod-targets.json`** + les blocs Stonecutter nécessaires + une validation en jeu. Aucune copie de projet.
2. Le build de release est reproductible : mêmes entrées, mêmes octets, quel que soit l'état du cache (archives sans horodatage, ordre de fichiers fixe).
3. Aucune régression des garde-fous du dépôt : JaCoCo 90/60 sur `:core`, SpotBugs sans `ignoreFailures`, `-Werror -Xlint:all` sur `:core`, vérification des artefacts par checksum. Les seuils ne sont pas abaissés.
4. Un changement de rendu ou de GLB continue d'exiger la validation visuelle en jeu. La CI de compilation ne vaut pas validation (`validatedInGame` inchangé).
5. Les temps sont mesurés et publiés à chaque exécution (`--scan` ou résumé `--profile`), sinon l'optimisation est invérifiable.

## 4. Plan de mise en œuvre

Chaque phase est livrable seule et laisse la CI verte. Chaque phase correspond à une issue.

### Phase 0 : mesurer (préalable)
- Relever sur la machine de référence et en CI : build à froid, à chaud sans changement, à chaud avec changement dans `common`, par cible. Utiliser `--profile` et `--scan`.
- Isoler le temps passé dans : résolution des dépendances, préparation de Minecraft (décompilation/remappage), compilation, `check`, packaging.
- **Sortie** : tableau ci-dessous. Les budgets de la phase 5 sont fixés à partir de lui.

**Résultats (28 octobre 2026, phase 0 réalisée).** Machine locale 12 cœurs, 31 Go, JDK 21, Gradle 9.8.2 avec la configuration actuelle (`daemon=false`, pas de parallélisme ni de cache de configuration). Commande : `:<loader>:build` (inclut `check`, donc Spotless, SpotBugs et, pour 1.21.1, les tests). À froid = `GRADLE_USER_HOME` vide (wrapper, plugins et Minecraft retéléchargés) et dossier de build vide. Un seul échantillon par cellule : ce sont des ordres de grandeur, pas des moyennes.

| Cible | À froid (mur) | dont tâches Gradle | Hors tâches | À chaud, rien ne change | À chaud, `common` modifié |
| --- | --- | --- | --- | --- | --- |
| NeoForge 1.21.1 | 4 min 31 s | 103 s | ≈ 168 s | 6 s | 10 s |
| Fabric 1.21.1 | 3 min 05 s | 57 s | ≈ 128 s | 6 s | 12 s |
| Forge 1.21.1 | 2 min 57 s | 54 s | ≈ 123 s | 6 s | 12 s |
| Fabric 1.20.1 | 2 min 30 s | 13 s | ≈ 137 s | 6 s | 11 s |
| Forge 1.20.1 | 2 min 11 s | 13 s | ≈ 118 s | 5 s | 9 s |

« Hors tâches » est la différence entre le temps mur et la somme des durées de tâches : téléchargement du wrapper et des plugins, résolution des dépendances, démarrage de la JVM, et préparation de Minecraft effectuée pendant la configuration. Je n'ai pas ventilé davantage ce bloc ; il dépend du réseau.

Tâches les plus coûteuses à froid : `:neoforge:createMinecraftArtifacts` 84 s ; `remapJar` 21 s (Fabric) et 21 s (Forge) ; `spotbugsMain` 19–20 s (Fabric, Forge) et 8 s (NeoForge) ; `common:compileJava` 6–7 s ; `javac` des adaptateurs 2–4 s (10 s pour les 1.20.1, qui compilent aussi les sources partagées adaptées).

Conclusions utiles pour la suite :
1. **60 à 90 % du temps à froid n'est pas de la compilation.** Le cache distant et la mise en cache du travail de préparation (phase 3) sont le levier principal ; la phase 1 (réglages Gradle) n'y touche pas.
2. **À chaud, le coût fixe est d'environ 6 s sans aucun travail** (démarrage JVM et configuration, car le daemon est désactivé). Le cache de configuration et le daemon local (phase 1) visent exactement cela.
3. **SpotBugs pèse 19–20 s à froid par cellule Fabric/Forge**, et il est refait dans chaque cellule alors que `common` est identique : argument pour la phase 2.
4. **Le coût d'un loader supplémentaire est de 2 à 3 minutes à froid, mais d'environ 10 s à chaud.** Une matrice de N cibles coûte donc N × ≈ 2,5 min sans cache, et très peu avec un cache partagé : c'est le principal argument pour la phase 3.
5. Les builds 1.20.1 n'exécutent ni tests ni SpotBugs ; leurs temps ne sont pas comparables un à un avec 1.21.1.

Limites : une machine, un échantillon, réseau variable, pas de mesure en CI (runners 4 cœurs, sans daemon). À refaire sur un runner GitHub avant de fixer les budgets de la phase 5.

### Phase 1 : réglages Gradle (faible risque)
- `org.gradle.parallel=true`, `org.gradle.configuration-cache=true` (à désactiver par plugin incompatible, avec raison), `org.gradle.daemon=true` en local et `-Dorg.gradle.daemon=false` en CI, mémoire relevée si la phase 0 le justifie.
- **Acceptation** : build à chaud sans changement dominé par le coût de configuration ; aucune tâche exécutée à nouveau sans changement d'entrée.

**Phase 1 réalisée (28 octobre 2026).** `mod/minemories/gradle.properties` (et la copie 1.20.1) : `org.gradle.parallel=true`, `org.gradle.configuration-cache=true`, et `org.gradle.daemon=false` retiré (le daemon est actif en local). `scripts/gradle.mjs` ajoute `-Dorg.gradle.daemon=false --no-configuration-cache` quand `CI` est défini : les runners sont jetables, donc ces deux mécanismes n'y apportent que du coût. `-Xmx3G` est inchangé : la phase 0 n'a montré aucun problème de mémoire. Le cache de configuration s'enregistre sans erreur avec les trois plugins (ModDevGradle, Architectury Loom Fabric et Forge).

Mesure : `./gradlew build` sur les trois loaders 1.21.1 (cache Gradle utilisateur déjà chaud, même machine, un seul échantillon) :

| Scénario | Avant (daemon off, séquentiel) | Après |
| --- | --- | --- |
| Rien ne change | 20,6 s | 7,6 s la première fois (stockage), **0,6 s** ensuite |
| `common` modifié | 25–27 s | 19–20 s |

Le gain est surtout local : un rebuild sans changement passe de 20 s à 0,6 s, et une modification de `common` gagne environ 25 %. Le parallélisme limite ce dernier gain parce que `common` et les trois adaptateurs suivent une chaîne de dépendances. **Aucun effet attendu sur le démarrage à froid** (téléchargement et préparation de Minecraft) : je ne l'ai pas re-mesuré, car aucun de ces réglages n'agit dessus. En CI, rien ne change tant que les phases 2 et 3 ne sont pas faites.

### Phase 2 : sortir le commun de la matrice
- `:core` en `--release 17`, construit une fois, consommé par les cellules.
- Séparer les tâches : `check` global (un job) et `assemble`/`build` par cellule. Adapter `build-release-target.mjs` (plus de `:core:check` ni `:common:check` par cellule ; ils restent dans le job de qualité, avec une vérification que ce job a réussi pour la même révision).
- **Acceptation** : une cellule n'exécute ni JaCoCo ni SpotBugs de `core` ; la couverture publiée est identique.

**Phase 2 réalisée (28 octobre 2026).**
- `:core` compile avec `options.release = 17` (classes en version 61). Aucun appel à une API Java 21 n'était présent ; `check` de `:core` passe, couverture comprise.
- `scripts/build-release-target.mjs` expose `releaseGradleTasks`. Quand `RELEASE_SHARED_CHECKS_DONE=true`, une cellule exécute `clean :<loader>:check :<loader>:build` sans `:core:check` ni `:common:check`. Le workflow ne positionne cette variable que sur l'événement `workflow_run` : c'est le seul chemin qui prouve que *Quality gates* a réussi pour ce commit exact (`head_sha == github.sha`). Un lancement manuel (`workflow_dispatch`) garde la vérification complète.
- `scripts/build-release-target.test.mjs` couvre les deux chemins ; il est ajouté à `release:test`.

Mesure : une cellule Fabric à chaud avec `--no-build-cache` passe de 26–27 s à 12,6–12,8 s (environ 14 s économisées par cellule : tests de `core` et `common`, JaCoCo, SpotBugs). À froid, SpotBugs de `core`/`common` ajoutait plus, mais je ne l'ai pas isolé. Limite : chaque job de CI recompile quand même `:core` (environ 1 s). Le partager entre jobs demanderait un artefact intermédiaire ; le cache distant de la phase 3 le fera plus simplement, donc je ne l'ai pas ajouté ici.

**Mise à jour des outils (28 octobre 2026).** Relevé des dernières versions publiées (Gradle 9.8.2, Spotless 8.10.4, ModDevGradle 2.0.148, Architectury Loom 1.17.493, SpotBugs 4.10.5 et plugin 6.5.13, JUnit 6.1.3 étaient déjà à jour, via Renovate). Montées : JaCoCo 0.8.15 → 0.8.16 et Gson de test 2.14.0 → 2.15.0. **Non montée** : google-java-format 1.37.0 est publié mais Spotless 8.10.4 (dernière version) échoue dessus, sous JDK 21 comme sous JDK 25 ; il reste en 1.36.0 jusqu'à une version de Spotless compatible. Java : le dernier LTS est 25 (Temurin 25.0.5) ; Gradle tourne dessus (CI le fait déjà), mais le mod reste compilé en Java 21 parce que Minecraft 1.21.1 l'impose. `build` et `check` passent sous Gradle/JDK 25 et sous Gradle/JDK 21.

**Correction de la phase 1.** Le cache de configuration cassait `processResources` de Fabric et Forge dès qu'elles s'exécutaient réellement, car la closure lisait `project.version` à l'exécution. Mes mesures ne l'avaient pas révélé : ces tâches étaient à jour ou restaurées depuis le cache de build. La version est maintenant capturée à la configuration, comme dans NeoForge ; vérifié avec `clean build --no-build-cache`, deux fois de suite (configuration réutilisée).

**Essai sur la dernière version (28 octobre 2026, jetable, hors dépôt).** Dernière version de Minecraft : **26.3** (15 septembre 2026), avec NeoForge 26.3.0.99, Fabric Loader 0.20.1 + Fabric API 0.165.0+26.3 et Forge 26.3-66.1.0. Les trois chaînes d'outils préparent Minecraft 26.3 correctement (NeoForge : ModDevGradle 2.0.148, 89 s ; Fabric : `net.fabricmc.fabric-loom` 1.19.3, 21 s ; Forge : ForgeGradle 7.0.40, 2 min), mais **le code actuel ne compile sur aucun** : 201 erreurs sur NeoForge et 309 sur Fabric (le total Forge n'a pas été relevé), dont une majorité côté `common`. Causes principales : `GuiGraphics`, `ResourceLocation`, `RenderType`/`VertexFormat`/`RenderStateShard`, `BakedQuad`, `GlStateManager` et les accès LWJGL ont changé ou disparu ; `getMinBuildHeight`/`getMaxBuildHeight`, `setScreen` et `displayClientMessage` ont changé de forme ; `ModelData` et `FluidSpriteCache` (NeoForge) ont été déplacés ; l'API de raccourcis clavier de Fabric a changé de paquet. Conséquences pour l'architecture :
1. **Il s'agit d'un portage d'API, pas d'un problème de build.** La capture rendue (`RenderedModelCapture`, `RenderedVertexConsumer`, états OpenGL) est le point le plus à risque et exige une validation visuelle en jeu.
2. **26.x n'est plus obfusqué** et exige Java 25. Architectury Loom (`loom-remap` 1.17.493) ne convient plus : Fabric passe à `fabric-loom` 1.19, Forge à ForgeGradle 7. Le module `:common` ne peut donc pas rester un seul projet Loom pour toutes les versions. C'est un argument pour la décision D1 (Stonecutter) avec un `common` par génération de Minecraft.
3. **La toolchain Java de la matrice devient hétérogène** (21 pour 1.20/1.21, 25 pour 26.x) : à prévoir dans `mod-targets.json` (champ `java`, déjà présent) et dans les caches.

### Phase 3 : cache Gradle partagé
- `gradle/actions/setup-gradle` en CI (écriture seulement sur `main`).
- Nœud de cache privé, authentifié (D4/D5) ; configuration `buildCache { remote(HttpBuildCache) }` avec `push` conditionné à la CI sur `main`.
- Job nocturne qui alimente le cache et alerte s'il diverge d'une reconstruction à froid.
- **Acceptation** : une PR qui ne touche pas Minecraft ne décompile rien ; un test prouve que le cache distant n'est jamais écrit depuis une PR.

### Phase 4 : migration vers Stonecutter
- Introduire Stonecutter avec 1.21.1 comme référence, sans changement de comportement : les trois JAR de la version actuelle doivent avoir des classes équivalentes (comparaison des empreintes de classes ou du contenu).
- Migrer 1.20.1 : convertir chaque règle de `adapt.gradle` en bloc conditionnel, supprimer `mod/minemories-1.20.1/adapt.gradle` et le build séparé.
- Générer les projets depuis `mod-targets.json` (D2).
- **Acceptation** : un seul `./gradlew` construit toute la matrice ; `adapt.gradle` supprimé ; les JAR 1.20.1 passent les validations en jeu déjà documentées.
- **Risque principal** : compatibilité Stonecutter avec chacun des trois plugins (ModDevGradle, Architectury Loom pour Fabric et Forge). **Spike d'une demi-journée en tête de phase** pour confirmer, sur une branche jetable, qu'une cellule de chaque loader compile ; sinon repli sur un projet Gradle par version avec un script de synchronisation de sources testé.

### Phase 5 : pipeline à niveaux
- Calcul de matrice par diff (D6) dans `plan-release.mjs` ou un script voisin, avec tests (`node:test`) pour chaque règle de chemin.
- Budgets de temps en CI : alerte (pas d'échec) quand une cellule dépasse le budget fixé en phase 0.
- **Acceptation** : une PR de documentation n'exécute aucun job Java ; une PR qui change un adaptateur n'exécute que ses cellules.

### Phase 6 : durcissement
- `dependency-verification`, vérification du wrapper, archives reproductibles, test de reproductibilité (deux builds, mêmes octets).
- Documentation : mise à jour de [loader-support.md](loader-support.md), [automatic-releases.md](automatic-releases.md) et [development-workflow.md](../concepts/development-workflow.md).

## 5. Ordre et dépendances

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 ─┐
                       └──── Phase 4 ───┴→ Phase 5 → Phase 6
```
Les phases 3 et 4 sont indépendantes une fois la 2 terminée. La 4 est la plus risquée et la plus rentable à long terme : elle empêche le coût de maintenance de croître avec le nombre de versions.

## 6. Hors périmètre
- Automatiser la validation en jeu (l'AGENTS.md l'exige manuelle pour toute nouvelle cible).
- Changer de loader ou de mappings (restent les mappings officiels Mojang).
- Support Quilt séparé (réutilise le JAR Fabric).

## 7. Questions ouvertes
1. Quelles versions de Minecraft exactement, et jusqu'où remonter ? Cela fixe la taille de la matrice et la version minimale de Java (17 pour 1.20.1, 21 pour 1.21.x).
2. Où héberger le nœud de cache (l'infra existante convient-elle, avec quelle capacité disque) ?
3. Budget CI acceptable pour le job nocturne complet.
