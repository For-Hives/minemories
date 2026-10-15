# Support des loaders Minecraft

Un *launcher* (CurseForge, Prism Launcher, Minecraft Launcher) démarre un profil. Un *loader* (NeoForge, Fabric, Forge, Quilt) fournit les API utilisées par le mod. Changer de launcher ne nécessite pas un autre JAR si la version de Minecraft et le loader restent identiques ; changer de loader nécessite généralement un build et un adaptateur propres.

| Cible | État | Notes |
| --- | --- | --- |
| Minecraft 1.21.1 + NeoForge 21.1.248 | POC testé par l'utilisateur | Export client GLB depuis le profil CurseForge `mc breval`. |
| Minecraft 1.21.1 + Fabric Loader 0.19.5 / API 0.116.17+1.21.1 | Validation en cours | JAR remappé lancé en production ; capture standard vérifiée dans Blender. Contenu moddé et fonctions interactives à valider. |
| Minecraft 1.21.1 + Quilt Loader 0.30.1 | Validation en cours | Même JAR Fabric et même API : lancement et export standard vérifiés ; couverture complémentaire requise. |
| Minecraft 1.21.1 + Forge 52.1.19 | Validation en cours | JAR remappé lancé en production ; capture standard vérifiée dans Blender. Contenu moddé et fonctions interactives à valider. |

Une cible n'est supportée qu'après compilation **et** validation en jeu de blocs standards, textures transparentes et teintées, fluides, block entities et contenu moddé. La compatibilité avec tous les mods d'un modpack ne découle pas de la compatibilité avec son loader.

## Structure actuelle

- `:core` reste une bibliothèque Java sans dépendance Minecraft, responsable de la sérialisation GLB.
- `:common` contient la capture Minecraft, les écrans, les transferts et leurs tests indépendants du loader. Son interface `ClientPlatform` isole les modèles, données de blocs, fluides, sprites et versions. Ce module ne constitue pas un mod installable.
- `:neoforge` conserve ModDevGradle et les événements/API NeoForge ; il embarque les classes communes et `:core`.
- `:fabric` utilise Architectury Loom 1.17.487, les événements Fabric API et des mixins ciblés pour les frames pendant la pause, les entrées et les données de texture. Son JAR remappé embarque également les classes communes et `:core` ; Fabric API reste une dépendance à installer.
- `:forge` utilise Loom séparément avec les événements Forge, ses model data et ses hooks de fluides. Ses accès aux classes de rendu sont convertis en access transformers lors du remappage.

Le collecteur Fabric Renderer API accepte les modèles personnalisés, meshes, transformations et fallbacks avec leurs couleurs, alpha et matériaux émissifs. Il borne le nombre de quads et de transformations par modèle ; les primitives non finies restent rejetées. Cette interface ne garantit pas la prise en charge de tout renderer tiers.

Cette migration est volontairement séparée du POC NeoForge existant : un module qui compile n'est pas une preuve que les exports sont équivalents en jeu.


## Matrice de release

`config/mod-targets.json` déclare Minecraft, loader, version du loader, projet Gradle et Java pour chaque cible. La CI de release génère sa matrice à partir des entrées `enabled: true`, qui doivent aussi avoir `validatedInGame: true`. Actuellement : NeoForge 21.1.248 / Minecraft 1.21.1 / Java 21. Les lignes Fabric, Forge et Quilt sont des réservations désactivées, pas des JAR compatibles déjà disponibles.

Pour activer un nouveau loader : ajouter son adaptateur et son projet dans Gradle, vérifier que son JAR distribue les classes communes, le tester en jeu, renseigner `loaderVersion`, puis activer sa ligne. La CI construit séparément les archives et les publie dans la même release avec des noms et manifestes distincts. Ajouter une ligne ne porte pas le code NeoForge vers ce loader.
`bun mod:check:ci` et `bun mod:build` couvrent les modules Java. Les JAR installables sont dans `neoforge/build/libs/`, `fabric/build/libs/` et `forge/build/libs/`. Choisir celui du loader : le JAR NeoForge reste le téléchargement proposé par défaut sur le site. Quilt est évalué avec le JAR Fabric, sans quatrième artefact.

## Validation du portage

Le 15 octobre 2026, les JAR livrables NeoForge, Fabric et Forge ont été lancés dans des clients isolés ; le JAR Fabric a également été lancé sous Quilt. Le scénario contient coffre, feuilles, verre rouge, eau, mouton teinté et Enderman. Les captures passent les validateurs GLB/métadonnées de l'API ; les rendus NeoForge, Fabric et Forge ont été inspectés dans Blender. La capture conserve les onze états OpenGL contrôlés, notamment un pixel pack buffer de 16 octets et des paramètres de packing non standards.

Ces contrôles intermédiaires ne suffisent pas encore à annoncer les nouveaux loaders comme supportés. La validation complémentaire Forge, la régression NeoForge/Flywheel et la distribution CI restent à terminer. Une compilation CI ne remplace pas ces essais graphiques.

Le scénario Fabric complémentaire utilise un bloc de validation enregistré par un mod compagnon, avec un modèle Renderer API non vanilla : fallback cubique transformé, teinte personnalisée, alpha et émission, puis un mesh supplémentaire cyan. Ce test natif a détecté une hypothèse interne d'Indigo dans `Mesh.outputTo` ; le collecteur parcourt désormais les quads par l'API publique avant de les envoyer à son émetteur borné. L'export corrigé contient 1 018 triangles, les deux matériaux personnalisés et le mesh visible dans Blender. Le test porte sur cette interface contrôlée ; il ne certifie pas tous les mods Fabric.

Sous Fabric puis Quilt, le scénario interactif a également vérifié le raccourci M, le bouton Minemories du menu pause, le respect de `afkSnapshots=false`, puis une capture progressive complète pendant la pause après activation explicite. Le scope de capture est inactif entre les frames. Le GLB progressif contient le bloc de test, le mesh, les entités et leurs matériaux ; il passe les validateurs API. Les délais et répertoires de ce scénario sont propres au profil isolé, sans toucher les préférences ou sauvegardes personnelles.

## Artefacts de compilation

`bun run build` prépare les trois distributions dans `build/mod-loaders/{neoforge,fabric,forge}/`. Chaque répertoire contient son JAR, une empreinte `.sha256` et un `manifest.json` avec version du mod, Minecraft, loader, version du loader, taille et empreinte. Le manifeste Fabric indique aussi la version de Fabric API à installer. `bun run package:mod:all` refait uniquement ce conditionnement à partir des JAR déjà construits.

La CI conserve les trois paquets, puis les télécharge dans trois jobs distincts. Chaque job vérifie le loader attendu, ses métadonnées et les octets du JAR contre l’empreinte du job de compilation. Les tests de conditionnement refusent les builds absents/ambigus, les manifestes réétiquetés et les empreintes altérées. Quilt utilise le JAR Fabric, sans quatrième paquet.

Le téléchargement du site et le workflow de publication existant restent explicitement NeoForge. Les artefacts Fabric/Forge sont disponibles par la CI ; leur publication sur les plateformes demande une configuration et une validation de version adaptées à chaque loader.
