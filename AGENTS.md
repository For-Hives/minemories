# Repository Guidelines

## Monorepo Map

- `apps/viewer-web/` — React + Three.js SPA (Bun workspace `@minemories/viewer-web`).
- `apps/api/` — Bun/Hono + Better Auth + oRPC + SQLite + S3-compatible storage (`@minemories/api`).
- `packages/api-contract/` — oRPC + zod contract shared by API and viewer. Edit here first when changing RPC shapes.
- `mod/` — NeoForge client mod (Gradle). `mod/core/` is loader-independent capture/GLB code (`:mod:core`); `mod/src/` is loader-specific integration.
- `docs/` (French), `infra/dev/docker-compose.yml`, `scripts/` (`check.mjs`, `build.mjs`).

## Commands (run from repo root)

- Install: `bun install` locally; CI uses `bun install --frozen-lockfile`. Bun `1.4.2` (`.bun-version`), Node `>=22.12`.
- `bun run dev:viewer` / `bun run dev:api` — API needs root `.env` (`cp .env.example .env`, two distinct 32+ char secrets).
- `bun run check` = `check:front` (Biome + both typechecks + Vitest coverage) then `:mod:check`. Gate for PRs.
- `bun run build` = `check:front` + viewer bundle + `:mod:build`. Slow; for iteration use `bun run build:viewer` or `bun run build:mod` (mod only, skips front checks).
- Focused checks: `bun run lint`, `bun run typecheck`, `bun run typecheck:api`, `bun run test:front`.
- Single TS test: `bun run --filter @minemories/viewer-web test -- src/lib/glb.test.ts`.
- Java: `./gradlew :mod:core:test --tests "dev.minemories.core.GlbSceneTest"`; full `./gradlew :mod:build`. Gradle uses `daemon=false`, 3G heap — avoid repeated full builds.
- `bun run format` (Biome) and `./gradlew spotlessApply` (Google Java Format `1.36.0`) only when intentionally reformatting.

## Quality Gates (enforced, not optional)

- Viewer Vitest: 100% lines/branches/functions/statements on `src/lib/**/*.ts` (`apps/viewer-web/vitest.config.ts`). New browser-independent logic needs tests; UI behavior changes need interaction coverage.
- Core JaCoCo (runs on `check`): 90% line, 60% branch. Fix coverage with tests, not threshold edits.
- SpotBugs `ignoreFailures = false`: fix findings locally with a justifying comment; never add broad suppressions.
- `mod/core` compiles with `-Werror -Xlint:all`; `mod` (NeoForge adapter) keeps upstream 1.21.1 deprecations visible (`-Xlint:all` only). Do not silence javac output or swap NeoForge APIs without in-game validation.
- Biome: 2-space, single quotes, semicolons, 100-col, `noExplicitAny: error`, organize-imports on.

## API / Dev Environment Gotchas

- API listens on `API_PORT` (default `3001`), CORS-locked to `WEB_ORIGIN` (`http://localhost:5173`). Auth via Better Auth, SQLite under `apps/api/data/` (gitignored).
- Storage defaults to MinIO (`docker compose -f infra/dev/docker-compose.yml up -d`; console `:9001`). Without Docker, use `STORAGE_DRIVER=filesystem` + `LOCAL_OBJECTS_PATH=./data/objects` for dev only — never as deploy substitute.
- Upload limits are load-bearing: 100 MiB max (`MAX_MEMORY_BYTES`), content-type `model/gltf-binary` or `application/octet-stream`, owner-scoped download, `Cache-Control: private, no-store`.

## GLB + Mod Contract

- Export is a self-contained `.glb`: embedded textures, alpha/emissive, `KHR_lights_punctual` when available. `mod/core` must drop quads with non-finite positions/UVs and invalid light positions (regression: `GlbSceneTest`); never emit NaN/Infinity.
- Any GLB/texture/selection/render change needs: unit test + visual validation in Blender or Minecraft + doc update. Tests alone are insufficient (`docs/development-workflow.md`).
- Mod writes `~/export/capture.glb` locally by default. Upload is opt-in: viewer issues a 6-digit code (5-min expiry, single use), `/memorypoc pair <code>` exchanges it for a device token in the MC `config` dir, `/memorypoc upload` sends the file. Commands: `/memorypoc select first|second|status|clear`, `/memorypoc export [<radius 2-48>]`.
- Treat world saves, zips, and GLBs as untrusted input (zip bombs, path traversal, PII in signs/books). Keep galleries private-by-default; never add telemetry or default uploads.

## Loader Claims

- Only `Minecraft 1.21.1 + NeoForge 21.1.248` (CurseForge profile `mc breval`) is tested. Fabric/Quilt/Forge are planned (`docs/loader-support.md`). Never describe a loader as supported until it builds and has been exercised in game with standard blocks, alpha/tinted textures, and modded content.

## PRs

Per `.github/pull_request_template.md`: report `bun run check`; add `bun run build` when build/assets/cross-module integration change; add in-game test when mod behavior or GLB format changes. Conventional prefixes (`feat(viewer): …`, `fix(api): …`). Never commit `.env`, `apps/api/data/`, saves, exports, `run/`, `build/`, or `bun.lock` churn from ad-hoc installs.
