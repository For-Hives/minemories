# Repository Guidelines

## Monorepo Map

- `apps/web/` — React + Three.js SPA (Bun workspace `@minemories/web`).
- `apps/api/` — Bun/Hono + Better Auth + oRPC + SQLite + S3-compatible storage (`@minemories/api`).
- `packages/api-contract/` — oRPC + zod contract shared by API and web. Edit here first when changing RPC shapes.
- `mod/1.21.1/` — Gradle root. `:core` in `mod/shared/core/` is loader-independent GLB code; `:common` contains the shared Minecraft client; `:neoforge`, `:fabric`, and `:forge` are the loader adapters.
- `mod/<minecraft version>/` — one Gradle root per Minecraft version (`1.21.11`, `1.20.1`, `1.19.2`, `1.18.2`, ...): loader adapters, `adapt.gradle`, `overlay/` only. `mod/shared/` holds what is not a Minecraft version (`core`, `common`, `compat-legacy`, `compat-pre-1.19`, `gametest-common` for the Minecraft-free `GlbReport`). `mod/targets.json` is the single source of the build matrix and the published targets.
- `docs/` (French), `docker-compose.yml`, `scripts/` (`gradle.mjs`, `mod/` = the `bun mod` tool).

## Commands (run from repo root)

- Install: `bun install` locally; CI uses `bun install --frozen-lockfile`. Bun 1.4.3, Node 24.15+ recommended (or 22.22.2+), JDK 21.
- `docker compose up -d` starts local Garage (S3 endpoint `127.0.0.1:3900`). Root `.env` needs two distinct 32+ character auth secrets.
- `bun mod:dev` starts Gradle `:neoforge:runClient` in `mod/1.21.1/`; `bun mod:build` builds the three loader JARs.
- `bun mod:check` runs `spotlessApply check` and modifies Java files; `bun mod:check:ci` runs `check` without edits.
- `bun mod` is the local mod tool (`scripts/mod/`): `build`, `test` (headless in-game), `status` (Minecraft x loader grid), `version`, `release`, `storage`, `publish`, `notify`, `jdk`, `ci`; `bun mod <command> --help`. Tests: `node --test scripts/mod/*.test.mjs scripts/mod/*/*.test.mjs`.
- `bun web:dev` / `bun web:check` / `bun web:build`; `bun api:dev` / `bun api:check` (Biome, typecheck, Bun tests).
- `bun check` is the no-fix aggregate quality gate. `bun run build` checks everything, then builds web and mod.
- Single TS test: `bun run --filter @minemories/web test -- src/lib/glb.test.ts`.
- Java (from `mod/1.21.1/`): `./gradlew :core:test --tests "dev.minemories.core.GlbSceneTest"`.
- `bun format` formats TypeScript/CSS; `bun mod:check` formats Java intentionally.

## Quality Gates (enforced, not optional)

- Viewer Vitest: 100% lines/branches/functions/statements on `src/lib/**/*.ts` (`apps/web/vitest.config.ts`). New browser-independent logic needs tests; UI behavior changes need interaction coverage.
- Core JaCoCo (runs on `check`): 90% line, 60% branch. Fix coverage with tests, not threshold edits.
- SpotBugs `ignoreFailures = false`: fix findings locally with a justifying comment; never add broad suppressions.
- `mod/shared/core` compiles with `-Werror -Xlint:all`; the NeoForge adapter keeps upstream 1.21.1 deprecations visible (`-Xlint:all` only). Do not silence javac output or swap NeoForge APIs without in-game validation.
- Biome 2.5.15: tabs, single quotes, optional semicolons, 120 columns, recommended rules plus the explicit rules in `biome.json` (complexity <= 15, `noForEach`, no nested ternaries). Run `bun format` after changing TypeScript/CSS/JSON; new suppressions need a local reason. CSS parser supports Tailwind v4 `@theme`.
- API coverage requires 90% lines and 80% functions per reported file (`apps/api/bunfig.toml`); an LCOV inventory gate rejects missing production sources. Keep text + LCOV reporters enabled.
- API Bun tests run in separate processes (`--parallel`) so temporary SQLite paths and environment variables cannot leak between suites. Keep HTTP route tests and real oRPC contract tests when upgrading Hono, Better Auth, Bun or oRPC.

## API / Dev Environment Gotchas

- API listens on `API_PORT` (default `3001`), CORS-locked to `WEB_ORIGIN` (`http://localhost:5173`). Auth via Better Auth, SQLite under `apps/api/data/` (gitignored).
- Storage defaults to local Garage via AWS SDK v3 with the configured S3 endpoint (`docker compose up -d`). Multipart uses 8 MiB parts and one worker; durable cleanup aborts unfinished uploads. For development without Docker, `STORAGE_DRIVER=filesystem` and `LOCAL_OBJECTS_PATH=./data/objects`. Existing MinIO volume data is not migrated automatically.
- Upload limits are load-bearing: legacy endpoint 100 MiB max (`MAX_MEMORY_BYTES`); resumable mod uploads 450 MiB max in 4 MiB chunks (`upload-files.ts`). Do not buffer whole resumable files. Content-type `model/gltf-binary` or `application/octet-stream`, owner-scoped download, `Cache-Control: private, no-store`.

## GLB + Mod Contract

- Export is a self-contained `.glb`: embedded textures, alpha/emissive, `KHR_lights_punctual` when available. `mod/shared/core` must drop quads with non-finite positions/UVs and invalid light positions (regression: `GlbSceneTest`); never emit NaN/Infinity.
- Any GLB/texture/selection/render change needs: unit test + visual validation in Blender or Minecraft + doc update. Tests alone are insufficient (`docs/concepts/development-workflow.md`).
- Mod writes `~/export/capture.glb` locally by default; the folder is configurable. AFK captures are enabled by default (5 minutes idle, at most every 4 hours, radius 32), including while paused or unfocused; preserve an explicit stored disable preference. M opens a simple interface with pairing, manual capture/upload and AFK toggle; timing/radius, local folder and custom API are advanced settings. The official API defaults to `https://api.minemories.net`. Upload requires pairing: the viewer issues a 6-digit code (5-min expiry, single use), `/minemories pair <code>` exchanges it for a device token in `config/minemories.properties`; paired AFK captures upload automatically, unpaired captures stay local, and `/minemories upload` sends a file manually. Commands: `/minemories select first|second|status|clear`, `/minemories export [<radius 2-128>|selection]`.
- Around-player captures default to the lowest locally visited depth in intersecting chunks plus five foundation blocks, scoped per world/dimension/player; explicit selections keep their corners. `captureFullHeight=true` is an advanced override. Exploration history is local and bounded.
- Treat world saves, zips, and GLBs as untrusted input (zip bombs, path traversal, PII in signs/books). Keep galleries private-by-default; never add telemetry or upload before pairing.
- Mod diagnostics are on by default (owner decision of 27 October 2026, opt-out; legal risk for minors tracked in #156/#89) but nothing is ever sent before pairing. An absent `diagnosticsConsent` key means on; an explicit `false` must stay refused across pairing, unlinking and API changes. The sanitized outbox is limited to eight reports/seven days; withdrawal and identity changes must purge it. Never send raw messages, crash logs, paths or credentials. Crash handling must preserve Minecraft's original exit behavior. Private diagnostic reads/triage and public-gallery moderation require the Better Auth admin role (`user_roles`); the `PUBLIC_MODERATOR_IDS` / `DIAGNOSTICS_OPERATOR_IDS` env lists no longer exist; retain private/no-store and noindex routing. See `docs/features/consented-diagnostics.md` and `docs/features/remote-observability-operations.md`.

## Loader Claims

- Validated Minecraft 1.21.1 targets are NeoForge 21.1.248, Fabric Loader 0.19.5 + Fabric API 0.116.17+1.21.1, and Forge 52.1.19. The Fabric JAR is also tested under Quilt 0.30.1. Exact scenarios and limits are in `docs/features/loader-support.md`; this does not imply compatibility with every mod. Never describe a loader as supported until it builds and has been exercised in game with standard blocks, alpha/tinted textures, and modded content.

## PRs

CI (`.github/workflows/quality.yml`) only runs the gates a change concerns (`scripts/ci-scope.mjs`, tested): a front PR never starts the mod or the API; pushes to `main` run everything. The single check to read is `quality`.

Per `.github/pull_request_template.md`: report `bun check`; add `bun run build` when build/assets/cross-module integration change; add in-game test when mod behavior or GLB format changes. Conventional prefixes. Never commit `.env`, API data, saves, exports, runs, builds or ad-hoc lockfile churn.

## Interesting context 
if needed, you can find more context in diferent files (look inside ./docs/AI ): 
- README.md for an overview of the project (the summery)
- BESOIN.md for the initial need and idea that started this project (the vision)
- TOOLS.md for the tools and paths you can use to build this project, local to this computer (in git ignore)
- GitHub Issues are the source of truth for tasks: https://github.com/For-Hives/minemories/issues. Check existing issues before creating a separate issue for each new task; record what is implemented, remaining acceptance criteria and validation evidence. Use the existing labels (`mod`, `api`, `front`, `autonomous`, `needs-human`, etc.). Close an issue only when its full scope and required validations are complete. `docs/AI/TASKS.md` is intentionally empty after migration; do not repopulate it.
- LESSONS.md is a local to this developper usages, you have to to write a memory of each lesson you learn about the personality of the dev, how to work with him, what he want from you, how he approch code (in gitignore)

- Release automation: no GitHub workflow builds, tags or publishes the mod. `bun mod release` runs on the VPS (`ops/mod-builder/`, nightly timer): production build of every enabled target of `mod/targets.json`, headless in-game tests, S3 storage (3 versions per target, `scripts/mod/storage/`), then optional Modrinth/CurseForge publication (`mod/catalogs.json`, off until configured) and Discord notification; the API serves the JARs (`/downloads/...`) and the site reads its index. `mod/1.21.1/gradle.properties` owns `mod_version`, bumped by `bun mod version bump`. CI (`quality.yml`) only checks: Gradle on `mod/1.21.1`, the `scripts/mod` tests and a compile matrix (`node scripts/mod/cli.mjs ci`). Releases are betas, not assertions of exact-JAR in-game validation. See `docs/features/automatic-releases.md`.
