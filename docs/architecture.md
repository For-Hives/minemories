# Architecture du monorepo

## Modules actuels

- `mod/`: projet Gradle du mod client Minecraft NeoForge.
- `mod/core/`: bibliothèque Java sans dépendance Minecraft pour assembler la scène et écrire le GLB.
- `apps/viewer-web/`: viewer web autonome; il charge localement des fichiers GLB dans le navigateur.
- `docs/`: documentation transverse et état du POC.

Les builds Minecraft restent orchestrés par le wrapper Gradle à la racine. Le viewer web est géré par Bun workspaces. Les applications restent indépendantes : une évolution de l'une ne doit pas imposer son runtime aux autres.

## Contrat mod → viewer

Le contrat initial est un fichier glTF binaire `.glb` autonome avec géométrie, UV, textures embarquées, matériaux alpha/émissifs et, lorsque disponibles, lumières ponctuelles `KHR_lights_punctual`. Le viewer n'envoie pas le fichier à un serveur : le chargement est local au navigateur.

Avant de faire évoluer le format, documenter les métadonnées nécessaires (sélection, date, monde, version/mods) et leur compatibilité descendante.

## Extensions prévues

Les futurs outils vont dans `apps/<nom>/`. Les adaptateurs Fabric, Forge et Quilt, s'ils sont développés, restent sous `mod/` et partagent `mod/core/` lorsqu'une API neutre est appropriée.
