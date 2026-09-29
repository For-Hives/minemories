refere to BESOIN.md

(need to create the readme)

# Repository instructions

## Monorepo layout

- Keep Minecraft mod code and loader-specific builds under `minemories/`.
- Put independently runnable applications under `apps/<app-name>/`.
- Put product and cross-application technical documentation under `docs/`.
- Keep root configuration limited to workspace orchestration and repository-wide tooling.
- The loader-independent Minecraft capture/GLB code belongs in `minemories/core/`.

## Engineering constraints

- The current mod is a client-side POC for Minecraft 1.21.1 / NeoForge 21.1.248. Do not describe planned loader targets as supported until they have been built and exercised in game.
- Keep world export local by default. Network/server features require an explicit product decision; the user has authorized the API and the opt-in pairing/upload flow described in `docs/architecture.md`.
- Treat world data and uploaded GLB files as user data. Do not introduce telemetry or uploads by default.
- Preserve the `.glb` output contract and document intentional format changes.
- Do not commit generated builds, game saves, exports, dependency caches, or secrets.
- Add frontend dependencies with Bun from the repository root and commit the resulting `bun.lock`; CI installs only with `--frozen-lockfile`.
- Keep Biome and TypeScript checks clean. Add Vitest coverage for new browser-independent logic and meaningful interaction checks when UI behavior is introduced.
- Keep Java on the configured JDK 21 toolchain. Format with Spotless, address SpotBugs findings instead of suppressing them broadly, and add JUnit tests for loader-independent core behavior.
- Quality commands are gates: `bun run check`, `bun run build`, and `./gradlew spotlessApply` when intentionally reformatting Java.
- Prefer small, independently buildable modules and document cross-app contracts before sharing implementation.

## Working in the repository

- Use the Gradle wrapper in `minemories/` for Minecraft builds (`./gradlew build`).
- Run `bun run dev:mod` from the repository root to start the isolated NeoForge development client without building a distributable JAR; see `docs/development-workflow.md`.
- Loader support and the proposed Architectury migration are tracked in `docs/loader-support.md`.
- The web viewer is a Bun workspace under `apps/web`.
- Use `bun run build` for the full monorepo build; `bun run build:web` and `bun run build:mod` build one side.
- Update `README.md` and relevant docs when repository structure, supported versions, or user workflows change.
- Keep claims in docs tied to actual implementation or label them as planned/untested.
