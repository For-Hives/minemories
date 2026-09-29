# Repository Guidelines

## Monorepo Map

- `apps/web/` — React + Three.js SPA (Bun workspace `@minemories/web`).
- `apps/api/` — Bun/Hono + Better Auth + oRPC + SQLite + S3-compatible storage (`@minemories/api`).
- `packages/api-contract/` — oRPC + zod contract shared by API and web. Edit here first when changing RPC shapes.
- `mod/minemories/` — Gradle root. `:core` in `mod/minemories/core/` is loader-independent GLB code; `:neoforge` in `mod/minemories/neoforge/` is the client adapter.
- `docs/` (French), `docker-compose.yml`, `scripts/` (`gradle.mjs`).

## Commands (run from repo root)

- Install: `bun install` locally; CI uses `bun install --frozen-lockfile`. Bun 1.4.2, Node >=22.12, JDK 21.
- `docker compose up -d` starts local Garage (S3 endpoint `127.0.0.1:3900`). Root `.env` needs two distinct 32+ character auth secrets.
- `bun mod:dev` starts Gradle `:neoforge:runClient` in `mod/minemories/`; `bun mod:build` builds the distributable JAR.
- `bun mod:check` runs `spotlessApply check` and modifies Java files; `bun mod:check:ci` runs `check` without edits.
- `bun web:dev` / `bun web:check` / `bun web:build`; `bun api:dev` / `bun api:check`.
- `bun check` is the no-fix aggregate quality gate. `bun build` checks everything, then builds web and mod.
- Single TS test: `bun run --filter @minemories/web test -- src/lib/glb.test.ts`.
- Java (from `mod/minemories/`): `./gradlew :core:test --tests "dev.minemories.core.GlbSceneTest"`.
- `bun format` formats TypeScript/CSS; `bun mod:check` formats Java intentionally.

## Quality Gates (enforced, not optional)

- Viewer Vitest: 100% lines/branches/functions/statements on `src/lib/**/*.ts` (`apps/web/vitest.config.ts`). New browser-independent logic needs tests; UI behavior changes need interaction coverage.
- Core JaCoCo (runs on `check`): 90% line, 60% branch. Fix coverage with tests, not threshold edits.
- SpotBugs `ignoreFailures = false`: fix findings locally with a justifying comment; never add broad suppressions.
- `mod/minemories/core` compiles with `-Werror -Xlint:all`; the NeoForge adapter keeps upstream 1.21.1 deprecations visible (`-Xlint:all` only). Do not silence javac output or swap NeoForge APIs without in-game validation.
- Biome: 2-space, single quotes, semicolons, 100-col, `noExplicitAny: error`, organize-imports on. CSS parser has `tailwindDirectives` on for Tailwind v4 (`@theme` in `apps/web/src/theme.css`).

## API / Dev Environment Gotchas

- API listens on `API_PORT` (default `3001`), CORS-locked to `WEB_ORIGIN` (`http://localhost:5173`). Auth via Better Auth, SQLite under `apps/api/data/` (gitignored).
- Storage defaults to local Garage via the S3-compatible `minio` SDK (`docker compose up -d`). For development without Docker, `STORAGE_DRIVER=filesystem` and `LOCAL_OBJECTS_PATH=./data/objects`. Existing MinIO volume data is not migrated automatically.
- Upload limits are load-bearing: 100 MiB max (`MAX_MEMORY_BYTES`), content-type `model/gltf-binary` or `application/octet-stream`, owner-scoped download, `Cache-Control: private, no-store`.

## GLB + Mod Contract

- Export is a self-contained `.glb`: embedded textures, alpha/emissive, `KHR_lights_punctual` when available. `mod/minemories/core` must drop quads with non-finite positions/UVs and invalid light positions (regression: `GlbSceneTest`); never emit NaN/Infinity.
- Any GLB/texture/selection/render change needs: unit test + visual validation in Blender or Minecraft + doc update. Tests alone are insufficient (`docs/development-workflow.md`).
- Mod writes `~/export/capture.glb` locally by default. Upload is opt-in: viewer issues a 6-digit code (5-min expiry, single use), `/minemories pair <code>` exchanges it for a device token in `config/minemories.properties` (legacy `memorypoc.properties` is read when needed), `/minemories upload` sends the file. Commands: `/minemories select first|second|status|clear`, `/minemories export [<radius 2-48>]`.
- Treat world saves, zips, and GLBs as untrusted input (zip bombs, path traversal, PII in signs/books). Keep galleries private-by-default; never add telemetry or default uploads.

## Loader Claims

- Only `Minecraft 1.21.1 + NeoForge 21.1.248` (CurseForge profile `mc breval`) is tested. Fabric/Quilt/Forge are planned (`docs/loader-support.md`). Never describe a loader as supported until it builds and has been exercised in game with standard blocks, alpha/tinted textures, and modded content.

## PRs

Per `.github/pull_request_template.md`: report `bun check`; add `bun build` when build/assets/cross-module integration change; add in-game test when mod behavior or GLB format changes. Conventional prefixes. Never commit `.env`, API data, saves, exports, runs, builds or ad-hoc lockfile churn.

## Interesting context 
if needed, you can find more context in diferent files : 
- README.md for an overview of the project (the summery)
- BESOIN.md for the initial need and idea that started this project (the vision)
- TOOLS.md for the tools and paths you can use to build this project, local to this computer (in git ignore)
- TASKS.md for the current tasks todo (delete the line when the task is done, add one it todo later/out of scope)
- LESSONS.md is a local to this developper usages, you have to to write a memory of each lesson you learn about the personality of the dev, how to work with him, what he want from you, how he approch code (in gitignore)

