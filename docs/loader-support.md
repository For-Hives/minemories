# Support des loaders Minecraft

Un *launcher* (CurseForge, Prism Launcher, Minecraft Launcher) démarre un profil. Un *loader* (NeoForge, Fabric, Forge, Quilt) fournit les API utilisées par le mod. Changer de launcher ne nécessite pas un autre JAR si la version de Minecraft et le loader restent identiques ; changer de loader nécessite généralement un build et un adaptateur propres.

| Cible | État | Notes |
| --- | --- | --- |
| Minecraft 1.21.1 + NeoForge 21.1.248 | POC testé par l'utilisateur | Export client GLB depuis le profil CurseForge `mc breval`. |
| Fabric 1.21.1 | Prévu | Adaptateur client et validation en jeu à faire. |
| Quilt 1.21.1 | À vérifier après Fabric | Un JAR Fabric peut fonctionner sous Quilt, sans garantie pour les hooks et dépendances utilisés ici. |
| Forge 1.21.1 | Prévu séparément | API de rendu, model data et hooks à porter puis à tester. |

Une cible n'est supportée qu'après compilation **et** validation en jeu de blocs standards, textures transparentes et teintées, fluides, block entities et contenu moddé. La compatibilité avec tous les mods d'un modpack ne découle pas de la compatibilité avec son loader.

## Structure visée, par étapes

Le dépôt a déjà Gradle, Spotless et `:core`, une bibliothèque Java sans classes Minecraft qui sérialise le GLB. La racine de `mod/minemories/` est aujourd'hui le mod NeoForge. Il ne faut pas ajouter Architectury comme simple dépendance à cette racine : les hooks `RegisterClientCommandsEvent`, `RenderLevelStageEvent`, `ModelData`, `FluidSpriteCache` et `IClientFluidTypeExtensions` du POC restent spécifiques à NeoForge.

1. Garder `:core` pour la sérialisation GLB et ses tests JUnit. Extraire la capture Minecraft partageable dans un nouveau module `:common` seulement quand son interface avec les loaders est établie.
2. Déplacer l'adaptateur actuel dans `:neoforge` sans changer son comportement, son `modId` ou son JAR final. Valider `runClient`, `build` et un export visuel après ce déplacement.
3. Choisir une version d'Architectury Loom compatible avec **Minecraft 1.21.1, NeoForge et Fabric** et créer `:fabric`. Garder les entrées, commandes et hooks non portables dans chaque module de loader. Architectury API peut aider pour les événements communs ; Loom et API sont distincts.
4. Valider les deux clients séparément en jeu, puis seulement évaluer Quilt et Forge. Une matrice CI peut compiler chaque artefact, mais ne remplace pas les essais graphiques et les mods tiers.

Cette migration est volontairement séparée du POC NeoForge existant : un module qui compile n'est pas une preuve que les exports sont équivalents en jeu.
