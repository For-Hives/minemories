# Architecture du monorepo

## Modules actuels

- `mod/`: projet Gradle du mod client Minecraft NeoForge.
- `mod/core/`: bibliothèque Java sans dépendance Minecraft pour assembler la scène et écrire le GLB.
- `apps/viewer-web/`: viewer web autonome; il charge localement des fichiers GLB dans le navigateur.
- `apps/api/`: API Bun/Hono avec Better Auth, oRPC, SQLite et stockage objet S3 compatible.
- `packages/api-contract/`: contrat oRPC partagé par l'API et le viewer.
- `docs/`: documentation transverse et état du POC.

Les builds Minecraft restent orchestrés par le wrapper Gradle à la racine. Les apps TypeScript sont gérées par Bun workspaces et vérifiées par Biome. Les applications restent indépendantes : une évolution de l'une ne doit pas imposer son runtime aux autres.

## Contrat mod → viewer

Le format de capture reste un glTF binaire `.glb` autonome avec géométrie, UV, textures embarquées, matériaux alpha/émissifs et, lorsque disponibles, lumières ponctuelles `KHR_lights_punctual`. Le viewer sait toujours charger un fichier local; l'API ajoute en option le stockage lié au compte.

Avant de faire évoluer le format, documenter les métadonnées nécessaires (sélection, date, monde, version/mods) et leur compatibilité descendante.

## Extensions prévues

Les futurs outils vont dans `apps/<nom>/`. Les adaptateurs Fabric, Forge et Quilt, s'ils sont développés, restent sous `mod/` et partagent `mod/core/` lorsqu'une API neutre est appropriée.

## Développement de l'API

Prérequis : Bun 1.4.2 et Docker Compose. Depuis la racine :

```sh
cp .env.example .env
# Remplacer BETTER_AUTH_SECRET et PAIRING_PEPPER par deux secrets distincts d'au moins 32 caractères.
docker compose -f infra/dev/docker-compose.yml up -d
bun run dev:api
```

L'API écoute sur `http://localhost:3001`; la console MinIO de développement est sur `http://localhost:9001` (identifiants du fichier `.env.example`). SQLite est conservé sous `apps/api/data/` et les objets MinIO dans le volume Docker `minio_data`. Arrêter MinIO avec `docker compose -f infra/dev/docker-compose.yml down`; ajouter `-v` supprime les données locales.

Si le daemon Docker n'est pas disponible, le stockage local peut être utilisé le temps du développement en ajoutant `STORAGE_DRIVER=filesystem` et `LOCAL_OBJECTS_PATH=./data/objects` à `.env`. Les GLB sont alors écrits dans `apps/api/data/objects/`; cette option ne remplace pas MinIO pour un déploiement.

Le viewer crée un code à six chiffres via la procédure oRPC authentifiée; il expire après cinq minutes et ne peut servir qu'une fois. Le mod utilise `/memorypoc pair <code>` pour échanger le code contre un jeton d'appareil, enregistré dans le dossier `config` du profil Minecraft. `/memorypoc upload` envoie `~/export/capture.glb` à l'API. Le jeton ne donne accès qu'à l'envoi pour le compte auquel l'appareil est lié. L'API garde les octets dans MinIO et les métadonnées propriétaire-scopées dans SQLite. La récupération/téléchargement des souvenirs depuis le viewer reste à implémenter.
