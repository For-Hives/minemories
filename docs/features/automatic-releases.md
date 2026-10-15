# Releases automatiques du monorepo

## Outils et périmètre

GitHub Actions orchestre le pipeline. `release-it` 21.1.1 et `@release-it/conventional-changelog` 12.0.2 calculent la version, écrivent le changelog et créent le commit/tag. Ils conviennent au monorepo Bun/Gradle sans registre npm et sans seconde PR de release. Le CLI GitHub publie les artefacts déjà construits. Node 24.15+ est recommandé ; les workflows installent Node 24 et Bun 1.4.3.

Les packages privés et le mod utilisent une version commune à chaque release. Il n’y a aucune publication npm. Le canal automatique est **beta** ; les catalogues restent une distribution distincte après validation en jeu. Les bibliothèques de release ne sont pas embarquées dans le client ni le JAR.

## Du merge à la release

```mermaid
flowchart LR
  A[Merge sur main] --> B[Quality gates]
  B --> C[Plan de version et matrice]
  C --> D[Build et tests par cible]
  D --> E[Vérification des JAR et SHA-256]
  E --> F[Versions, lockfile, changelog et tag]
  F --> G[Brouillon GitHub et envoi des fichiers]
  G --> H[Préversion GitHub complète]
  H --> I[Téléchargement depuis le site]
```

1. `Quality gates` doit réussir sur le **commit exact poussé sur main**, pas seulement sur la tête de la PR avant son rebase. Le workflow `automatic-release.yml` ne consomme ni les événements de PR ni ceux des forks. Il vérifie aussi le succès via l’API Actions, y compris lors d’un lancement manuel.
2. Le plan refuse un checkout différent ou un commit de main déjà dépassé. Release-it lit les tags `mod-v*`, y compris l’ancienne bêta, puis calcule la prochaine version. Le plan contient version, source, canal et cibles ; aucun fichier versionné ni tag n’est modifié à ce stade.
3. La matrice est générée depuis `config/mod-targets.json`. Chaque job repart du commit testé, nettoie les anciens builds et lance les contrôles core/loader et le build avec `-PmodVersion=<version>`. Gradle est exécuté avec Java 25 en CI et compile pour Java 21. Chaque cible conserve son JAR, sa compatibilité, son empreinte et un reçu de build.
4. Le job de publication n’existe que si tous les builds réussissent. Il accepte l’extraction à plat d’une cible unique par download-artifact, ou les dossiers nommés d’une matrice multiple, en vérifiant la liste exacte des fichiers/cibles. Il refuse les cibles manquantes/en trop, les mauvaises versions/sources et les archives ou empreintes modifiées.
5. Release-it synchronise le root, tous les manifests des workspaces `apps/*` et `packages/*`, `bun.lock` et `mod_version` dans `mod/minemories/gradle.properties`. Il met à jour `CHANGELOG.md`, crée `chore(release): <version> [skip ci]` puis un tag annoté `mod-v<version>`. Le push branche/tag est atomique et n’utilise jamais de force.
6. Le tag est sur le commit de version, dont le parent est le commit construit/testé. Les seuls changements admis dans ce commit sont les manifests des packages, le lockfile, la propriété Gradle et le changelog. Le manifeste public conserve le SHA du source testé.
7. La release GitHub est d’abord un brouillon marqué prerelease. Elle devient visible seulement après l’envoi de tous les fichiers. Un fichier existant différent est refusé ; aucune option `--clobber` ne l’écrase.

Le `GITHUB_TOKEN` standard suffit : lecture pour le plan/build, `actions:read` pour vérifier Quality gates et `contents:write` uniquement pour le job de publication. Aucun PAT ni compte npm n’est nécessaire. Les règles du dépôt doivent permettre le push du commit de version par ce token ; un refus de protection fait échouer le pipeline, sans forcer la branche. Le commit `[skip ci]`, publié avec le token Actions, ne crée pas de boucle de releases.

## Règles de version

`.release-it.json` utilise Conventional Commits et `strictSemVer: true` :

| Changement depuis la dernière release | Exemple depuis `0.2.0-beta.1` |
| --- | --- |
| `fix:`, `perf:`, maintenance, docs/tests/CI | `0.2.1-beta.1` |
| `feat:` | `0.3.0-beta.1` |
| `feat!:`, autre `!` ou pied `BREAKING CHANGE:` | `1.0.0-beta.1` |

Le plus fort incrément de la plage l’emporte. Les sections du changelog incluent fonctionnalités, corrections, performances, refactorisation, build, CI, documentation, tests et maintenance. Un merge sans type exploitable reçoit au minimum un patch ; utiliser des titres conventionnels conserve un changelog lisible. Chaque merge peut produire une release, même s’il ne modifie que le web ; plusieurs merges très rapprochés peuvent être regroupés quand un commit de main est dépassé avant publication.

La première bêta manuelle `mod-v0.1.0-beta` est conservée comme référence historique. Les versions de développement existantes ne sont pas des releases. Le premier incrément automatique est calculé sur les commits non inclus dans cette bêta ; la série suivante utilise les nouveaux tags. Aucun bump de version publié n’est effectué dans cette PR de mise en place.

## Cibles et fichiers

NeoForge 21.1.248 / Minecraft 1.21.1 / Java 21 est actuellement la seule cible activée. Fabric, Forge et Quilt ont des lignes désactivées. Leur activation exige un adaptateur Gradle compilable, une version de loader renseignée et une validation en jeu. `validatedInGame` signifie que la combinaison est prise en charge ; cela n’atteste pas que chaque nouvelle archive automatique a été exercée en jeu.

La release contient :

- `minemories-<loader>-mc<version>.jar` et son `.sha256` ;
- `manifest-<loader>-mc<version>.json` pour chaque cible ;
- `manifest.json`, alias conservé pour le téléchargement NeoForge 1.21.1 existant ;
- `release-manifest.json` avec version, source, validation automatisée, cibles, tailles et SHA-256.

Le nom `minemories-neoforge-mc1.21.1.jar` et le format des tags restent compatibles avec `/installation`. Le front récupère la release publiée depuis l’API GitHub ; aucun build Java n’est ajouté à Railpack/Coolify.

## Reprise et prévisualisation

- **Avant le commit/tag** : corriger le build ou les tests et relancer. Aucun tag ni release n’a été publié.
- **Après le push du commit/tag, pendant l’envoi** : utiliser **Re-run failed jobs** sur le même run Actions. Le plan et les artefacts conservés 30 jours permettent de reprendre la même version. Le job reconnaît le tag existant seulement si son parent, son sujet et son contenu correspondent au plan ; il reprend le brouillon et compare les digests des fichiers déjà envoyés.
- **Après une publication complète** : relancer le job ne crée pas une deuxième release et ne modifie pas les fichiers. Une divergence provoque une erreur explicite.
- **Nouveau merge pendant un build** : un commit dépassé est ignoré avant publication ; un push concurrent est refusé sans force. Le run du nouveau main prendra les changements en compte.
- **Artefacts expirés ou suppression manuelle d’un tag/asset** : ne pas réécrire un tag déjà distribué. Inspecter le run et publier une nouvelle version depuis un main vérifié.

Le workflow peut être lancé manuellement sur `main` avec `dry_run=true` (défaut). Il calcule et construit la matrice sans commit, tag ni publication. Sa file de concurrence est séparée pour ne pas remplacer une release automatique en attente. Il exige tout de même une CI verte sur cette source. Un main qui pointe déjà sur un commit de version n’a rien à publier.

## Catalogues

`mod-release.yml` télécharge une release GitHub existante, compare les octets au digest fourni par GitHub et au manifeste/checksum, puis utilise `mc-publish` pour les destinations sélectionnées. Il conserve `tested_in_game`, les identifiants/secrets Modrinth/CurseForge et l’environnement `mod-releases`. Il ne compile plus le mod et ne crée plus de release GitHub concurrente.

## Vérifications de développement

- `bun release:test` : vrais dépôts Git locaux pour les versions/commits/tags/reprises et tests de fichiers pour la matrice, les empreintes et les catalogues ; aucune publication externe depuis les tests.
- `bun check` et `bun run build` : incluent les tests de release et les contrôles habituels.
- `actionlint` 1.7.12 : syntaxe et expressions des workflows.

Le pin `basic-ftp: 6.2.1` corrige la dépendance transitive de l’outillage de release signalée par `bun audit` (GHSA-c475-qrg2-pj4r). L’outillage est testé avec ce pin ; aucun support FTP n’est ajouté au produit.
