# Repository Guidelines

## Project Structure & Module Organization

This is a Bun and Gradle monorepo. Apps live in `apps/` (`viewer-web` and `api`); shared contracts are in `packages/api-contract/`. Minecraft code is under `mod/`: loader-specific integration is in `mod/src/`, and loader-independent capture and GLB logic is in `mod/core/`. Put repository-wide configuration at the root and design documents in `docs/`. Frontend tests sit beside source files (for example, `apps/viewer-web/src/lib/glb.test.ts`); Java core tests are in `mod/core/src/test/`.

## Build, Test, and Development Commands

Run commands from the repository root:

- `bun install` installs workspace dependencies; preserve `bun.lock` when changing dependencies.
- `bun run dev:viewer` and `bun run dev:api` start the web viewer and API.
- `bun run check` runs repository checks; `bun run check:front` runs Biome, TypeScript checks, and frontend tests with coverage.
- `bun run build` builds the monorepo; use `bun run build:viewer` or `bun run build:mod` for one component.
- `./gradlew :mod:build` builds the Minecraft mod. Run `./gradlew :mod:core:test` for core unit tests; use `./gradlew spotlessApply` only when intentionally formatting Java.

## Coding Style & Naming Conventions

Biome is the source of truth for JS/TS formatting: two spaces, single quotes, semicolons, and a 100-character line width. Run `bun run lint` before submitting. Keep TypeScript strict and avoid `any`. Follow existing Java formatting and JDK 21 toolchain settings; use descriptive Java type names and lower camel case for members. Name tests after the behavior or module under test, using `.test.ts` for Vitest.

## Testing Guidelines

Add Vitest tests for browser-independent TypeScript logic and interaction tests when UI behavior changes. Add JUnit tests for loader-independent code in `mod/core`. Run the relevant test suite and build for each changed app; do not claim a loader is supported until it builds and has been exercised in game. There is no repository-wide coverage threshold currently configured.

## Commits and Pull Requests

Recent history uses Conventional Commit-style prefixes, such as `feat(viewer): ...` and `fix(api): ...`. Keep commits focused. Pull requests should explain user-visible changes, list validation commands and results, link related issues when available, and include screenshots or a short recording for viewer changes.

## Security and User Data

Keep `.env`, credentials, world saves, generated exports, and build outputs out of commits. World data and GLB files are user data: uploads must remain opt-in, and changes to export formats or data handling should be documented. Treat uploaded archives as untrusted input and follow existing validation and quota boundaries.
