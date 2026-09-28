# Minemories

Monorepo for capturing Minecraft worlds as shareable 3D memories. The repository is being organized around independent applications that share formats and product direction.

## Repository map

```text
apps/
  viewer-web/        Browser-based GLB viewer (Three.js + Vite)
mod/
  src/               Minecraft client mod (NeoForge adapter)
  core/              Loader-independent scene and GLB writer
docs/                Product, architecture, and POC notes
```

Gradle is managed from the repository root. The web app is a Bun workspace.

## Development

Requirements: JDK 21, Bun 1.4.2, Node.js 22.12 or newer (used by Vitest).

```sh
# Install the pinned web dependencies once
bun install --frozen-lockfile

# Full quality gates and production build
bun run build

# Run all checks without producing release artifacts
bun run check

# Autoformat the web code / Java code
bun run format
./gradlew spotlessApply

# Run the browser viewer
bun run dev:viewer

# Build a single side
bun run build:viewer
bun run build:mod
```

The viewer accepts a `.glb` file by choosing or dropping it onto the page. It runs locally in the browser; no upload service is involved. Its Minecraft-inspired skybox includes a controllable day/night cycle, a moving sun, moon phases, drifting block clouds, and changing scene lighting.

## Quality gates

- **Web:** Biome formats/lints TypeScript, JavaScript, CSS and config files; TypeScript runs in strict mode; Vitest tests run on every `check` and `build`.
- **Java:** Spotless enforces Google Java Format; SpotBugs fails on reported findings; Java compiles with all lint warnings enabled; `mod/core` runs JUnit 6 and emits JaCoCo coverage reports.
- **CI:** GitHub Actions runs the same monorepo build on pull requests and pushes to `main`.
- **Dependency repeatability:** Bun is pinned in `.bun-version`; commit `bun.lock` and use frozen installs.

See [the development workflow](docs/development-workflow.md) for coverage thresholds and change rules.

## POC status

The Minecraft POC targets Minecraft 1.21.1 / NeoForge 21.1.248. It exports a selected region as a textured binary glTF to `~/export/capture.glb`. See [the POC recap](docs/poc-status.md) for verified behavior, known gaps, and the last reported GLB validity issue.

Other loaders and future apps are planned, not yet supported. See [loader support](docs/loader-support.md) and [architecture](docs/architecture.md).
