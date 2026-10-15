# Support des loaders Minecraft

Un launcher démarre un profil ; le loader fournit les API utilisées par le mod. Changer de launcher ne nécessite pas un autre JAR si Minecraft et le loader restent identiques. Changer de loader exige de choisir le bon artefact.

## Matrice validée

Toutes les cibles ci-dessous utilisent **Minecraft 1.21.1 et Java 21**.

| Loader | Version exercée | Artefact | Validation en jeu |
| --- | --- | --- | --- |
| NeoForge | 21.1.248 | `minemories-neoforge-mc1.21.1.jar` | Blocs standards, alpha/teintes, eau, coffre, entités ; modèle avec `ModelData`, Create 6.0.10 et Flywheel 1.0.6. Le profil utilisateur `mc breval` reste la référence historique. |
| Fabric | Loader 0.19.5 + Fabric API 0.116.17+1.21.1 | `minemories-fabric-mc1.21.1.jar` | Même scène standard, modèle Renderer API personnalisé avec transformations, teinte, alpha, émission et mesh supplémentaire. Fabric API doit être installé séparément. |
| Quilt | Loader 0.30.1 + la même Fabric API | **Le JAR Fabric** | Client Quilt lancé séparément avec le même modèle personnalisé, menus et capture AFK. Aucune archive ou adaptateur Quilt distinct. |
| Forge | 52.1.19 | `minemories-forge-mc1.21.1.jar` | Même scène standard et bloc personnalisé dont le modèle exige la propagation de `ModelData`, avec teinte et géométrie de demi-hauteur. |

La validation porte sur ces combinaisons et scénarios. Elle ne garantit pas tous les mods, renderers ou shaders d'un modpack. Une nouvelle cible ne peut être annoncée qu'après compilation, tests et validation en jeu de blocs standards, textures transparentes/teintées, fluides, block entities et contenu moddé.

## Architecture

- `:core` sérialise le GLB sans dépendance Minecraft et conserve ses tests JUnit, JaCoCo et SpotBugs.
- `:common` contient la capture Minecraft, les écrans, les transferts, les diagnostics consentis et leurs tests. `ClientPlatform` isole modèles/model data, fluides, sprites et versions. Ce module n'est pas un mod installable.
- `:neoforge` conserve ModDevGradle et ses événements/API NeoForge.
- `:fabric` utilise Architectury Loom 1.17.487, Fabric API et des mixins ciblés pour les frames pendant la pause, les entrées, les données de texture et le point de crash vanilla.
- `:forge` utilise Loom séparément, les événements Forge, ses model data et ses hooks de fluides. Les accès aux classes de rendu sont convertis en access transformers au remappage.

Les trois adaptateurs embarquent `:core` et le client commun. Les hooks de crash conservent le comportement vanilla ; le stockage/envoi des diagnostics reste soumis à l'appairage et au consentement existants. La capture n'ajoute aucun envoi sans appairage.

## Preuves du portage du 15 octobre 2026

Les clients de test chargent les JAR livrables, avec des sauvegardes et configurations isolées. Fabric et Quilt utilisent le bootstrap de production, sans classes de développement du mod sur le classpath. Forge utilise son installation client distincte. NeoForge vérifie également le chemin du JAR effectivement chargé. Les clients de test sont lancés sans son.

La scène standard comporte coffre, feuilles, verre rouge, eau, mouton teinté et Enderman. Son export initial contient 1 008 triangles, 9 images et le matériau émissif des yeux. La capture conserve les onze états OpenGL contrôlés, notamment un pixel pack buffer de 16 octets et des paramètres de packing non standards. Les GLB passent les validateurs de production de l'API ; les rendus ont été inspectés dans Blender.

Le mod compagnon Fabric enregistre un bloc dont le modèle Renderer API n'est pas un adaptateur vanilla : fallback cubique transformé, teinte personnalisée, alpha et émission, puis mesh cyan supplémentaire. L'export contient 1 018 triangles. Le test a détecté le cast interne d'Indigo dans `Mesh.outputTo` ; le collecteur utilise maintenant l'énumération publique des quads avant son émetteur borné. Il limite quads et transformations par modèle et rejette les primitives non finies.

Les compagnons Forge et NeoForge imposent un marqueur `ModelData` avant de retourner leurs quads. La demi-hauteur et la couleur cyan attendues sont vérifiables dans le GLB. Le pack de ressources déclare son `pack.mcmeta` ; la texture blanche est réellement chargée, sans texture de remplacement. Sous NeoForge, le moteur Create entraîne arbre et engrenage, et Flywheel retrouve son état entre les callbacks de capture.

Les scénarios interactifs contrôlent M, le bouton Minemories du menu pause, le respect de `afkSnapshots=false`, puis une capture progressive complète pendant la pause après activation explicite. Le scope de capture est inactif entre les frames. Les nouveaux hooks de crash et la récupération des diagnostics issus de `main` sont inclus dans les derniers JAR ; le signal de crash sans consentement n'est pas enregistré dans le scénario NeoForge.

Empreintes des JAR locaux `0.3.1-beta.1` reconstruits et exercés après intégration des changements de `main`. Ils ne remplacent pas la release GitHub existante sous ce numéro ; la prochaine release aura son propre numéro et ses checksums :

| Artefact | SHA-256 |
| --- | --- |
| NeoForge | `13a05b64cf1c8ff7b9055b1b68d099739f2fc89d932a83a6c88a54073ac3a021` |
| Fabric, également utilisé sous Quilt | `f0b9c970c8b1ba2c29d697019f23ab0dd58df035336b9d5a3304a9ade748aa5f` |
| Forge | `f31d197923fc1049378e55f00820e0b56be6c1d0ab5461b2142b64dbb43b2270` |

Une régression complémentaire a chargé le modpack ATMons complet sous NeoForge 21.1.249 avec le JAR intermédiaire `77afb1bb9f3ee62f2df2650db7fe08e3631aa0a45a42de3b06b6e0cdda0a6fc6`, avant intégration des nouveaux diagnostics : export manuel de 20 716 triangles/42 images, AFK de 77 582 triangles/93 images et 5 698 460 octets. Flywheel reste actif entre les frames ; l'annulation conserve le dernier GLB complet et nettoie le spool. Le maximum d'une étape a atteint 56,29 ms avec 83 dépassements souples : le budget de frame ne constitue pas une garantie de latence pour tout renderer tiers. Les limites des rendus personnalisés, notamment l'émission de certains Pokémon, restent décrites dans [les modèles capturés](frozen-entities.md).

Les preuves locales sont sous `loader-adapters-20261015/` : profils `neoforge-create-final`, `fabric-rebased-final`, `quilt-rebased-final`, `forge-rebased-final` et `neoforge-full-final`. Les tentatives de harnais corrigées sont conservées séparément des résultats réussis.

## Compilation et distribution

`bun mod:check:ci` et `bun mod:build` couvrent tous les modules Java. Les JAR remappés sont dans les répertoires `build/libs/` des trois adaptateurs. `bun run build` prépare les paquets dans `build/mod-loaders/{neoforge,fabric,forge}/`. Chacun contient JAR, empreinte `.sha256` et manifeste avec version du mod, Minecraft, loader, version du loader, taille et empreinte. Le manifeste Fabric indique aussi Fabric API. `bun run package:mod:all` refait seulement ce conditionnement à partir des JAR construits.

La CI conserve les trois paquets puis les télécharge dans trois jobs distincts : loader, métadonnées et octets sont vérifiés contre l'empreinte du job de compilation. Les tests refusent les builds absents/ambigus, les manifestes réétiquetés, les versions/commits étrangers et les empreintes altérées. Les contrôles de qualité restent actifs, y compris les tests du client commun.

`config/mod-targets.json` est la source de la matrice de publication. NeoForge, Fabric et Forge sont activés après ces validations ; la réservation Quilt reste désactivée puisqu'elle réutilise le JAR Fabric. La release automatique construit les trois cibles avec noms, manifestes, checksums et provenance distincts. `validatedInGame` décrit la combinaison prise en charge : il ne prétend pas que chaque nouvelle archive automatique a été jouée. Voir [le pipeline de release](automatic-releases.md).

Le téléchargement public par défaut reste NeoForge ; choisir l'archive correspondant au loader et installer Fabric API pour Fabric/Quilt. Une compilation CI ne remplace jamais les essais graphiques d'une nouvelle cible ou d'un changement de rendu.
