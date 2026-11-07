# Minemories

Minemories captures an area of Minecraft into a self-contained GLB file, opens it in a web viewer and, after explicit pairing, uploads it to a private gallery. The client mod targets **Minecraft 1.21.1**: NeoForge 21.1.248, Fabric Loader 0.19.5 with Fabric API 0.116.17+1.21.1, and Forge 52.1.19. The Fabric JAR has also been tested under Quilt 0.30.1. See the [validation matrix and its limits](docs/features/loader-support.md).

## Structure

| Path | Role |
| --- | --- |
| `mod/1.21.1/` | Gradle project. `:core` serializes the GLB without Minecraft; `:common` holds the shared client; `:neoforge`, `:fabric` and `:forge` isolate the loader hooks. See the [validation matrix](docs/features/loader-support.md). |
| `apps/web/` | React / Three.js viewer. |
| `apps/api/` | Bun / Hono API, Better Auth, SQLite and S3 object storage. |
| `packages/api-contract/` | oRPC contract shared by the API and the web app; this folder is a library, not an application. |
| `docs/` | Architecture, workflow and POC status. |

The oRPC contract describes the `pairing` and `memories` procedures used by the web app. The mod's HTTP routes are defined in `apps/api/src/index.ts` and stay separate.

The `mod/` folder may host other Minecraft projects; `minemories` remains the Gradle project name. The mod now uses the `minemories` identifier, the `/minemories` command and the `Minemories` class name.

## Local setup

Prerequisites: Bun 1.4.3, Node.js 22.12+, JDK 21 and Docker Compose. From the repository root:

```sh
bun install --frozen-lockfile
cp .env.example .env
# Replace BETTER_AUTH_SECRET and PAIRING_PEPPER with two distinct secrets of at least 32 characters.
docker compose up -d
bun api:dev
bun web:dev
```

The API listens on `localhost:3001`, the web app on `localhost:5173`. Compose runs a single-node Garage on `127.0.0.1:3900` for development. The mod's Minecraft profile is independent of your CurseForge profile:

```sh
bun mod:dev
```

On first launch, Gradle downloads the game dependencies; later launches only recompile what changed. The game folder is `mod/1.21.1/run/`. To reproduce an interaction with a modpack, add the relevant NeoForge 1.21.1 JARs to `run/mods/`. See [the workflow](docs/concepts/development-workflow.md).

## Mod interface

In a world, open the pause menu and click **Minemories**; the button is also in the options screen. The **M** key, rebindable in the controls, opens the menu even when a modpack uses a custom pause menu. A player who is not signed in yet also gets, once per world join, a clickable chat message that opens this menu.

The home screen is deliberately minimal: the connection status, the six-digit gallery code field (with a link to the website to find it) and three large icon actions: **Take a memory**, **Auto memories** (on by default) and **My memories** (local captures). The **Settings** button opens the advanced settings screen: API, local folder, local or selection export, AFK, storage, remote world, diagnostics, suggested areas and account sign-out. The defaults are described in [zero-configuration install](docs/features/first-run-defaults.md).

AFK captures are on by default after **5 minutes of inactivity**, at most once every **4 hours**, even while paused or in the background. Without a linked account they stay local; after pairing, they are uploaded to the private gallery. The advanced settings let you adjust the delay, frequency, radius (**32 blocks by default**, adjustable from 2 to 128), local folder and API. They also offer a local export, or an export of the selection defined by commands, without uploading. Depth follows local visits; full-height capture is an advanced setting. The commands keep their default radius of 128 blocks and only capture loaded chunks.

Each export keeps a GLB and its metadata in a dated folder under `~/export/history/` by default. `capture.glb` and `capture.json` remain copies of the latest export. **Memories on this computer** lets you browse and upload the kept captures; plan for disk space and backups, as nothing is ever deleted locally automatically. See [local history](docs/features/local-capture-history.md). Errors go to the Minecraft log, and closing the menu returns to the previous screen.

Technical diagnostics are **on by default** once the account is linked (never before pairing) and can be turned off in the advanced settings; an explicit refusal is kept across account or API changes. Reports exclude free-form messages, URLs, tokens, paths, coordinates, seed, world/player names and captures. They are tied to the account/device and can only be read by the API operator. See [consent, limits and withdrawal](docs/features/consented-diagnostics.md).

To quickly test the local flow, run `bun api:dev`, `bun web:dev` and `bun mod:dev`, set the mod's API to `http://localhost:3001` in the advanced settings, create a test world, capture, create the code in the web app, then link the mod and upload the file. The file `mod/1.21.1/run/config/minemories.properties` stores the local token.

## Commands

| Command | Effect |
| --- | --- |
| `bun mod:dev` | Starts the NeoForge development client (`runClient`). |
| `bun mod:build` | Builds and checks the Gradle JAR in `mod/1.21.1/neoforge/build/libs/`. This build does not minify. |
| `bun mod:check` | Applies Spotless then runs the Gradle checks (JUnit, JaCoCo, SpotBugs, compilation). Modifies sources if needed. |
| `bun mod:check:ci` | Same checks without modifying files. |
| `bun web:dev` / `bun api:dev` | Starts the applications separately. |
| `bun web:check` | Biome, TypeScript and Vitest with 100% coverage of the viewer utilities; tests of the shared oRPC contract. |
| `bun api:check` | Biome for the API and contract, API TypeScript, then isolated Bun tests with a coverage report (GLB, HTTP routes, pairing and file storage). |
| `bun check` / `bun run build` | Checks the whole repository, then builds the mod JAR, download files and web bundle. |

`bun <script>` is Bun's shortcut for `bun run <script>`, except for built-in commands such as `build`: use `bun run build` for the repository script. In CI, `bun check` does not rewrite any file.

`bun format` applies the Biome 2.5.15 configuration: tabs, 120 columns and optional semicolons. For Java, `bun mod:check` applies Spotless and runs JUnit, JaCoCo and SpotBugs; `bun mod:check:ci` checks without modifying. The `:core` tests also check the GLB container with invalid inputs and extreme coordinates. Menu trials and in-game GLB rendering are still required before claiming support for a loader.

## Storage and data

`.env.example` only contains **local development** credentials for Garage. Change the keys and configuration before any deployment, and do not expose the S3 port without protection. Garage data lives in the `garage_meta` and `garage_data` volumes; `docker compose down` keeps them, `down -v` erases them. If you had objects in the old `minio_data` volume, switching to Garage **does not transfer them**: export and re-import them before deleting that volume.

The API can use `STORAGE_DRIVER=filesystem` and `LOCAL_OBJECTS_PATH=./data/objects` for development without Docker. GLB exports stay local by default; uploading to the server requires explicit pairing. The pairing token is stored in `config/minemories.properties`. See [the architecture](docs/concepts/architecture.md) and [the loaders](docs/features/loader-support.md).

Mod captures can be uploaded in 4 MiB chunks, up to 200 MiB, with resume after interruption. See [the protocol and deployment constraints](docs/features/resumable-uploads.md).

## Mod installation and distribution

The mod uses the `https://api.minemories.net` API by default. The M menu opens on a minimal home screen: sign-in with the gallery code, on-demand memory, automatic photos. The advanced settings let you choose the local folder, a compatible custom API, and the delay, frequency and size of AFK captures (on by default). An AFK preference that is already stored is kept. Changing the API removes the previous account's credentials.

`bun run build` checks and builds the whole repository, including the mod. The front end builds on its own with `bun run --filter @minemories/web build`, with no Java or local JAR. The `/installation` page offers the latest JAR compatible with the chosen Minecraft version and loader, served by the Minemories API: drop the file into `mods`, no ZIP to extract. The mod is built and published with the local `bun mod` tool (on the production VPS), never from GitHub Actions. See [distribution and settings](docs/features/mod-distribution.md) for project/secret configuration and in-game checks.

## Automatic releases

The VPS runs `bun mod release`: a production build of each enabled target (Minecraft x loader from `mod/targets.json`), headless in-game tests, S3 storage (3 versions per target), an index read by the website, Modrinth/CurseForge publishing when configured, and a Discord notification. A merge into `main` publishes nothing: GitHub CI only runs checks. [Flow, versions and setup](docs/features/automatic-releases.md).
