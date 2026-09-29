# Architecture du monorepo

## Modules actuels

- `mod/minemories/`: projet Gradle du mod client Minecraft NeoForge.
- `mod/minemories/neoforge/`: adaptateur NeoForge, commandes et capture du jeu.
- `mod/minemories/core/`: bibliothèque Java sans dépendance Minecraft pour assembler la scène et écrire le GLB.
- `apps/web/`: SPA React (stylisée avec Tailwind CSS, thème dans `src/theme.css`) avec pages d'accueil, authentification, galerie privée et viewer Three.js. L’ouverture locale de GLB reste possible sans compte.
- `apps/api/`: API Bun/Hono avec Better Auth, oRPC, SQLite et stockage objet S3 compatible.
- `packages/api-contract/`: contrat oRPC partagé par l’API et le viewer, sans logique serveur. Les routes REST utilisées par le mod sont définies dans `apps/api/src/index.ts`.
- `docs/`: documentation transverse et état du POC.

Les builds Minecraft sont orchestrés par le wrapper Gradle dans `mod/minemories/`. Les apps TypeScript sont gérées par Bun workspaces et vérifiées par Biome. Les applications restent indépendantes : une évolution de l’une ne doit pas imposer son runtime aux autres.

## Contrat mod → viewer

Le format de capture reste un glTF binaire `.glb` autonome avec géométrie, UV, textures embarquées, matériaux alpha/émissifs et, lorsque disponibles, lumières ponctuelles `KHR_lights_punctual`. Le viewer sait toujours charger un fichier local; l'API ajoute en option le stockage lié au compte.

Avant de faire évoluer le format, documenter les métadonnées nécessaires (sélection, date, monde, version/mods) et leur compatibilité descendante.

## Extensions prévues

Les futurs outils vont dans `apps/<nom>/`. Les adaptateurs Fabric, Forge et Quilt, s'ils sont développés, restent sous `mod/minemories/` et partagent `mod/minemories/core/` lorsqu'une API neutre est appropriée.

## Développement de l'API

Prérequis : Bun 1.4.2 et Docker Compose. Depuis la racine :

```sh
cp .env.example .env
# Remplacer BETTER_AUTH_SECRET et PAIRING_PEPPER par deux secrets distincts d'au moins 32 caractères.
docker compose up -d
bun api:dev
```

L'API écoute sur `http://localhost:3001`; l'endpoint S3 Garage de développement est sur `http://127.0.0.1:3900` (identifiants locaux du fichier `.env.example`). SQLite est conservé sous `apps/api/data/` et les objets Garage dans les volumes Docker `garage_meta` et `garage_data`. Arrêter Garage avec `docker compose down`; ajouter `-v` supprime les données locales.

Si le démon Docker n'est pas disponible, le stockage local peut être utilisé le temps du développement en ajoutant `STORAGE_DRIVER=filesystem` et `LOCAL_OBJECTS_PATH=./data/objects` à `.env`. Les GLB sont alors écrits dans `apps/api/data/objects/`; cette option ne remplace pas Garage pour un déploiement.

Le viewer crée un code à six chiffres via la procédure oRPC authentifiée; il expire après cinq minutes et ne peut servir qu'une fois. Le mod utilise `/minemories pair <code>` pour échanger le code contre un jeton d'appareil, enregistré dans `config/minemories.properties` du profil Minecraft. `/minemories upload` envoie `~/export/capture.glb` à l'API. Le jeton ne donne accès qu'à l'envoi pour le compte auquel l'appareil est lié. L'API garde les octets dans Garage et les métadonnées propriétaire-scopées dans SQLite.

La galerie vérifie le statut d'appairage par polling et actualise la liste des souvenirs. Le téléchargement d'un GLB est authentifié et limité au propriétaire; le viewer intégré garde son propre document pour isoler le moteur Three.js du shell React. En développement, un fichier local peut toujours être ouvert depuis la barre de navigation ou l'écran du viewer.
