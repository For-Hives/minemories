# Monorepo architecture

## Current modules

- `mod/1.21.1/`: Gradle project for the NeoForge Minecraft client mod.
- `mod/1.21.1/neoforge/`: NeoForge adapter, commands and game capture.
- `mod/shared/core/`: Java library with no Minecraft dependency that assembles the scene and writes the GLB.
- `apps/web/`: React SPA (styled with Tailwind CSS, theme in `src/theme.css`) with landing pages, authentication, private gallery and Three.js viewer. Opening a local GLB still works without an account.
- `apps/api/`: Bun/Hono API with Better Auth, oRPC, SQLite and S3-compatible object storage.
- `packages/api-contract/`: oRPC contract shared by the API and the viewer, with no server logic. The REST routes used by the mod are defined in `apps/api/src/index.ts`.
- `docs/`: cross-cutting documentation and POC status.

Minecraft builds are orchestrated by the Gradle wrapper in `mod/1.21.1/`. The TypeScript apps are managed by Bun workspaces and checked by Biome. The applications stay independent: a change in one must not force its runtime onto the others.

## Mod → viewer contract

The capture format remains a self-contained binary glTF `.glb` with geometry, UVs, embedded textures, alpha/emissive materials and, when available, `KHR_lights_punctual` point lights. The viewer can always load a local file; the API optionally adds account-linked storage.

Before changing the format, document the required metadata (selection, date, world, version/mods) and its backward compatibility.

## Planned extensions

Future tools go into `apps/<name>/`. The Fabric, Forge and Quilt adapters, if developed, stay under `mod/1.21.1/` and share `mod/shared/core/` where a neutral API makes sense.

## API development

Prerequisites: Bun 1.4.2 and Docker Compose. From the repository root:

```sh
cp .env.example .env
# Replace BETTER_AUTH_SECRET and PAIRING_PEPPER with two distinct secrets of at least 32 characters.
docker compose up -d
bun api:dev
```

The API listens on `http://localhost:3001`; the development Garage S3 endpoint is at `http://127.0.0.1:3900` (local credentials from `.env.example`). SQLite is kept under `apps/api/data/` and Garage objects in the Docker volumes `garage_meta` and `garage_data`. Stop Garage with `docker compose down`; adding `-v` deletes the local data.

If the Docker daemon is unavailable, local storage can be used during development by adding `STORAGE_DRIVER=filesystem` and `LOCAL_OBJECTS_PATH=./data/objects` to `.env`. GLBs are then written to `apps/api/data/objects/`; this option does not replace Garage for a deployment.

The viewer creates a six-digit code through the authenticated oRPC procedure; it expires after five minutes and can only be used once. The mod uses `/minemories pair <code>` to exchange the code for a device token, saved in `config/minemories.properties` of the Minecraft profile. `/minemories upload` sends `~/export/capture.glb` to the API. The token only grants uploads for the account the device is linked to. The API keeps the bytes in Garage and the owner-scoped metadata in SQLite.

The gallery polls the pairing status and refreshes the list of memories. Downloading a GLB is authenticated and limited to the owner; the embedded viewer keeps its own document to isolate the Three.js engine from the React shell. In development, a local file can still be opened from the navigation bar or the viewer screen.
