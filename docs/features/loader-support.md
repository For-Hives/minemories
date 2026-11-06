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

`bun mod:check:ci` et `bun mod:build` couvrent tous les modules Java de la racine 1.21.1. Les JAR remappés sont dans les répertoires `build/libs/` des trois adaptateurs. Les JAR de production, avec empreinte `.sha256` et manifeste (version du mod, Minecraft, loader, version du loader, taille, empreinte, commit), sont construits par `bun mod build` dans `build/mod-dist/<version>/<id>/`.

La CI ne produit aucun JAR distribué : elle compile et contrôle chaque cellule de la matrice (`node scripts/mod/cli.mjs ci`), y compris les tests du client commun, pour qu'un portage ne cesse pas de compiler. La construction des JAR publiés a lieu sur le VPS (`bun mod release`).

`mod/targets.json` est la source de la matrice de publication. NeoForge, Fabric et Forge sont activés après ces validations ; la réservation Quilt reste désactivée puisqu'elle réutilise le JAR Fabric. `bun mod release` construit chaque cible activée avec nom, manifeste, checksum et provenance distincts. `validatedInGame` décrit la combinaison prise en charge : il ne prétend pas que chaque nouvelle archive automatique a été jouée. Voir [le pipeline de release](automatic-releases.md).

Les cibles des autres versions de Minecraft (1.21.11, 1.19.2, 1.18.2, puis 1.20.1 une fois testée) portent `dir` (racine Gradle `mod/1.21.1-<version>`) et `jarPrefix` (préfixe du JAR construit) ; Java 17 est accepté pour les versions avant 1.21. Elles n'ont pas de `:core`/`:common` propres : seul l'adaptateur est vérifié. Une cible n'est activée que si son test en jeu automatique est passé ; Forge 1.21.11 et 1.20.1 restent désactivées. La page d'installation propose une version de Minecraft puis un loader parmi les cibles activées, avec NeoForge 1.21.1 par défaut.

Le téléchargement public par défaut reste NeoForge 1.21.1 ; choisir l'archive correspondant au loader et installer Fabric API pour Fabric/Quilt. Une compilation CI ne remplace jamais les essais graphiques d'une nouvelle cible ou d'un changement de rendu.

## Outil `bun mod`

`bun mod` (`scripts/mod/cli.mjs`) : un seul outil pour compiler, suivre l'état, versionner et orchestrer la release du mod. `bun mod` sans argument liste les commandes ; `bun mod <commande> --help` donne l'usage. Les commandes sont les fichiers de `scripts/mod/commands/` (contrat : `{ name, summary, usage, run(args, { config, env, log, root }) }`, documenté en tête de `cli.mjs`), donc stockage, tests, publication et notifications s'y ajoutent sans toucher au cœur.

**Configuration unique : `mod/targets.json`.** `minecraft` (versions affichées, dans l'ordre), `targets[]` (cibles construites) et `planned` (cibles prévues, non construites : 1.16.5 et 1.12.2). Chaque cible porte son identité (`id` = `<loader>-mc<minecraft>`, `loader`, `name`, `minecraft`, `loaderVersion`, `fabricApi`), son état (`enabled`, `validatedInGame`) et ses champs de build : `java` (JDK de compilation, 17 avant 1.21, 21 depuis), `project` (sous-projet Gradle), `dir` (racine Gradle `mod/<minecraft>`, par défaut), `jar` (gabarit du JAR produit, avec `{version}`) et `loaderProperty` (propriété Gradle pour compiler une autre version du loader). Les versions de Minecraft suivent `\d+(\.\d+)*` (donc `26.3` convient) et la validation est stricte (ids uniques, dossier cohérent). L'application web lit toujours `targets[]`.

**Commandes.**
- `bun mod status` : grille Minecraft (lignes) x loader (colonnes). ✓ à jour, ⚠ seulement d'anciennes versions, ✗ à compiler, ○ prévu, `·` rien, `*` cible désactivée. Si le module de stockage répond, chaque case ajoute `↑<dernière version publiée>` et l'espace utilisé, et la ligne finale donne le total ; sans stockage, la grille reste locale. Couleurs coupées hors terminal ou avec `NO_COLOR`.
- `bun mod build [<loader> <minecraft> | <id>…] [--all] [--missing] [--dev] [--verbose]` : lance Gradle dans `mod/<minecraft>` (`:<projet>:clean`, `:<projet>:build`, `-PmodVersion`, `-Pminemories.prod=true`) et dépose dans `build/mod-dist/<version>/<id>/` le JAR renommé `minemories-<loader>-mc<minecraft>-<version>.jar`, son `.sha256` et `manifest.json` (version, Minecraft, loader, versions de loader et Fabric API, taille, SHA-256, commit, JDK, `prod`). `--dev` passe `-Pminemories.prod=false` ; `--missing` ne compile que les cibles activées sans build à jour. Une cible en échec n'arrête pas les autres : le résumé donne durée et taille de chacune, et le code de sortie est non nul s'il y a un échec. Un seul build à la fois par machine (verrou `build/mod-build.lock`, ignoré si son propriétaire n'existe plus). Le cache Gradle est celui de `~/.gradle`, partagé entre cibles.
- `bun mod jdk [list|install <8|17|21|25>]` : Gradle tourne sur un JDK 21 et chaque cible compile avec le sien. Les JDK sont cherchés dans `JAVA_HOME`, `~/.local/tools`, `~/.gradle/jdks` et le `PATH`, puis téléchargés si besoin depuis l'API Adoptium (somme SHA-256 obligatoire, refus sinon) dans `~/.local/tools`, et passés à Gradle (`JAVA_HOME`, `-Dorg.gradle.java.installations.paths`). `--no-jdk-download` sur `build` interdit le téléchargement.
- `bun mod version [show|bump patch|minor|beta] [--commit]` : `mod_version` reste dans `mod/1.21.1/gradle.properties`. `bump` le réécrit au format `X.Y.Z-beta.N` ; avec `--commit` il crée le commit `chore(release): X.Y.Z-beta.N` et le tag `mod-vX.Y.Z-beta.N`.
- `bun mod release [--skip-tests] [--no-publish] [--dry-run]` : verrou, version, build de production de toutes les cibles activées, tests headless, stockage, publication Modrinth/CurseForge (seulement si un jeton est présent), notification. Chaque étape facultative est chargée à la demande : un module absent est signalé puis ignoré. Une cible en échec n'empêche pas le stockage des autres mais fait échouer la release (code 1) et déclenche une notification d'échec ; toute exception est capturée et notifiée. `--dry-run` n'affiche que le plan et la présence des modules.
- `bun mod open` ouvre `build/mod-dist/` ; `bun mod ci` imprime les cases hors racine 1.21.1 compilées par le workflow qualité.

Les variables (jetons, webhook Discord, stockage S3) viennent de l'environnement, complété par le `.env` racine sans l'écraser. Compiler une combinaison ne la rend pas « prise en charge » : voir les règles ci-dessus. Pour une nouvelle combinaison, ajouter l'entrée dans `mod/targets.json` (désactivée), puis documenter les essais en jeu ici.

### Quilt 1.21.11 : le JAR Fabric se charge tel quel (5 novembre 2026)

Aucun projet Quilt n'est créé : le JAR `minemories-fabric-mc1.21.11-*.jar` est lancé sous Quilt Loader 0.30.2 (profil `meta.quiltmc.org` pour 1.21.11, bibliothèques Mojang, Fabric API 0.141.6+1.21.11 en mod). Le test de capture automatisé de Fabric y passe avec les mêmes chiffres : 2507 blocs, 3 entités, 16 matériaux, GLB de 189 628 octets (5 maillages, 15 images). Le mod de test est remappé par la tâche `:fabric:remapGametestJar`, avec le module `fabric-client-gametest-api-v1` 4.3.5.

Ce que l'essai a révélé :
- Quilt 0.30.2 fournit Fabric Loader 0.19.5. Le `fabric.mod.json` exigeait ≥ 0.20.1, ce qui refusait le chargement ; la borne est maintenant ≥ 0.17.3, le minimum de Fabric API. Les anciens loaders Fabric entre 0.17.3 et 0.20.0 n'ont pas été essayés.
- Le module de test client de Fabric API 6.0.11 (Java 25) ne tourne pas sous Quilt et JDK 21 ; le 4.3.5 oui.

Limites : aucun GLB n'a été ouvert dans le viewer (pas de WebGL dans le navigateur intégré), et seul ce scénario de capture a été joué (menus, AFK et sélection manuelle non essayés sous Quilt). Quilt 1.21.11 n'est donc pas déclaré pris en charge.

### Forge 1.19.2 : compile, test en jeu automatisé passé, non validé dans le viewer (5 novembre 2026)

Sous-projet `mod/1.19.2` (Forge 43.5.2, Java 17, Architectury Loom, mappings Mojang), construit comme `mod/1.20.1` : les sources partagées sont copiées, adaptées par `adapt.gradle` puis compilées avec les classes de l'adaptateur Forge.

Écart mesuré avant portage : 123 erreurs de symboles dans 15 fichiers, dont 110 pour l'interface (`GuiGraphics`, `Button.builder`, `Tooltip`, `getX`/`getY`, `renderWidget`). Après la couche de compat ci-dessous, il restait 27 erreurs, toutes mécaniques : `sprite.contents()` renommé, `BuiltInRegistries` devenu `Registry`, `worldGenOptions`, `getIconBytes`, `BlockPos.containing`, `setHint`, atlas d'une version sans `getTextureLocations`.

**Couche de compat partagée par les cibles avant 1.20** : `mod/shared/compat-legacy`. Elle contient `GuiGraphics` (dessin sur `PoseStack`, objets via la pile modèle-vue), `Tooltip`/`Tooltips` (info-bulles dessinées par l'écran), `CompatButton` (le `Button.builder(...)` de 1.19.3+), `Clamp`, et `adapt-legacy.gradle` qui réécrit les écrans partagés (signatures `render`, `renderButton`, `x`/`y` des widgets). Le code commun reste celui de 1.21.1 ; chaque version ajoute seulement ses règles dans son `adapt.gradle`. Un motif qui cesse de correspondre fait échouer la compilation. 1.18.2 peut reprendre cette couche.

Test en jeu : `./gradlew :forge:runClientGametest` (depuis `mod/1.19.2`). Un mod de test Forge (`src/gametest`) appelle `TickDrivenCapture` à chaque tick client : monde plat, scène, `/minemories export 12` envoyé par l'écran de chat (une commande côté client n'est pas reconnue par `commandUnsigned`), puis vérification du GLB par `GlbReport` (partagé avec 1.21.11). Résultat : 2507 blocs, 3 entités, 17 matériaux, GLB de 181 556 octets, alpha BLEND et MASK présents. Le son est coupé par le test.

Particularités : l'herbe s'appelle `grass` avant 1.20.3 (`-Dminemories.gametest.grass=grass`) ; pas de champ de saisie avec indication (`setHint`), remplacé par la suggestion grise de `EditBox`. Limites : GLB non ouvert dans le viewer, menus et sélection manuelle non essayés. La cible n'est donc pas déclarée prise en charge.

### Fabric 1.19.2 : compile, test en jeu automatisé passé, non validé dans le viewer (5 novembre 2026)

Même sous-projet que Forge 1.19.2 (`mod/1.19.2`, module `fabric`), Fabric Loader 0.20.1 et Fabric API 0.77.0+1.19.2. Il reprend `mod/shared/compat-legacy` et ses règles d'adaptation ; seul l'adaptateur Fabric change, parce que l'API de rendu de Fabric API 0.77 est l'ancienne, à sprites multiples :

- `CaptureQuadEmitter` est réécrit pour cette API (`spriteColor`, `sprite`, `spriteBake(index, …)`, `fromVanilla(…, isItem)`, `toVanilla(index, …)`), et `FabricModelCapture` lit les UV par `spriteU(i, 0)`.
- L'API de 0.77 n'expose pas les drapeaux d'un matériau (mode de fusion, émissivité, indice de couleur) ; `MaterialFlags` les demande par réflexion à l'implémentation d'Indigo et retombe sur les valeurs par défaut ailleurs. Avec un autre moteur de rendu (Canvas…), le GLB peut donc perdre la translucidité et l'émissivité : non essayé.
- Les pixels d'un sprite passent par un accesseur Mixin (`SpriteImageAccess`, champ `mainImage`) : avant 1.19.3 `TextureAtlasSprite` n'a pas `getPixelRGBA` (Forge l'ajoute).
- `copyUv` n'existe pas dans cette API.

Test en jeu : `./gradlew :fabric:runClientGametest` (depuis `mod/1.19.2`), même scénario que Forge : 2507 blocs, 3 entités, 17 matériaux, GLB de 182 280 octets. Le mod de test Fabric rejoint le classpath de développement mais reste inactif sans `-Dminemories.gametest=true`. Limites : GLB non ouvert dans le viewer, Quilt 1.19.2 non essayé, menus et sélection manuelle non essayés. Cible non déclarée prise en charge.

### Forge 1.18.2 : compile, test en jeu automatisé passé, non validé dans le viewer (5 novembre 2026)

Sous-projet `mod/1.18.2` (Forge 40.3.12, Java 17, Architectury Loom), construit comme celui de 1.19.2 : mêmes règles d'adaptation de `mod/shared/compat-legacy`, plus `mod/shared/compat-pre-1.19` pour ce qui n'existe pas encore en 1.18 (`Component.literal` et `Component.translatable`, remplacés par `Components`; `Screen.rebuildWidgets`, remplacé par `clearWidgets(); init();`). Premier essai : 97 erreurs de symboles, 74 d'entre elles sur les composants de texte.

Ce qui change dans l'adaptateur Forge, écrit pour cette version : touches enregistrées dans `FMLClientSetupEvent` par `ClientRegistry`, événements d'écran `ScreenEvent.InitScreenEvent` et `DrawScreenEvent`, entrées `InputEvent.KeyInputEvent` et `MouseInputEvent`, sélection dessinée sur `RenderLevelLastEvent` (déprécié, il n'y a pas d'étape de rendu), modèles avec `IModelData`/`EmptyModelData` et `java.util.Random`, teinte du fluide par `FluidAttributes`. Le dessin de la sélection n'a pas été vu à l'écran.

Test en jeu : `./gradlew :forge:runClientGametest` (depuis `mod/1.18.2`), pilote `TickDrivenCapture` propre à 1.18.2 (monde plat créé par `Minecraft.createLevel`, commande envoyée par `Screen.sendMessage`). Résultat : 2507 blocs, 3 entités, 17 matériaux, GLB de 181 540 octets. Le démarrage prend environ deux minutes avant que le test avance. Limites : GLB non ouvert dans le viewer, menus et sélection manuelle non essayés ; cible non déclarée prise en charge.

### Fond des écrans en 1.20.1 : défaut trouvé et corrigé (5 novembre 2026)

Avant 1.20.2, `Screen.render` ne dessine pas le fond : chaque écran l'appelle lui-même. Les écrans partagés (écrits pour 1.21.1) comptent sur `render` pour le faire, et l'adaptation vers 1.20.1 ne le rétablissait pas : le panneau et le fond des écrans du mod n'étaient pas dessinés. Mesuré en jeu (Forge 1.20.1) : le pixel lu dans le panneau du hub était celui du ciel (`0xffdfc7b9`), pas la couleur du panneau (`0xff262925`). `mod/1.20.1/adapt.gradle` ajoute maintenant l'appel `renderBackground(graphics)` en tête de `render`, ce qui corrige aussi le module Fabric 1.20.1 ; le même pixel vaut `0xff262925` ensuite.

Le contrôle se lance par `./gradlew :forge:runClientGametest` depuis `mod/1.20.1` : monde plat, ouverture du hub, lecture d'un pixel du panneau dans le tampon d'image. Il vérifie le fond, pas la mise en page des boutons ni les textes. Les ponts 1.19.2 et 1.18.2 appellent `renderBackground` explicitement (`mod/shared/compat-legacy/adapt-legacy.gradle`) ; ils n'ont pas ce contrôle de pixel. Fabric 1.20.1 n'a pas été relancé en jeu.

### Inventaire chiffré : Forge 1.16.5 et Forge 1.12.2 (5 novembre 2026, rien de codé)

**Forge 1.16.5 (36.2.42).** Mesure : un sous-projet jetable (supprimé) compile les sources partagées déjà adaptées pour 1.18.2 contre Minecraft 1.16.5 (Architectury Loom, mappings Mojang) : 99 erreurs de symboles, un minimum puisque javac s'arrête avant le typage. Elles tiennent en quelques familles mécaniques : `addRenderableWidget` (19 usages, `addButton` avant 1.17), `JsonParser.parseString` (8, l'ancien Gson), `VertexFormat.Mode` et `RenderedVertexConsumer` (le rendu de capture, 380 lignes à réécrire pour les `RenderType` de l'époque), `getMinBuildHeight` (la hauteur est fixe, 0 à 255), `getYRot`/`getXRot`/`getBlockX` (champs et méthodes renommés), `CaptureLevelView`, `isHoveredOrFocused`, `GuiGraphics` (les quatre appels à `RenderSystem` de la couche de compat). C'est du même ordre que 1.18.2 (97 erreurs au premier essai).

La vraie question est Java 8. Le code partagé est en Java 17 : 58 `record`, 145 lignes avec `var` (28 fichiers), 22 lignes de `switch` à flèche, 14 `instanceof` à motif, 22 appels `List.of`/`Map.of`/`Set.of`, 12 lignes d'import de `java.net.http` (6 fichiers : `PairingClient`, `ChunkedUploader`, `DiagnosticsClient`, `StorageStatusClient`, `UploadPacer`, `ApiResponseBody`), plus `HexFormat`, `Math.clamp`, `getLast`, `Files.readString`. Les trois voies :

1. **Classes Java 17 sur Minecraft 1.16.5** : le coût se réduit aux 99 erreurs ci-dessus, soit un portage de la taille de 1.18.2. Ne fonctionne que si le joueur lance Forge 1.16.5 avec Java 16 ou 17, et pas sur le Java 8 que la plupart des lanceurs de modpacks emploient pour cette version. Non essayé : il faut vérifier que Forge 36.2.42 démarre sur Java 17.
2. **Vrai Java 8 avec un compilateur d'abaissement** (Jabel pour `var`, `switch`, `instanceof`) : reste à réécrire à la main les 58 `record` en classes et les 6 fichiers qui utilisent `java.net.http` avec `HttpURLConnection` (environ 1 500 lignes concernées), puis les appels d'API de Java 9 à 17. Au total, environ trois fois le travail de la voie 1.
3. **Cœur Java 8 séparé** : porter `core` (2 751 lignes, 15 fichiers, sans dépendance à Minecraft) en Java 8, et laisser le client sur Java 17. Insuffisant seul : le client reste en Java 17.

Recommandation : voie 1, puis décider de la voie 2 selon la demande. L'environnement n'a que les JDK 21 et 25 : tester Java 8 ou 16 demande d'en télécharger un, ce que je n'ai pas fait sans accord.

**Forge 1.12.2 (14.23.5.2864).** Non mesuré par compilation : ForgeGradle 2.3 exige Gradle 4.9 et un JDK 8, absent ici (Gradle 4.9 ne tourne pas sur un JDK 21). Estimation par comptage : sur 64 fichiers (9 992 lignes) du client partagé, 20 fichiers (4 939 lignes) touchent Minecraft, dont `ClientRuntime` (1 690 lignes), `ProgressiveGameCapture`, `RenderedModelCapture`, `PairingClient` et tous les écrans. Aucun n'est adaptable mécaniquement : 1.12.2 précède l'aplatissement (états de blocs par identifiant et métadonnées), n'a pas les noms Mojang (mappings MCP), ni Brigadier (commandes `CommandBase`), ni `BakedModel`/`BlockEntityRenderer` actuels (`IBakedModel`, `TileEntitySpecialRenderer`), ni `GuiGraphics`, et les entités passent par `Render<T>`. S'y ajoutent les 58 `record`, le Java 8 et le HTTP. C'est une réécriture du client, de l'ordre de 5 000 lignes, sur un cœur `core` à passer en Java 8. Voie la plus économe : un mod minimal pour 1.12.2 qui sérialise le monde visible (blocs et textures) avec `core` porté en Java 8, sans reprendre les écrans, l'AFK ni le diagnostic, et qui exporte par commande. Part de marché mesurée : au plus 1,4 % (voir ci-dessus).

### Forge 1.20.1 et Fabric 1.20.1 : test de capture en jeu passé (5 novembre 2026)

Le pilote `mod/1.20.1/gametest-common` (monde plat, scène, `/minemories export 12`, vérification du GLB, puis ouverture du hub et lecture d'un pixel du panneau) tourne sur les deux loaders : `./gradlew :forge:runClientGametest` ou `:fabric:runClientGametest`, depuis `mod/minemories-1.20.1`. Le mod de test Fabric rejoint le classpath de développement et reste inactif sans `-Dminemories.gametest=true`.

Résultat identique : 2507 blocs, 3 entités, 17 matériaux (GLB de 180 704 octets sous Forge, 180 732 sous Fabric). Modes alpha : 5 opaques, 8 `MASK` (feuilles, herbe, torche, coffre, vache, support d'armure…), 4 `BLEND` (verre teinté, eau). Coffre, vache, support d'armure et joueur passent par le rendu réel (texture `rendered/…`). Panneau du hub dessiné sur les deux.

Le premier essai a échoué sur `oak_leaves` : ce n'était pas un défaut du mod. Des feuilles sans tronc se dégradent avant l'export (l'entité `minecraft:item` en plus dans le GLB était leur butin) ; la scène partagée pose maintenant `oak_leaves[persistent=true]`. Le même essai a fait trouver l'écran d'accessibilité d'un profil neuf, que le pilote ferme. Limites : GLB non ouvert dans le viewer, sélection manuelle et menus non essayés.

## Versions visées par les modpacks (mesure du 5 novembre 2026)

Mesure : 500 modpacks Modrinth les plus téléchargés, chaque pack comptant pour ses téléchargements sur sa version de Minecraft la plus récente (estimation grossière ; CurseForge, où pèsent les gros packs Forge anciens, n'est pas mesuré).

| Minecraft | Loader | Part approximative |
|---|---|---|
| 1.21.11 | Fabric | 37 % |
| 1.20.1 | Forge / Fabric | 20 % / 10 % |
| 1.21.1 | Fabric / NeoForge / Forge | 20 % / 5 % / 5 % |
| 1.21.11 | Quilt / NeoForge / Forge | 4 % / 4 % / 2 % |
| 1.12.2, 1.19.2, 1.18.2, 1.16.5 | Forge surtout | 0,2 à 1,4 % chacune |

Déjà compilé : 1.20.1 (Forge, Fabric), 1.21.1 (NeoForge, Fabric, Forge) et 1.21.11 (Fabric, NeoForge et Forge, voir ci-dessous). Les cibles restantes sont dans `planned` de `mod/targets.json` avec une priorité (P1 à P4), leur version de loader et la difficulté attendue. Minecraft 1.21.11 est la cible P1 : le rendu a été refait depuis 1.21.5, c'est un portage et non une adaptation mécanique comme pour 1.20.1. Les anciennes versions (1.19.2 et avant) n'ont pas `GuiGraphics` ni les API de rendu actuelles.

### Écart mesuré pour Minecraft 1.21.11 (Fabric, 5 novembre 2026)

Compiler les sources 1.21.1 telles quelles contre 1.21.11 (Loom, Mojmap, Fabric API 0.141.6) donne environ 145 erreurs distinctes, concentrées dans la capture :

- API de rendu Fabric v1 (`RendererAccess`, `RenderMaterial`, `BlendMode`, `FabricBakedModel`) disparue ou réécrite : `FabricModelCapture`, `CaptureQuadEmitter`, `FabricPlatform`.
- `RenderType` / `RenderStateShard`, `GlStateManager` et la lecture de texture (`bind`, `getId`, `downloadTexture`) remplacés par la couche GPU : `RenderedModelCapture`, `CapturePixels`.
- Rendu des entités et blocs-entités par états de rendu (`prepare`, `getRenderOffset`, `render`) et `VertexConsumer.setLineWidth` : `ClientRuntime`, `ProgressiveGameCapture`.
- Renommages et API d'interface : `ResourceLocation`→`Identifier`, `getMinBuildHeight`→`getMinY`, `ClickEvent`/`HoverEvent`, `Matrix3x2f` pour la pile GUI, `renderContents` des boutons.

Le gros du travail est donc la capture de géométrie et de textures, qui demande une validation en jeu ; les renommages seuls ne suffisent pas.

### Port Fabric 1.21.11 : compile, non testé en jeu

`mod/1.21.11/` (Fabric loader 0.20.1, Fabric API 0.141.6+1.21.11, Java 21) compile avec `./gradlew :fabric:build` ; `bun mod status` le compte comme compilé.

Test en jeu : `./gradlew :fabric:runClientGameTest` (depuis `mod/1.21.11/`) ouvre Minecraft 1.21.11 (son coupé, `user.home` isolé dans `build/gametest-home`), crée un monde, place pierre, verre teinté, feuilles, herbe, coffre, eau et torche, fait apparaître une vache et un armor stand, lance `/minemories export 12` et vérifie le GLB (matériaux attendus, modes alpha BLEND et MASK). Il passe (5 novembre 2026) et a déjà trouvé les mixins de souris et de clavier cassés ainsi qu'un `fabric.mod.json` qui exigeait encore 1.21.1. Reste à valider : le GLB ouvert dans le viewer, d'autres modpacks et un rendu visuel comparé à Minecraft ; la cible ne doit pas être présentée comme prise en charge avant.

Les sources de `mod/1.21.1` sont copiées, adaptées par `adapt.gradle` (un motif qui ne correspond plus fait échouer le build) puis recouvertes par `overlay/java`. Par lot :

1. Renommages : `Identifier`, `getMinY`/`getMaxY`, `identifier()`, `WorldVersion.name()`, `GameProfile.id()`, `Camera.position()`, catégorie de touche `KeyMapping.Category` (la traduction `key.category.minemories.minemories` est ajoutée aux fichiers de langue à la compilation).
2. GUI : `renderContents` des boutons, `Matrix3x2fStack` (`pushMatrix`/`popMatrix`), `ClickEvent.RunCommand`, `HoverEvent.ShowText`.
3. Géométrie des blocs : `BakedQuad` est un record, `BakedQuads` (overlay) le remet dans l'ancienne disposition de sommets ; côté Fabric, `FabricModelCapture` collecte `BlockStateModel.emitQuads` dans un `MutableMesh` au lieu de l'ancienne API `RenderContext`.
4. Textures : `CapturePixels` lit les atlas par copie GPU (`copyTextureToTexture` puis `copyTextureToBuffer`, bande par bande) et relit les textures d'entités depuis leur image source, car elles n'ont pas `USAGE_COPY_SRC` ; `RenderedModelCapture` trouve la texture d'un `RenderType` par l'access widener (`RenderType.state`, `RenderSetup.textures`).
5. Entités et blocs-entités : `SubmitCapture` extrait l'état de rendu, le soumet à un `SubmitNodeStorage` privé et le vide dans le tampon de la capture avec un `FeatureRenderDispatcher` ; ombres, flammes et contours ne sont pas capturés.
6. Sélection en jeu : `WorldRenderEvents.END_MAIN` et `ShapeRenderer.renderShape` à la place de `renderLineBox`.

Points à vérifier en jeu : l'UV des quads Fabric après `toBakedQuad`, la lecture GPU des atlas, les blocs-entités hors de la distance de rendu (l'extraction saute le test `shouldRender`), et la borne de 4096 quads par modèle, désormais contrôlée après l'émission et non pendant.

Maintenance : le code propre à un loader reste dans `fabric/` derrière l'interface `ClientPlatform` (le cœur et `common` n'importent aucune classe de loader). Les deux classes d'`overlay/java` qui remplacent une classe partagée (`CapturePixels`, `RenderedModelCapture`) sont épinglées par `overlay/shared-sources.properties` : le build échoue si la version partagée change, pour reporter le correctif dans l'overlay puis mettre à jour l'empreinte.

### NeoForge 1.21.11 : compile, test en jeu passé, non validé dans le viewer

`mod/1.21.11/neoforge/` (NeoForge 21.11.48, Java 21, ModDevGradle) réutilise le même `adaptSources` que Fabric : la tâche vit dans le `build.gradle` racine de `mod/1.21.11/` et produit `build/adapted-sources`, chaque sous-projet ne contient que son adaptateur. `./gradlew :neoforge:build` réussit et `bun mod build neoforge 1.21.11` produit le JAR dans `build/mod-dist/`.

Ce qui change par rapport à NeoForge 1.21.1 : `@EventBusSubscriber` sans `bus`, `AddClientReloadListenersEvent`, `RenderLevelStageEvent.AfterTranslucentBlocks`, géométrie par `BlockStateModel.collectParts` (les données de modèle viennent du niveau), `NeoForgeVersion` déplacé dans `common`, et un access transformer pour `RenderType.state`, `RenderSetup.textures` et `TextureAtlas.texturesByName`.

Test en jeu : `./gradlew :neoforge:runClientGametest` ; NeoForge n'a pas d'API de test client, un petit mod (`src/gametest`) pilote donc le client depuis ses ticks (monde plat, scène, `/minemories export 12`, vérification du GLB). La scène et les vérifications sont partagées avec Fabric dans `gametest-common/`. Résultat identique sur les deux loaders (2507 blocs, 3 entités, 16 matériaux). Comme pour Fabric, le GLB n'a pas été ouvert dans le viewer (WebGL absent du navigateur intégré) : la cible n'est pas déclarée prise en charge.

### Forge 1.21.11 : compile, test en jeu automatisé passé, non validé dans le viewer

`mod/1.21.11/forge/` (Forge 61.2.5, Java 21) réutilise le même `adaptSources`. `./gradlew :forge:build` réussit et `bun mod build forge 1.21.11` produit le JAR dans `build/mod-dist/`.

Deux écarts avec les autres loaders, à connaître avant de toucher à ce projet :

- **Plugin Gradle** : Architectury Loom résout Forge 61.2.5 et compile, mais le jeu planterait au démarrage (`NoSuchMethodError` sur `ByteBufCodecs$11`, jar Minecraft patché de façon incohérente). Le projet utilise donc ForgeGradle 7 (`net.minecraftforge.gradle`, mappings `official`). FML 61 ne trouve la classe `@Mod` que si les classes sont compilées à côté de `mods.toml` : `build.gradle` compile dans `build/resources/main`.
- **EventBus 7** : chaque événement a son `BUS`, les écouteurs sont enregistrés dans `ForgeClient.initialize()` au lieu d'annotations ; `RenderLevelStageEvent` n'existe plus, la sélection est dessinée par une passe `AddFramePassEvent` sur la cible principale. Les accès aux textures passent par un access transformer.

Test en jeu automatisé : `./gradlew :forge:runClient -PgameTest=true` (depuis `mod/minemories-1.21.11`). ForgeGradle 7 ne sait pas lancer deux mods à la fois (la tâche `slimeLauncherMetadataForForge` est créée en double), et FML ne trouve les classes d'un second dossier que s'il a son propre `mods.toml`. Avec la propriété, les classes de test sont donc compilées dans le dossier du mod, et `src/gametest/mods-gametest.toml` est ajouté à son `mods.toml` comme seconde entrée `[[mods]]` ; sans la propriété rien ne change dans le JAR. Le pilote `TickDrivenCapture` est celui de NeoForge. Résultat : 2507 blocs, 3 entités, 16 matériaux, GLB de 189 616 octets, les mêmes chiffres que Fabric et NeoForge. La cause du blocage « bloqué sur l'écran titre » n'était pas la découverte du mod mais l'écran d'accessibilité qu'un profil neuf ouvre avant le titre : le pilote le ferme maintenant. Limites : le dessin de la sélection par la passe `AddFramePassEvent` n'a pas été vu à l'écran, et le GLB n'est pas ouvert dans le viewer.
