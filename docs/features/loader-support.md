# Minecraft loader support

A launcher starts a profile; the loader provides the APIs the mod uses. Switching launchers does not require another JAR as long as Minecraft and the loader stay the same. Switching loaders means picking the right artifact.

## Validated matrix

Every target below uses **Minecraft 1.21.1 and Java 21**.

| Loader | Version exercised | Artifact | In-game validation |
| --- | --- | --- | --- |
| NeoForge | 21.1.248 | `minemories-neoforge-mc1.21.1.jar` | Standard blocks, alpha/tints, water, chest, entities; a model using `ModelData`, Create 6.0.10 and Flywheel 1.0.6. The user profile `mc breval` remains the historical reference. |
| Fabric | Loader 0.19.5 + Fabric API 0.116.17+1.21.1 | `minemories-fabric-mc1.21.1.jar` | Same standard scene, plus a custom Renderer API model with transforms, tint, alpha, emission and an extra mesh. Fabric API must be installed separately. |
| Quilt | Loader 0.30.1 + the same Fabric API | **The Fabric JAR** | Quilt client launched separately with the same custom model, menus and AFK capture. No separate Quilt archive or adapter. |
| Forge | 52.1.19 | `minemories-forge-mc1.21.1.jar` | Same standard scene and a custom block whose model requires `ModelData` propagation, with tint and half-height geometry. |

Validation covers these combinations and scenarios. It does not guarantee every mod, renderer or shader in a modpack. A new target may only be announced after it builds, passes tests and has been validated in game with standard blocks, transparent/tinted textures, fluids, block entities and modded content.

## Architecture

- `:core` serializes the GLB without any Minecraft dependency and keeps its JUnit, JaCoCo and SpotBugs tests.
- `:common` contains the Minecraft capture, screens, transfers, consented diagnostics and their tests. `ClientPlatform` isolates models/model data, fluids, sprites and versions. This module is not an installable mod.
- `:neoforge` keeps ModDevGradle and its NeoForge events/APIs.
- `:fabric` uses Architectury Loom 1.17.487, Fabric API and targeted mixins for frames while paused, input, texture data and the vanilla crash point.
- `:forge` uses Loom separately, with Forge events, its model data and its fluid hooks. Access to rendering classes is converted into access transformers during remapping.

All three adapters bundle `:core` and the common client. Crash hooks keep vanilla behavior; storing/sending diagnostics remains subject to the existing pairing and consent. Capture adds no upload without pairing.

## Evidence from the 15 October 2026 port

The test clients load the shipped JARs, with isolated saves and configurations. Fabric and Quilt use the production bootstrap, without the mod's development classes on the classpath. Forge uses its own separate client install. NeoForge also checks the path of the JAR actually loaded. Test clients run without sound.

The standard scene contains a chest, leaves, red glass, water, a tinted sheep and an Enderman. Its initial export contains 1,008 triangles, 9 images and the emissive eye material. The capture preserves the eleven controlled OpenGL states, notably a 16-byte pixel pack buffer and non-standard packing parameters. The GLBs pass the API's production validators; the renders were inspected in Blender.

The Fabric companion mod registers a block whose Renderer API model is not a vanilla adapter: transformed cube fallback, custom tint, alpha and emission, then an extra cyan mesh. The export contains 1,018 triangles. The test caught Indigo's internal cast in `Mesh.outputTo`; the collector now uses the public quad enumeration ahead of its bounded emitter. It caps quads and transforms per model and rejects non-finite primitives.

The Forge and NeoForge companions require a `ModelData` marker before returning their quads. The expected half height and cyan color can be checked in the GLB. The resource pack declares its `pack.mcmeta`; the white texture is actually loaded, with no fallback texture. Under NeoForge, the Create engine drives a shaft and a cogwheel, and Flywheel recovers its state between capture callbacks.

The interactive scenarios check M, the Minemories button in the pause menu, that `afkSnapshots=false` is respected, then a full progressive capture while paused after explicit activation. The capture scope is inactive between frames. The new crash hooks and the diagnostics recovery from `main` are included in the latest JARs; the crash signal without consent is not recorded in the NeoForge scenario.

Fingerprints of the local `0.3.1-beta.1` JARs rebuilt and exercised after merging the changes from `main`. They do not replace the existing GitHub release under that number; the next release will have its own number and checksums:

| Artifact | SHA-256 |
| --- | --- |
| NeoForge | `13a05b64cf1c8ff7b9055b1b68d099739f2fc89d932a83a6c88a54073ac3a021` |
| Fabric, also used under Quilt | `f0b9c970c8b1ba2c29d697019f23ab0dd58df035336b9d5a3304a9ade748aa5f` |
| Forge | `f31d197923fc1049378e55f00820e0b56be6c1d0ab5461b2142b64dbb43b2270` |

An additional regression run loaded the full ATMons modpack under NeoForge 21.1.249 with the intermediate JAR `77afb1bb9f3ee62f2df2650db7fe08e3631aa0a45a42de3b06b6e0cdda0a6fc6`, before the new diagnostics were merged: manual export of 20,716 triangles/42 images, AFK of 77,582 triangles/93 images and 5,698,460 bytes. Flywheel stays active between frames; cancellation keeps the last complete GLB and cleans up the spool. The longest step reached 56.29 ms with 83 soft overruns: the frame budget is not a latency guarantee for every third-party renderer. The limits of custom renders, notably the emission of some Pokémon, are described in [captured models](frozen-entities.md).

The local evidence lives under `loader-adapters-20261015/`: profiles `neoforge-create-final`, `fabric-rebased-final`, `quilt-rebased-final`, `forge-rebased-final` and `neoforge-full-final`. Corrected harness attempts are kept separate from the successful results.

## Building and distribution

`bun mod:check:ci` and `bun mod:build` cover every Java module of the 1.21.1 root. The remapped JARs are in the `build/libs/` directories of the three adapters. Production JARs, with a `.sha256` fingerprint and a manifest (mod version, Minecraft, loader, loader version, size, fingerprint, commit), are built by `bun mod build` into `build/mod-dist/<version>/<id>/`.

CI produces no distributed JAR: it builds and checks every cell of the matrix (`node scripts/mod/cli.mjs ci`), including the common client tests, so that a port never stops compiling. Published JARs are built on the VPS (`bun mod release`).

`mod/targets.json` is the source of the release matrix. NeoForge, Fabric and Forge are enabled after these validations; the Quilt placeholder stays disabled since it reuses the Fabric JAR. `bun mod release` builds every enabled target with its own name, manifest, checksum and provenance. `validatedInGame` describes the supported combination: it does not claim that each new automatic archive has been played. See [the release pipeline](automatic-releases.md).

Targets for other Minecraft versions (1.21.11, 1.19.2, 1.18.2, then 1.20.1 once tested) carry `dir` (Gradle root `mod/1.21.1-<version>`) and `jarPrefix` (prefix of the built JAR); Java 17 is accepted for versions before 1.21. They have no `:core`/`:common` of their own: only the adapter is checked. A target is only enabled once its automated in-game test has passed; Forge 1.21.11 and 1.20.1 stay disabled. The installation page offers a Minecraft version, then a loader among the enabled targets, with NeoForge 1.21.1 as the default.

The default public download remains NeoForge 1.21.1; pick the archive matching the loader and install Fabric API for Fabric/Quilt. A CI build never replaces graphical testing of a new target or a rendering change.

## The `bun mod` tool

`bun mod` (`scripts/mod/cli.mjs`): a single tool to build, track status, version and orchestrate the mod release. `bun mod` with no argument lists the commands; `bun mod <command> --help` prints usage. Commands are the files in `scripts/mod/commands/` (contract: `{ name, summary, usage, run(args, { config, env, log, root }) }`, documented at the top of `cli.mjs`), so storage, tests, publishing and notifications plug in without touching the core.

**Single configuration: `mod/targets.json`.** `minecraft` (displayed versions, in order), `targets[]` (built targets) and `planned` (planned targets, not built: 1.16.5 and 1.12.2). Each target carries its identity (`id` = `<loader>-mc<minecraft>`, `loader`, `name`, `minecraft`, `loaderVersion`, `fabricApi`), its state (`enabled`, `validatedInGame`) and its build fields: `java` (build JDK, 17 before 1.21, 21 since), `project` (Gradle subproject), `dir` (Gradle root, `mod/<minecraft>` by default), `jar` (template of the produced JAR, with `{version}`) and `loaderProperty` (Gradle property to build against another loader version). Minecraft versions follow `\d+(\.\d+)*` (so `26.3` works) and validation is strict (unique ids, consistent folder). The web app always reads `targets[]`.

**Commands.**
- `bun mod status`: Minecraft (rows) x loader (columns) grid. ✓ up to date, ⚠ only old versions, ✗ needs building, ○ planned, `·` nothing, `*` disabled target. If the storage module responds, each cell adds `↑<latest published version>` and the space used, and the last line gives the total; without storage, the grid stays local. Colors are off outside a terminal or with `NO_COLOR`.
- `bun mod build [<loader> <minecraft> | <id>…] [--all] [--missing] [--dev] [--verbose]`: runs Gradle in `mod/<minecraft>` (`:<project>:clean`, `:<project>:build`, `-PmodVersion`, `-Pminemories.prod=true`) and drops into `build/mod-dist/<version>/<id>/` the JAR renamed `minemories-<loader>-mc<minecraft>-<version>.jar`, its `.sha256` and `manifest.json` (version, Minecraft, loader, loader and Fabric API versions, size, SHA-256, commit, JDK, `prod`). `--dev` passes `-Pminemories.prod=false`; `--missing` only builds enabled targets without an up-to-date build. A failing target does not stop the others: the summary gives each one's duration and size, and the exit code is non-zero if anything failed. Only one build at a time per machine (lock `build/mod-build.lock`, ignored if its owner no longer exists). The Gradle cache is `~/.gradle`, shared across targets.
- `bun mod jdk [list|install <8|17|21|25>]`: Gradle runs on JDK 21 and each target compiles with its own. JDKs are looked up in `JAVA_HOME`, `~/.local/tools`, `~/.gradle/jdks` and the `PATH`, then downloaded if needed from the Adoptium API (SHA-256 checksum mandatory, refused otherwise) into `~/.local/tools`, and passed to Gradle (`JAVA_HOME`, `-Dorg.gradle.java.installations.paths`). `--no-jdk-download` on `build` forbids downloading.
- `bun mod version [show|bump patch|minor|beta] [--commit]`: `mod_version` stays in `mod/1.21.1/gradle.properties`. `bump` rewrites it in the `X.Y.Z-beta.N` format; with `--commit` it creates the commit `chore(release): X.Y.Z-beta.N` and the tag `mod-vX.Y.Z-beta.N`.
- `bun mod release [--skip-tests] [--no-publish] [--dry-run]`: lock, version, production build of every enabled target, headless tests, storage, Modrinth/CurseForge publishing (only if a token is present), notification. Each optional step is loaded on demand: a missing module is reported then skipped. A failing target does not prevent storing the others but fails the release (exit code 1) and triggers a failure notification; any exception is caught and notified. `--dry-run` only prints the plan and which modules are present.
- `bun mod open` opens `build/mod-dist/`; `bun mod ci` prints the cells outside the 1.21.1 root that the quality workflow builds.

Variables (tokens, Discord webhook, S3 storage) come from the environment, completed by the root `.env` without overriding it. Building a combination does not make it "supported": see the rules above. For a new combination, add the entry to `mod/targets.json` (disabled), then document the in-game tests here.

### Quilt 1.21.11: the Fabric JAR loads as is (5 November 2026)

No Quilt project is created: the `minemories-fabric-mc1.21.11-*.jar` JAR is launched under Quilt Loader 0.30.2 (`meta.quiltmc.org` profile for 1.21.11, Mojang libraries, Fabric API 0.141.6+1.21.11 as a mod). Fabric's automated capture test passes there with the same numbers: 2507 blocks, 3 entities, 16 materials, a 189,628-byte GLB (5 meshes, 15 images). The test mod is remapped by the `:fabric:remapGametestJar` task, with the `fabric-client-gametest-api-v1` 4.3.5 module.

What the run revealed:
- Quilt 0.30.2 provides Fabric Loader 0.19.5. `fabric.mod.json` required ≥ 0.20.1, which refused to load; the bound is now ≥ 0.17.3, Fabric API's minimum. Older Fabric loaders between 0.17.3 and 0.20.0 have not been tried.
- Fabric API 6.0.11's client test module (Java 25) does not run under Quilt and JDK 21; 4.3.5 does.

Limits: no GLB was opened in the viewer (no WebGL in the built-in browser), and only this capture scenario was played (menus, AFK and manual selection not tried under Quilt). Quilt 1.21.11 is therefore not declared supported.

### Forge 1.19.2: builds, automated in-game test passed, not validated in the viewer (5 November 2026)

Subproject `mod/1.19.2` (Forge 43.5.2, Java 17, Architectury Loom, Mojang mappings), built like `mod/1.20.1`: the shared sources are copied, adapted by `adapt.gradle`, then compiled with the Forge adapter classes.

Gap measured before porting: 123 symbol errors in 15 files, 110 of them in the UI (`GuiGraphics`, `Button.builder`, `Tooltip`, `getX`/`getY`, `renderWidget`). After the compat layer below, 27 errors remained, all mechanical: `sprite.contents()` renamed, `BuiltInRegistries` became `Registry`, `worldGenOptions`, `getIconBytes`, `BlockPos.containing`, `setHint`, an atlas from a version without `getTextureLocations`.

**Compat layer shared by pre-1.20 targets**: `mod/shared/compat-legacy`. It contains `GuiGraphics` (drawing on a `PoseStack`, items via the model-view stack), `Tooltip`/`Tooltips` (tooltips drawn by the screen), `CompatButton` (the 1.19.3+ `Button.builder(...)`), `Clamp`, and `adapt-legacy.gradle`, which rewrites the shared screens (`render` and `renderButton` signatures, widget `x`/`y`). The common code stays the 1.21.1 code; each version only adds its rules in its `adapt.gradle`. A pattern that stops matching fails the build. 1.18.2 can reuse this layer.

In-game test: `./gradlew :forge:runClientGametest` (from `mod/1.19.2`). A Forge test mod (`src/gametest`) calls `TickDrivenCapture` on every client tick: flat world, scene, `/minemories export 12` sent through the chat screen (a client-side command is not recognized by `commandUnsigned`), then GLB verification by `GlbReport` (shared with 1.21.11). Result: 2507 blocks, 3 entities, 17 materials, a 181,556-byte GLB, alpha BLEND and MASK present. The test mutes the sound.

Quirks: grass is called `grass` before 1.20.3 (`-Dminemories.gametest.grass=grass`); there is no input field with a hint (`setHint`), replaced by `EditBox`'s grey suggestion. Limits: GLB not opened in the viewer, menus and manual selection not tried. The target is therefore not declared supported.

### Fabric 1.19.2: builds, automated in-game test passed, not validated in the viewer (5 November 2026)

Same subproject as Forge 1.19.2 (`mod/1.19.2`, `fabric` module), Fabric Loader 0.20.1 and Fabric API 0.77.0+1.19.2. It reuses `mod/shared/compat-legacy` and its adaptation rules; only the Fabric adapter changes, because the rendering API of Fabric API 0.77 is the old multi-sprite one:

- `CaptureQuadEmitter` is rewritten for this API (`spriteColor`, `sprite`, `spriteBake(index, …)`, `fromVanilla(…, isItem)`, `toVanilla(index, …)`), and `FabricModelCapture` reads UVs through `spriteU(i, 0)`.
- The 0.77 API does not expose a material's flags (blend mode, emissivity, color index); `MaterialFlags` asks Indigo's implementation for them via reflection and falls back to the defaults elsewhere. With another renderer (Canvas…), the GLB may therefore lose translucency and emissivity: not tried.
- A sprite's pixels go through a Mixin accessor (`SpriteImageAccess`, field `mainImage`): before 1.19.3 `TextureAtlasSprite` has no `getPixelRGBA` (Forge adds it).
- `copyUv` does not exist in this API.

In-game test: `./gradlew :fabric:runClientGametest` (from `mod/1.19.2`), same scenario as Forge: 2507 blocks, 3 entities, 17 materials, a 182,280-byte GLB. The Fabric test mod joins the development classpath but stays inactive without `-Dminemories.gametest=true`. Limits: GLB not opened in the viewer, Quilt 1.19.2 not tried, menus and manual selection not tried. Target not declared supported.

### Forge 1.18.2: builds, automated in-game test passed, not validated in the viewer (5 November 2026)

Subproject `mod/1.18.2` (Forge 40.3.12, Java 17, Architectury Loom), built like the 1.19.2 one: same adaptation rules from `mod/shared/compat-legacy`, plus `mod/shared/compat-pre-1.19` for what does not exist yet in 1.18 (`Component.literal` and `Component.translatable`, replaced by `Components`; `Screen.rebuildWidgets`, replaced by `clearWidgets(); init();`). First attempt: 97 symbol errors, 74 of them on text components.

What changes in the Forge adapter, written for this version: key mappings registered in `FMLClientSetupEvent` through `ClientRegistry`, screen events `ScreenEvent.InitScreenEvent` and `DrawScreenEvent`, input `InputEvent.KeyInputEvent` and `MouseInputEvent`, selection drawn on `RenderLevelLastEvent` (deprecated; there is no render stage), models with `IModelData`/`EmptyModelData` and `java.util.Random`, fluid tint through `FluidAttributes`. The selection drawing has not been seen on screen.

In-game test: `./gradlew :forge:runClientGametest` (from `mod/1.18.2`), with a `TickDrivenCapture` driver specific to 1.18.2 (flat world created by `Minecraft.createLevel`, command sent through `Screen.sendMessage`). Result: 2507 blocks, 3 entities, 17 materials, a 181,540-byte GLB. Startup takes about two minutes before the test moves on. Limits: GLB not opened in the viewer, menus and manual selection not tried; target not declared supported.

### Screen backgrounds on 1.20.1: bug found and fixed (5 November 2026)

Before 1.20.2, `Screen.render` does not draw the background: each screen calls it itself. The shared screens (written for 1.21.1) rely on `render` to do it, and the adaptation to 1.20.1 did not restore it: the mod screens' panel and background were not drawn. Measured in game (Forge 1.20.1): the pixel read inside the hub panel was the sky (`0xffdfc7b9`), not the panel color (`0xff262925`). `mod/1.20.1/adapt.gradle` now inserts a `renderBackground(graphics)` call at the start of `render`, which also fixes the Fabric 1.20.1 module; the same pixel then reads `0xff262925`.

The check runs with `./gradlew :forge:runClientGametest` from `mod/1.20.1`: flat world, open the hub, read a pixel inside the panel and one just outside it from the framebuffer, which must differ. Since the panel follows the game's own look ([mod-interface-look.md](mod-interface-look.md)) it has no fixed colour any more, so the check no longer compares against `0xff262925`. It checks the background, not the button layout or text. The 1.19.2 and 1.18.2 bridges call `renderBackground` explicitly (`mod/shared/compat-legacy/adapt-legacy.gradle`); they do not have this pixel check. Fabric 1.20.1 has not been rerun in game.

### Measured inventory: Forge 1.16.5 and Forge 1.12.2 (5 November 2026, nothing coded)

**Forge 1.16.5 (36.2.42).** Measurement: a throwaway subproject (deleted) compiles the shared sources already adapted for 1.18.2 against Minecraft 1.16.5 (Architectury Loom, Mojang mappings): 99 symbol errors, a lower bound since javac stops before type checking. They fall into a few mechanical families: `addRenderableWidget` (19 uses, `addButton` before 1.17), `JsonParser.parseString` (8, old Gson), `VertexFormat.Mode` and `RenderedVertexConsumer` (the capture renderer, 380 lines to rewrite for that era's `RenderType`s), `getMinBuildHeight` (height is fixed, 0 to 255), `getYRot`/`getXRot`/`getBlockX` (renamed fields and methods), `CaptureLevelView`, `isHoveredOrFocused`, `GuiGraphics` (the four `RenderSystem` calls in the compat layer). That is on the same order as 1.18.2 (97 errors on the first attempt).

The real question is Java 8. The shared code is Java 17: 58 `record`s, 145 lines using `var` (28 files), 22 lines of arrow `switch`, 14 pattern `instanceof`, 22 `List.of`/`Map.of`/`Set.of` calls, 12 import lines from `java.net.http` (6 files: `PairingClient`, `ChunkedUploader`, `DiagnosticsClient`, `StorageStatusClient`, `UploadPacer`, `ApiResponseBody`), plus `HexFormat`, `Math.clamp`, `getLast`, `Files.readString`. The three options:

1. **Java 17 classes on Minecraft 1.16.5**: the cost comes down to the 99 errors above, i.e. a port the size of 1.18.2. Only works if the player runs Forge 1.16.5 on Java 16 or 17, not on the Java 8 that most modpack launchers use for this version. Not tried: we need to check that Forge 36.2.42 starts on Java 17.
2. **Real Java 8 with a downleveling compiler** (Jabel for `var`, `switch`, `instanceof`): the 58 `record`s still need to be rewritten by hand as classes, and the 6 files using `java.net.http` ported to `HttpURLConnection` (about 1,500 lines affected), then the Java 9 to 17 API calls. Overall, about three times the work of option 1.
3. **Separate Java 8 core**: port `core` (2,751 lines, 15 files, no Minecraft dependency) to Java 8 and leave the client on Java 17. Not enough on its own: the client stays on Java 17.

Recommendation: option 1, then decide on option 2 depending on demand. The environment only has JDK 21 and 25: testing Java 8 or 16 requires downloading one, which I did not do without approval.

**Forge 1.12.2 (14.23.5.2864).** Not measured by compiling: ForgeGradle 2.3 requires Gradle 4.9 and a JDK 8, which is missing here (Gradle 4.9 does not run on JDK 21). Estimate by counting: out of 64 files (9,992 lines) in the shared client, 20 files (4,939 lines) touch Minecraft, including `ClientRuntime` (1,690 lines), `ProgressiveGameCapture`, `RenderedModelCapture`, `PairingClient` and every screen. None can be adapted mechanically: 1.12.2 predates the flattening (block states by id and metadata), has no Mojang names (MCP mappings), no Brigadier (`CommandBase` commands), none of the current `BakedModel`/`BlockEntityRenderer` (`IBakedModel`, `TileEntitySpecialRenderer`), no `GuiGraphics`, and entities go through `Render<T>`. Add the 58 `record`s, Java 8 and HTTP on top. It is a rewrite of the client, around 5,000 lines, on a `core` that has to move to Java 8. Cheapest option: a minimal 1.12.2 mod that serializes the visible world (blocks and textures) with `core` ported to Java 8, without the screens, AFK or diagnostics, exporting through a command. Measured market share: at most 1.4% (see below).

### Forge 1.20.1 and Fabric 1.20.1: in-game capture test passed (5 November 2026)

The `mod/1.20.1/gametest-common` driver (flat world, scene, `/minemories export 12`, GLB verification, then open the hub and read a panel pixel) runs on both loaders: `./gradlew :forge:runClientGametest` or `:fabric:runClientGametest`, from `mod/minemories-1.20.1`. The Fabric test mod joins the development classpath and stays inactive without `-Dminemories.gametest=true`.

Identical result: 2507 blocks, 3 entities, 17 materials (180,704-byte GLB under Forge, 180,732 under Fabric). Alpha modes: 5 opaque, 8 `MASK` (leaves, grass, torch, chest, cow, armor stand…), 4 `BLEND` (stained glass, water). Chest, cow, armor stand and player go through the real renderer (`rendered/…` texture). Hub panel drawn on both.

The first attempt failed on `oak_leaves`: this was not a mod bug. Leaves without a trunk decay before the export (the extra `minecraft:item` entity in the GLB was their drop); the shared scene now places `oak_leaves[persistent=true]`. The same run surfaced the accessibility screen of a fresh profile, which the driver now closes. Limits: GLB not opened in the viewer, manual selection and menus not tried.

## Production JARs

`bun mod build` produces production JARs by default: the Gradle property `minemories.prod` is `true` (`-Pminemories.prod=false`, or `bun mod build --dev`, leaves the loader plugin's JAR untouched). `mod/shared/prod.gradle`, applied by every adapter, rewrites the final JAR in place (`remapJar` with Loom, `jar` otherwise): classes lose their debug attributes (source file, line numbers, local variables) and their SpotBugs/JetBrains annotations, JSON is minified, language files keep only the keys that differ from `en_us` (the game falls back to it), signatures, module descriptors, Markdown and `.gitkeep` are removed, and every entry is compressed at level 9. Compilation, tests and run tasks are untouched. JAR names do not change.

| Target | Dev JAR (bytes) | Prod JAR (bytes) | Saving |
|---|---|---|---|
| neoforge 1.21.1 | 441,408 | 362,664 | 17.8% |
| fabric 1.21.1 | 458,659 | 380,495 | 17.0% |
| forge 1.21.1 | 450,995 | 374,666 | 16.9% |
| fabric 1.21.11 | 458,012 | 379,327 | 17.2% |
| neoforge 1.21.11 | 446,281 | 365,750 | 18.0% |
| forge 1.21.11 | 447,379 | 366,672 | 18.0% |
| fabric 1.20.1 | 460,052 | 380,354 | 17.3% |
| forge 1.20.1 | 452,647 | 374,795 | 17.2% |
| fabric 1.19.2 | 466,904 | 385,743 | 17.4% |
| forge 1.19.2 | 457,193 | 378,317 | 17.3% |
| forge 1.18.2 | 458,061 | 379,041 | 17.3% |

What remains is code (about 200 classes, 300 KB before compression; `ClientRuntime` alone is 65 KB): going further means shrinking the bytecode itself. Rejected for now: ProGuard or any name shrinking/obfuscation, which would break the mixins, the entry points loaded by name (Fabric, `@Mod`, ServiceLoader) and the stack traces sent by consented diagnostics, with no in-game proof that such a reduced JAR works.

In-game proof: `-Pminemories.prod.run=true` applies the same transformations to the compiled classes and resources (`build/classes`, `build/resources`) before a launch, so that the capture tests run exactly the bytecode and resources the production JAR ships. All eight automated tests pass in this configuration (6 November 2026) with the same numbers as in dev: Fabric, NeoForge and Forge 1.21.11 (GLBs of 189,512 to 189,616 bytes, 16 materials), Forge and Fabric 1.20.1, Fabric and Forge 1.19.2, Forge 1.18.2. The 1.21.1 targets now have an automated test too (below), run on the dev classes; their production JARs go through the same transformation and still need to be tried by hand. Forge 1.21.11 does not stop on its own after the test (ForgeGradle 7 keeps the process alive): the headless runner judges by the report and kills the rest.

`bun mod build` rejects a JAR with no classes at all and builds without the Gradle build cache: a cache restore once shipped an empty 41 KB JAR for Forge 1.21.11, whose classes are compiled into the resources folder.

In-game tests must depend neither on window focus nor on a display: an unfocused client pauses along with its local server and the world never finishes loading ("World loading finished" loop on the loading screen), which always happens on a headless machine. The drivers disable `pauseOnLostFocus` and vsync; the headless runner (`scripts/mod/headless`) also stops a client whose same log line repeats 120 times or that stays silent for 5 minutes, retries once, and cleans up leftover processes.

## Versions targeted by modpacks (measured 5 November 2026)

Measurement: the 500 most downloaded Modrinth modpacks, each pack counting its downloads on its most recent Minecraft version (rough estimate; CurseForge, where big older Forge packs weigh more, is not measured).

| Minecraft | Loader | Approximate share |
|---|---|---|
| 1.21.11 | Fabric | 37% |
| 1.20.1 | Forge / Fabric | 20% / 10% |
| 1.21.1 | Fabric / NeoForge / Forge | 20% / 5% / 5% |
| 1.21.11 | Quilt / NeoForge / Forge | 4% / 4% / 2% |
| 1.12.2, 1.19.2, 1.18.2, 1.16.5 | Mostly Forge | 0.2 to 1.4% each |

Already built: 1.20.1 (Forge, Fabric), 1.21.1 (NeoForge, Fabric, Forge) and 1.21.11 (Fabric, NeoForge and Forge, see below). The remaining targets are in `planned` in `mod/targets.json` with a priority (P1 to P4), their loader version and the expected difficulty. Minecraft 1.21.11 is the P1 target: rendering was rewritten since 1.21.5, so it is a port and not a mechanical adaptation like 1.20.1. Older versions (1.19.2 and before) have neither `GuiGraphics` nor the current rendering APIs.

### Gap measured for Minecraft 1.21.11 (Fabric, 5 November 2026)

Compiling the 1.21.1 sources as is against 1.21.11 (Loom, Mojmap, Fabric API 0.141.6) gives about 145 distinct errors, concentrated in the capture:

- Fabric rendering API v1 (`RendererAccess`, `RenderMaterial`, `BlendMode`, `FabricBakedModel`) removed or rewritten: `FabricModelCapture`, `CaptureQuadEmitter`, `FabricPlatform`.
- `RenderType` / `RenderStateShard`, `GlStateManager` and texture reading (`bind`, `getId`, `downloadTexture`) replaced by the GPU layer: `RenderedModelCapture`, `CapturePixels`.
- Entity and block entity rendering through render states (`prepare`, `getRenderOffset`, `render`) and `VertexConsumer.setLineWidth`: `ClientRuntime`, `ProgressiveGameCapture`.
- Renames and UI APIs: `ResourceLocation`→`Identifier`, `getMinBuildHeight`→`getMinY`, `ClickEvent`/`HoverEvent`, `Matrix3x2f` for the GUI stack, buttons' `renderContents`.

Most of the work is therefore geometry and texture capture, which needs in-game validation; renames alone are not enough.

### Fabric 1.21.11 port: builds, not tested in game

`mod/1.21.11/` (Fabric loader 0.20.1, Fabric API 0.141.6+1.21.11, Java 21) builds with `./gradlew :fabric:build`; `bun mod status` counts it as built.

In-game test: `./gradlew :fabric:runClientGameTest` (from `mod/1.21.11/`) opens Minecraft 1.21.11 (sound muted, `user.home` isolated in `build/gametest-home`), creates a world, places stone, stained glass, leaves, grass, a chest, water and a torch, spawns a cow and an armor stand, runs `/minemories export 12` and checks the GLB (expected materials, BLEND and MASK alpha modes). It passes (5 November 2026) and has already caught broken mouse and keyboard mixins as well as a `fabric.mod.json` that still required 1.21.1. Still to validate: the GLB opened in the viewer, other modpacks and a visual render compared with Minecraft; the target must not be presented as supported before that.

The `mod/1.21.1` sources are copied, adapted by `adapt.gradle` (a pattern that no longer matches fails the build), then overlaid by `overlay/java`. By batch:

1. Renames: `Identifier`, `getMinY`/`getMaxY`, `identifier()`, `WorldVersion.name()`, `GameProfile.id()`, `Camera.position()`, key category `KeyMapping.Category` (the `key.category.minemories.minemories` translation is added to the language files at build time).
2. GUI: buttons' `renderContents`, `Matrix3x2fStack` (`pushMatrix`/`popMatrix`), `ClickEvent.RunCommand`, `HoverEvent.ShowText`.
3. Block geometry: `BakedQuad` is a record, `BakedQuads` (overlay) puts it back into the old vertex layout; on the Fabric side, `FabricModelCapture` collects `BlockStateModel.emitQuads` into a `MutableMesh` instead of the old `RenderContext` API.
4. Textures: `CapturePixels` reads atlases through a GPU copy (`copyTextureToTexture` then `copyTextureToBuffer`, strip by strip) and rereads entity textures from their source image, since they lack `USAGE_COPY_SRC`; `RenderedModelCapture` finds a `RenderType`'s texture through the access widener (`RenderType.state`, `RenderSetup.textures`).
5. Entities and block entities: `SubmitCapture` extracts the render state, submits it to a private `SubmitNodeStorage` and flushes it into the capture buffer with a `FeatureRenderDispatcher`; shadows, flames and outlines are not captured.
6. In-game selection: `WorldRenderEvents.END_MAIN` and `ShapeRenderer.renderShape` instead of `renderLineBox`.

Points to check in game: the UV of Fabric quads after `toBakedQuad`, GPU reading of atlases, block entities beyond render distance (extraction skips the `shouldRender` test), and the 4096 quads per model bound, now checked after emission rather than during it.

Maintenance: loader-specific code stays in `fabric/` behind the `ClientPlatform` interface (the core and `common` import no loader class). The two `overlay/java` classes that replace a shared class (`CapturePixels`, `RenderedModelCapture`) are pinned by `overlay/shared-sources.properties`: the build fails if the shared version changes, so the fix gets carried over to the overlay before the fingerprint is updated.

### NeoForge 1.21.11: builds, in-game test passed, not validated in the viewer

`mod/1.21.11/neoforge/` (NeoForge 21.11.48, Java 21, ModDevGradle) reuses the same `adaptSources` as Fabric: the task lives in the root `build.gradle` of `mod/1.21.11/` and produces `build/adapted-sources`; each subproject only contains its adapter. `./gradlew :neoforge:build` succeeds and `bun mod build neoforge 1.21.11` produces the JAR in `build/mod-dist/`.

What changes compared with NeoForge 1.21.1: `@EventBusSubscriber` without `bus`, `AddClientReloadListenersEvent`, `RenderLevelStageEvent.AfterTranslucentBlocks`, geometry through `BlockStateModel.collectParts` (model data comes from the level), `NeoForgeVersion` moved into `common`, and an access transformer for `RenderType.state`, `RenderSetup.textures` and `TextureAtlas.texturesByName`.

In-game test: `./gradlew :neoforge:runClientGametest`; NeoForge has no client test API, so a small mod (`src/gametest`) drives the client from its ticks (flat world, scene, `/minemories export 12`, GLB verification). The scene and checks are shared with Fabric in `gametest-common/`. Identical result on both loaders (2507 blocks, 3 entities, 16 materials). As with Fabric, the GLB was not opened in the viewer (no WebGL in the built-in browser): the target is not declared supported.

### Forge 1.21.11: builds, automated in-game test passed, not validated in the viewer

`mod/1.21.11/forge/` (Forge 61.2.5, Java 21) reuses the same `adaptSources`. `./gradlew :forge:build` succeeds and `bun mod build forge 1.21.11` produces the JAR in `build/mod-dist/`.

Two differences from the other loaders, worth knowing before touching this project:

- **Gradle plugin**: Architectury Loom resolves Forge 61.2.5 and compiles, but the game would crash at startup (`NoSuchMethodError` on `ByteBufCodecs$11`, inconsistently patched Minecraft jar). The project therefore uses ForgeGradle 7 (`net.minecraftforge.gradle`, `official` mappings). FML 61 only finds the `@Mod` class if the classes are compiled next to `mods.toml`: `build.gradle` compiles into `build/resources/main`.
- **EventBus 7**: each event has its own `BUS`, listeners are registered in `ForgeClient.initialize()` instead of through annotations; `RenderLevelStageEvent` no longer exists, so the selection is drawn by an `AddFramePassEvent` pass on the main target. Texture access goes through an access transformer.

Automated in-game test: `./gradlew :forge:runClient -PgameTest=true` (from `mod/minemories-1.21.11`). ForgeGradle 7 cannot launch two mods at once (the `slimeLauncherMetadataForForge` task gets created twice), and FML only finds classes from a second folder if it has its own `mods.toml`. With the property set, the test classes are therefore compiled into the mod's folder, and `src/gametest/mods-gametest.toml` is appended to its `mods.toml` as a second `[[mods]]` entry; without the property nothing changes in the JAR. The `TickDrivenCapture` driver is NeoForge's. Result: 2507 blocks, 3 entities, 16 materials, a 189,616-byte GLB, the same numbers as Fabric and NeoForge. The "stuck on the title screen" hang was not caused by mod discovery but by the accessibility screen a fresh profile opens before the title screen: the driver now closes it. Limits: the selection drawing by the `AddFramePassEvent` pass has not been seen on screen, and the GLB has not been opened in the viewer.

### Fabric 26.3: builds, automated in-game test passed, not validated visually (9 November 2026)

Target of the CurseForge profile "Echoes of the Sift" (Minecraft 26.3, Fabric Loader 0.19.5, Fabric API 0.161.0+26.3). `mod/26.3/` (Java 25, `net.fabricmc.fabric-loom` 1.20.0-alpha.23, Gradle 9.9) is a Fabric-only Gradle root: Minecraft 26.x is unobfuscated, so there are no mappings, no `remapJar` and no Quilt test JAR. `bun mod build fabric 26.3` builds it; Gradle runs on JDK 25 for this target (Loom refuses an older JVM), see `gradleJdkFor` in `scripts/mod/jdk.mjs`. `bun mod test fabric-mc26.3` runs `:fabric:runClientGameTest`.

The sources are the 1.21.1 ones adapted twice: `../1.21.11/adapt.gradle` first, then the 26.3 renames of `mod/26.3/adapt.gradle`:

- `GuiGraphics` → `GuiGraphicsExtractor`, `render*` → `extract*`, screens moved to `Minecraft.gui`, `GLFW` constants → `InputConstants`, `Util.openUri` → `ConfirmLinkScreen`, `EditBox.setFilter` removed.
- Rendering moved to the `renderpearl` GPU layer (`CapturePixels`) and to GPU-uploaded submit nodes: there is no `MultiBufferSource` any more, so `overlay/java/.../SubmitCapture` implements a `SubmitNodeCollector` that draws models, model parts, block models, items and custom geometry into the capture's own vertex consumers (shadows, text, flames and outlines are dropped as before).
- `BakedQuad.materialInfo()`, `BlockStateModelSet`, `FluidRenderer`/`FluidStateModelSet` replace the old block, quad and fluid APIs; the Fabric fluid handler registry is gone (sprites and tint come from `FluidModel`).
- Fabric API: `KeyMappingHelper`, `LevelRenderEvents`, `ScreenEvents.beforeExtract`, `Screens.getWidgets`, `api.client.renderer.v1`. The selection box is a `Gizmos` cuboid.

The in-game test (flat world with stone, tinted glass, leaves, grass, chest, water, torch, cow, armor stand) passes: `capture.glb` 190,588 bytes, 5 meshes, 17 materials, 15 images, 3 entities, in line with the other targets. It caught a mixin descriptor (`Minecraft.crash` gained an `int`). Two bugs the counts could not show were found by reading the GLB's textures: `NativeImage.getPixel` is ARGB (red and blue were swapped, fixed in `FabricPlatform.spritePixel`) and the GPU readback of renderer atlases (chest) returned transparent pixels until it copied the region straight from the texture with `copyTextureToBuffer` (`overlay/.../CapturePixels`). Not done: the GLB was not opened in Blender or the viewer, the profile's own mods (Sodium, Iris, the Sift) were not run, and Quilt is not applicable. `validatedInGame` therefore stays `false`.

### End portal and gateway (all targets, 9 November 2026)

The End portal and gateway are drawn by a fragment shader that samples no copyable texture, so they used to be exported as empty space. `EndPortalLook` (in `mod/shared/common`, used by every target) bakes one still frame of that shader (end sky plus fifteen rotated, tinted layers of the portal texture, game time zero) from the game's own textures, gives each face of the surface planar UVs, and exports it at full emission through `CapturePixels.procedural`. It is an approximation of the animated look, not the shader; the portal and gateway share one baked material (named after whichever was captured first). The in-game test scene places a portal and a gateway and fails when the portal material is missing; it passes on all 12 automated targets (26.3, 1.21.11 and 1.21.1 Fabric/NeoForge/Forge, 1.20.1 and 1.19.2 Forge/Fabric, 1.18.2 Forge). Other shader-only surfaces (mod-specific ones) are still not captured. Minecraft 26.x keeps the portal texture in `textures/entity/end_portal/` (patched in `mod/26.3/adapt.gradle`).

### NeoForge 1.21.1: minimum loader version 21.1.209 (9 November 2026)

The NeoForge JAR declares `[21.1.209,)` instead of `[21.1.248,)`: a modpack on NeoForge 21.1.209 (Better MC BMC5) refused to load it. The adapter is still built against 21.1.248; it also compiles and passes `:neoforge:test` against 21.1.209, but only the load on the modpack that reported it has been exercised in game, not the full capture scenarios on that loader version.

## Automated in-game tests (every target)

`bun mod test <id>` (add `--local` to use your own screen) runs, on every enabled target except Quilt: a flat world with a small scene, `/minemories export 12` and the GLB checks of `GlbReport`, then `FeatureScenario` (`mod/shared/gametest-common`), the same script on every loader and version, against a mock API on 127.0.0.1:

- nothing is sent before pairing (`upload` and a malformed `pair` produce no request);
- a refused pairing code stores no device token; the right one stores it, and every later call carries it as the bearer;
- diagnostics consent is requested after linking; `upload` sends exactly the bytes of the capture on disk, with its checksum and metadata;
- a failing upload sends a diagnostic report (at least one), which carries neither the token, the home folder nor the game folder;
- `select first`, `second`, `clear` and `export selection` (exact horizontal bounds, nothing exported without a selection); `select status` is only run, its chat output is not asserted.

The capture stays deterministic on purpose: the scene sets `randomTickSpeed` to 0 (an air pocket exposes dirt that a random tick turns into grass, which changed the seal's material from one run to the next) and the legacy drivers delete the previous test world first. The runner also fails a target whose log reports a missing resource of the mod (`Failed to load texture: minemories:...`). Minecraft 1.21.1 uses a driver per loader (`mod/1.21.1/gametest-common`, `runClientGametest` on each loader); its Fabric dev run copies `:common`'s resources and its Forge dev run `:core` and `:common` classes and resources next to the mod, since the dev launcher only treats the loader project's own folders as the mod. Not covered yet: diagnostics on a crash, the settings screens beyond the hub's background pixel, the AFK timer.
