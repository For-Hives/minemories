# Development rules

## Reference commands

- `bun install --frozen-lockfile`: installs exactly the versions recorded in `bun.lock`.
- `bun format`: applies Biome formatting to web files and scripts.
- `bun mod:check`: applies Spotless, then runs Gradle `check`. `bun mod:check:ci` checks without modifying sources.
- `bun check`: Biome, TypeScript checking, Vitest with a coverage threshold, then Gradle `check` in `mod/1.21.1/` (Spotless, SpotBugs, JUnit and JaCoCo thresholds).
- `bun api:check`: Biome, TypeScript checking, then the API's Bun tests. The tests use an isolated temporary SQLite database and storage.
- `bun run build`: runs the repository checks, builds the viewer, then builds the mod and the core.

## Short loop for the mod

From the repository root, with JDK 21:

```sh
bun mod:dev
```

This command runs the NeoForge POC's Gradle `:neoforge:runClient` task directly from the compiled classes. Gradle reuses its caches and builds neither the distribution JAR nor the web applications. The first launch has to download Minecraft and NeoForge, so it takes longer. Later launches recompile the changed sources. The development profile lives in `mod/1.21.1/run/` (ignored by Git): it keeps options, resources and test worlds from one launch to the next. Do not copy your real saves folder for testing.

In the development client, open a world and then the pause menu: the **Minemories** button lets you capture around the player, export a selection already defined with commands, enter the pairing code from the web and send the GLB manually. An identical button is added to the options screen, and the **M** key (rebindable in Controls) opens the interface from any screen, including menus replaced by FancyMenu/FTB/BHMenu. Visually check the menu with several buttons added by other mods, at a small GUI scale, the M key when no space is left, returning to the game, button states, the failure of an invalid code and the `~/export/capture.glb` file after capture. Start `bun api:dev` and `bun web:dev`, then set the mod's API to `http://localhost:3001` in advanced mode to exercise pairing and upload; Java checks alone do not cover these interactions.

Each upload attaches the player's coordinates, dimension, biome, world time, weather, world or server name, and the available thumbnail. The seed is sent only in single player, because the client does not know it on remote servers. Metadata is kept with the capture and shown in the gallery; older captures without metadata remain compatible.

To reproduce a modpack issue, put only the required JARs compatible with **Minecraft 1.21.1 / NeoForge 21.1.248** in `mod/1.21.1/run/mods/`, then copy the needed configuration files into `mod/1.21.1/run/config/`. Start with the clean client, then add the dependencies relevant to the tested case; a full modpack can bring its startup time back. A Java change requires restarting the client for reliable validation. To inspect GLB serialization quickly without launching Minecraft:

```sh
cd mod/1.21.1
./gradlew :core:test --tests "dev.minemories.core.GlbSceneTest"
./gradlew spotlessCheck
```

On Windows, use `gradlew.bat` instead of `./gradlew`. `spotlessApply` formats the Java; `spotlessCheck` checks without modifying. For the final integration test: `./gradlew build`, then exercise in game and inspect the GLB in Blender or the viewer. These shortcuts do not change the supported targets (see [Loader support](../features/loader-support.md)).

## Change policy

1. Every reproducible logic fix gets a test at the lowest level that exercises it; prefer `mod/shared/core` for game-independent logic.
2. No SpotBugs warning is ignored globally. Suppressions must be local, justified and accompanied by a comment.
3. Minimum Java coverage for the core is 90% of lines and 60% of branches. TypeScript utilities covered by Vitest stay at 100%.
4. Changes to GLB formats, textures, selection or rendering also need documented visual validation: unit tests do not replace Blender or a Minecraft session.
5. Web dependencies are installed from the root, locked in `bun.lock`, and updated deliberately. Gradle plugin and tool versions stay explicit.
6. A feature is declared compatible only with the loaders/versions actually compiled and tried.

GitHub CI runs `bun run build` on every pull request and every push to `main`. Branch protections must require this status before merging.

The Gradle wrapper uses version 9.8.1 and checks the official SHA-256 of the distribution before installing it. The updated wrapper JAR was also compared with the checksum published by Gradle. Foojay Resolver 1.0.0 remains compatible with this version. Local development and the game still use Java 21; the toolchains of `:core`, `:common` and the three adapters explicitly target Java 21. Official prerequisites are described in the [Gradle matrix](https://docs.gradle.org/current/userguide/compatibility.html) and the [Foojay README](https://github.com/gradle/foojay-toolchains/blob/main/README.md).

In CI, `setup-java` installs Java 21 then Java 25: the latter runs Gradle, while `JAVA_HOME_21_X64` explicitly exposes the JDK used to compile and test the mod. This split changes neither the player's installation prerequisites nor local development under Java 21. See [setup-java multiple installations](https://github.com/actions/setup-java/blob/main/README.md#multiple-jdks-and-maven-toolchains) and [Gradle toolchain locations](https://docs.gradle.org/current/userguide/toolchains.html#sec:custom_loc).

The mod still shows deprecation warnings coming from the Minecraft/NeoForge APIs of the 1.21.1 target. They stay visible in the build; the neutral core, however, treats every javac warning as an error. Migrating these hooks requires in-game validation, so do not hide javac output or replace an API without exercising the mod.

## Gallery and viewer atmosphere

The site uses a dark theme. The gallery shows each world/server as a folder collapsed by default, like the Minecraft server list: a 64 px icon (thumbnail of the most recent capture), name and MOTD (`N captures · Seed … · last visit …`). Single-player captures are grouped by world name and seed, multiplayer ones by server name. Older captures without this information stay in "Other captures". Two servers saved under the same name are grouped together as long as no server identifier is available. Within a world, captures less than 64 blocks apart horizontally are stacked visually ("Same area · N captures · Near x, y, z") to show that they cover the same area. Each card shows a preview of the 3D model itself: the first time a capture without a thumbnail is opened, the viewer renders the scene (400×250 JPEG, cover crop without stretching, high-quality downscale) and persists it through `memories.setThumbnail`. The world/server icon sent by the mod stays on the folder (`metadata.icon`): the upload stores the mod's image in `icon` and leaves `thumbnail` empty, and older captures have their image promoted to `icon` the next time they are opened. Avatars use the account image when it exists, otherwise the local initial (no third-party service is called by default). In My account, a player can enter their Minecraft username to use their head: `account.setMinecraftHead` validates the username (3-16 letters, digits or underscores) and stores the Minotar URL built server-side, and `null` removes it. The "Your mod is paired" banner stays visible while a snapshot is less than two months old; beyond that, the gallery offers to pair again.

The viewer offers four fixed lighting presets (morning, noon, sunset, night). The initial lighting follows the captured time (`dayTime` in ticks converted to minutes) and the closest preset is highlighted. The skybox adapts to the dimension and biome (`getAtmosphere`): a fixed ember glow with no sun or stars in the Nether, a fixed purple starry night in the End, dimmed darkness in the deep dark, and the classic day/night cycle elsewhere; hemispheric tints follow the dimension. Shadows use soft PCF filtering on a 2048-pixel map. Clouds keep drifting at 0.6 blocks/second towards +X while the lighting stays fixed. The layer uses the `assets/minecraft/textures/environment/clouds.png` pattern from Minecraft Java 1.21.1 (local copy in `apps/web/public/textures/minecraft-clouds.png`), with 12 × 12 block cells and a thickness of 4 blocks. Rendering places the layer above the model (`bounds.max.y + max(32, horizontalFootprint × 1.6)`) with an opaque unlit "fast graphics" style material, tinted by daylight; opacity prevents clouds from being drawn in front of transparent foliage. The capture coordinates, the camera position and an offset derived from the seed (hash 0-255) shift the pattern; the recorded time is a reproducible starting point for the movement (`ticks * 0.03`). Vanilla Minecraft uses a seed-independent pattern and a local render clock: the per-seed offset tells worlds apart without claiming frame-by-frame synchronization. Clouds are hidden for dimensions other than the Overworld. A local GLB without metadata uses a fallback origin (0,64,0).

`/minemories export` without an argument uses a horizontal radius of 128 blocks (8 chunks). The menu buttons use the radius configured in the advanced settings, 32 blocks by default, with depth limited to local visits by default (see [settings](../features/mod-distribution.md)). `/minemories export 16` reduces the radius to 16 blocks; `/minemories export selection` exports the selected corners. The client does not force-load missing chunks. This area is much more expensive than the old 8-block box: the export stays synchronous and can briefly freeze the display. The new client uploads captures up to 200 MiB in resumable 4 MiB chunks; the old endpoint keeps its 100 MiB limit. See [the upload protocol](../features/resumable-uploads.md).

Snapshots are renamed from their card (80 characters max) and stacked areas from their banner (stored in the browser). The trash (`deleted_at`, `purge_after`, listed through `memories.listTrash` with `purgeAt`) keeps new snapshots for 30 days (`TRASH_RETENTION_MS`) before purging them at startup and then every hour. The migration protects older deadlines; the site shows the deadline received from the API. See [recovery delays](../features/trash-retention.md) and [durable deletions](../features/durable-deletions.md). A share link (`/share/:token`, token stored hashed, revocable) opens the snapshot read-only without an account through `/api/shared/:token` and `/file`.


### Web and API flow tests

The React tests in `apps/web/src/pages/interactions.test.tsx` use jsdom: sign-in,
sign-up, gallery refresh, pairing polling states and cancellation, and the
viewer's local file choice and errors. The WebGL engine is replaced by a fixture; these
cases do not validate 3D rendering. 100% coverage is still limited to the `src/lib` utilities.

`apps/api/src/session-rpc.test.ts` creates real Better Auth sessions and goes through the
HTTP/oRPC routes for pairing, isolation between accounts, captures, thumbnails,
sharing, trash, restore, deletion and sign-out.

`storage-s3.test.ts` exercises the real S3 SDK against a test HTTP server, including an
outage, the initialization retry and binary bytes. To check a real Garage, use
a dedicated test bucket and the `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY` and `S3_REGION` variables, then run:

```sh
RUN_GARAGE_INTEGRATION=1 bun test apps/api/src/storage-garage.test.ts
```

Without this variable, the test is skipped. `bun run api:garage` creates a disposable Docker Garage, exercises HTTP/oRPC sessions,
pairing and a 5 MiB chunked upload, reading and deletion, then a real Garage
outage and a resume in a new API process. The scenario checks that there is no
duplicate and checks the GLB bytes. It deletes only its own
`minemories-integration` Docker project. CI runs this flow after the build. API coverage requires 90% of lines and 80% of functions **in each file**,
through `apps/api/bunfig.toml`, with the text and LCOV reporters. The inventory check
`check-api-coverage.mjs` rejects a source file missing from the report; tests, fixtures
and `.d.ts` declarations are excluded from this inventory. A negative test runs the real Bun
on a fixture whose average exceeds the thresholds but where one file stays low:
the process must fail. See the [Bun documentation](https://bun.sh/docs/test/code-coverage).

### Modes and distribution

The menu starts in simple mode (sign-in and capture/upload). Advanced mode shows the local folder, the custom API, local exports and AFK. AFK is on by default (5 min idle / 4 h between captures / radius 32), including while paused and in the background; an existing opt-out is kept. Simple mode offers the AFK button, and the advanced sub-screen the delays and radius. See [settings and distribution](../features/mod-distribution.md). `runClient` declares the `:core`, `:common` and `:neoforge` sources as a single mod, so development uses the same classes as the standalone JAR.

Viewer validation of 10 October 2026: local opening of the real 189.6 MiB GLB in Chromium with terrain and textures rendered. The gallery flow now shows the download before 3D loading, cancels requests when leaving the page and gives priority to the requested memory over an old local file. Authenticated reading of the same memory in production is still to be confirmed.

Three.js 0.186.1 validation of 11 October 2026: `bun run build` passes on the rebased
branch, with 82 API tests and 62 web tests. The local viewer opens the real
10 MiB GLB (134 materials, 55 embedded textures and 128 imported lights, capped
at 32 by the viewer); terrain, snow, vegetation and underground are visible after
preparation. The same file is imported and rendered in Blender 5.2.2.
The first shader compilation is slow on the test browser;
its profiling is still tracked in [issue #74](https://github.com/For-Hives/minemories/issues/74). The adaptations from the
[official migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
replace `PCFSoftShadowMap` with `PCFShadowMap` and call `super.dispose()`
in the clouds, with a check of the dispose event. The viewer bundle
is about 656 kB minified / 166 kB gzip: the slight overshoot of the
650 kB warning stays visible, without changing the threshold.

The animated loading state now covers the API download, GLB reading, textures and shader compilation. The viewer waits for preparation and the first render before removing this state; an interaction test checks that the spinner is present during these phases. Rendering of a real AFK capture was checked again in Chromium. The requests to limit captures to the visited depth and to close borders with dirt/stone are detailed in issues #7 and #8; depth limiting is implemented and [validated by a comparative run](../features/exploration-depth-validation.md), and border closing is implemented and validated below.


Local validation of cut faces on 10 October 2026: NeoForge exports on an isolated copy
of the test world, then Blender 5.2.2 import/render. A 17 × 17 block surface capture
is 5 blocks high and has closed dirt/stone sides, with snow and
vegetation preserved. A capture with deep history is about 60 blocks
high and closes cave openings on the edges. Visits persist
after restart; active tracking runs every tick to record
short descents, with a render check while paused. Models declaring quads
without a cull direction are filtered only when they coincide with the cut.

An additional fixture on the isolated copy contains a pool crossing the cut
plane, glass, leaves and stairs. The export while paused keeps the
MASK (glass/leaves) and BLEND (water) materials and the stairs' non-cubic model. Six water quads
are present on the east cut despite the neighboring water outside the capture. The Blender render of
this 17 × 17 × 5 block capture was inspected: no opaque wall above the
pool floor, closed dirt/stone section, transparency preserved.

### Viewer studio — October 2026

The local viewer, the gallery viewer and shared links now use the
same HDR render chain: ACES, moderate bloom on a resolution pyramid, sRGB
output and FXAA. The reflection environment is generated locally from the sky
(PMREM) and recomputed only when the atmosphere changes, never every frame.
By day a neutral grey veil sits between the sky and the scene while that
environment is baked (`apps/web/src/lib/environment-veil.ts`): without it the
blue sky tinted every face turned away from the sun, so purple concrete read
navy and wood read grey-green. The veil fades out with daylight, so night
keeps its blue moonlight, and skies without a sun (Nether, End) get none.
Water reflections are a little greyer as a result but still read blue.
Transparent surfaces get lower roughness; these are environment
reflections, not reflections of neighboring objects or ray tracing. Textures
stay pixelated up close, with interpolated mipmaps and anisotropy capped at 4.
Block light is a voxel light volume sampled by the materials, not point lights (see
`docs/features/web-foundations.md`, "Block light volume"); the
2048-pixel sun shadows are updated when the lighting/capture changes.
No GLB format or Minecraft export is modified.

The Atmosphere panel also offers a lighting style, remembered on the device
(`minemories-viewer-lighting` in local storage, ignored when storage is blocked).
**Realistic** (the default) is the chain above. **Faithful to the game**
reproduces Minecraft's own block lighting: base colour (texture × material
colour) × the game's face shade (top 1, north/south 0.8, east/west 0.6, bottom
0.5) × the sky light of the hour from the game's light map (white by day, a dim
moonlit blue of about 0.27/0.27/0.46 at night, darkened by 5/16 in rain, snow
or overcast skies), all as sRGB multipliers. The light map follows the
capture's place: the Nether has no sky light but a constant warm ambient light
(about 0.35/0.27/0.22), the End forces its fixed light map (about
0.47/0.52/0.48) day and night, and the deep dark gets no sky light at all, only
block light over the light map's minimum of 0.03. The capture carries no light
levels, so every face is lit as if it stood under the open sky (in the deep
dark, as if fully enclosed): interiors and caves look brighter than in game, and
a surface build in the deep dark darker. Captured lights and emissive blocks
add block light on top, capped at the full-daylight face colour, so lamps stay
bright at night. There is no tone mapping, visible sun shadow, environment
reflection, bloom, haze or colour grading; the screen-space occlusion stays as the
counterpart of the game's smooth lighting, and alpha, cut-outs and water
transparency are unchanged. Every imported PBR material carries one shared
shader branch (`viewer-faithful.ts`), so switching is a uniform flip without
reloading the capture or recompiling the materials (the sun shadow pass keeps
running in both styles, since the shadow count is part of every material's
program key; only the final output pass changes its tone mapping), and
switching back restores the realistic render pixel for pixel. The maths (face shade, light map) lives in `lib/viewer-lighting.ts`.
On the zone 1 tour capture at 9:30 the faithful render averages (102, 108, 91)
over the lower 70 % of the frame against (95, 100, 82) for the in-game frame;
the realistic render gives (68, 96, 100).

The desert/badlands/savanna, snow/ice and jungle/swamp palettes complement the
Nether, End and deep dark atmospheres. The Clear, Mist and Overcast settings are
local artistic variants, with no simulated rain and no change to the memory.
Sunset targets 5:15 pm to keep long, low shadows. Very deep
captures open on their surface, and the underground can be explored
by moving the camera. Clouds are placed above the initial framing.

Auto quality starts with a DPR capped at 1.5 and drops in steps of 0.25
(down to 0.75) if more than 100 of the 180 measured frames exceed 26 ms. Bloom is
turned off at DPR <= 1 in that case. Cinematic mode allows DPR 2; Eco forces DPR 1
without bloom. Rendering stops in a hidden tab and before a model is opened.
The reduced-motion preference freezes the clouds; contemplation only
starts on request. Loading stays visible until the first composited render.
Cancelled loads are discarded and their resources released; replacement keeps the previous capture until compilation succeeds, as in the timelapse player.

The shared controls offer contemplative rotation, fullscreen and a local JPEG
postcard. The postcard is cropped to 1920 × 1080 from the available render
resolution. From a gallery capture, the share panel explains
link access, then requires an explicit action to create the link and allows its
revocation. A local file is never published by these controls.

Validation: interaction tests for atmospheres/quality/contemplation/postcard,
non-regression of stale loads and of releasing shared textures,
palettes covered at 100%. Chromium inspection of real captures from the
NeoForge fixture (entities, chests, bed, ground) and Blender 5.2.2 import/render of the AFK capture.
The redesign is tracked in issue #93. Comparative GPU measurement on identified hardware is still to be done in issue #74;
Chromium software rendering is not proof of 60 FPS on mobile.

Firefox regression (15 October 2026): keep the GLTFLoader's normals/shading
choice. Forcing `flatShading` on every PBR material produced NaN
values in HDR rendering on Firefox/NVIDIA GTX 980; the successive bloom blurs
spread them over the whole image in Auto/Cinematic. Eco mode hid the problem.
The fix keeps the imported normals, and therefore the edges of exported blocks,
and leaves bloom on. Unit test of material preparation, before/after
reproduction in Firefox 153 with a real 14.9 MiB capture: 2,286 non-finite
components in the bright pass before, zero after in that pass and the five blur
levels. Check Auto → Eco → Cinematic, then times of day and atmospheres during
the next browser validations; a simple load without JS errors is not enough.
The same capture was also imported and rendered in Blender 5.2.2; no
change to geometry, textures or export format is needed.

### Immersive studio — second pass

The local, private and public viewer now fills the whole viewport, outside the marketing
navigation. Opening and loading have their own screens; the image is surrounded
by a back/open banner, a side action bar and a continuous time-of-day slider
(dawn, morning, noon, golden hour, night). The Atmosphere panel starts closed.
Immerse hides the controls; Escape restores them and closes the panels. On mobile,
actions become icons named for screen readers. Private sharing
stays explicit, revocable and absent from local files. The timelapse player keeps
its specific interface and uses the same render engine.

The chain becomes: HDR scene + depth → atmosphere → bloom → ACES/sRGB → FXAA.
The atmosphere pass reconstructs positions from the existing depth: 12-sample
contact occlusion, distance/height fog, 12-sample sun scattering
only when the sun is visible, light grading and a vignette. No second render
of the geometry, no per-material normal computation and no history buffer. The cross
product used for occlusion is normalized with a bounded denominator, to avoid
NaN on degenerate surfaces. Both HDR targets carry a depth texture;
fullscreen passes do not modify depth. Eco turns off occlusion, sun scattering
and bloom, keeping fog/grading/FXAA. The rays are a screen-space
approximation, not a physical volume or an effect visible off screen.

Lighting now contrasts a warm sun with a cooler, less intense ambient light. The 2048
shadows are concentrated around the framed surface rather than the full depth of the
underground. `beacon_beam` beams stay visible but no longer shift the framing
and cast no shadow. Point lights no longer exist for block light: every captured light is baked into the light
volume, so deep lava cannot push out a torch and there are no point-light shadows.

Materials explicitly identified as Minecraft water get slightly
rippled normals and stronger sky reflections. The patch is idempotent for
shared materials; movement stops with `prefers-reduced-motion`. Glass
is not treated as water. These are still PMREM sky reflections, without SSR or dynamic
reflections of buildings. Biome palettes are still based on known
metadata; no biome is invented for a local GLB without context.

Validation: a frozen real 25.9 MiB mod capture (mangrove, base, water, beacon and emissive
sources), Firefox 153/NVIDIA GTX 980, desktop and 390 × 844, three quality levels, night/mist,
immersion and restoring the controls. GPU read of the HDR buffers: no NaN/Infinity
component at any of the three quality levels. Tests of framing without the beacon, priority of surface
lights, shared water materials, depth wiring and studio interactions.
Multi-GPU comparison and final aesthetic validation are still tracked in #74/#93.
The same capture was exercised in Chromium (desktop and mobile), then imported and rendered
in Blender 5.2.2. The viewer module's initial loading skeleton also uses a
fullscreen surface, without temporarily showing the old page cards again.

### Player framing and interior exploration — 16 October 2026

New manual and progressive captures write
`scenes[0].extras.minemoriesPlayerPosition: [x, y, z]`: the position of the player's feet
at the start of the capture, relative to the geometry's `captureOrigin`. No name,
player identifier or absolute coordinate is added to the GLB. Both serializers
reject non-finite coordinates. The viewer applies the model transform
(notably the sequence offset) before centering its orbit on that point.
The old `x/y/z` metadata fields are not used for this: some
exports stored the volume's center there. For an old file without this data,
framing keeps falling back to the surface, without the beacon beam. A
new capture with the updated mod is needed to find the player exactly.

The First person button opens a free camera 1.62 blocks above the captured
point. Dragging turns the camera; WASD/ZQSD (physical keys) or the arrow keys
move it at 3 blocks/s. E/Space goes up, Q on QWERTY/A on AZERTY goes down, Shift speeds up
(12 blocks/s), Alt slows down (0.7 blocks/s). Hold-down buttons also offer
movement on touch screens. The camera can pass through walls; no physics
or heavy collision is added. The near plane is at 0.02 blocks. Losing focus,
hiding the tab and Escape stop keyboard movement. Recenter goes back
to the orbit; leaving the mode keeps the visit position.

Validation: tests of transformed/invalid local coordinates, legacy and spool
serializers, asynchronous publication, movement, key release and
toolbar interactions. Firefox GPU: target [4,-70,5], eyes [4,-68.38,5], movement of
0.15 blocks in 50 ms, return to orbit without a jump and zero non-finite HDR values. This position
is test data added to a copy of the real 25.9 MiB capture, not a
player position supposedly recovered from the old file. Interface checked at
1200×850 and 390×844, with no JS errors or overflow. This enriched copy imports and
renders in Blender 5.2.2. The new position extraction from Minecraft still has
to be exercised in game with the updated JAR; that check is not replaced by
Java tests or the Blender render.

### "The living album" art direction proposal — 16 October 2026

The proposal extends the viewer's atmosphere to the site: deep forest `#101e1c`,
ivory `#f0ebdc`, soft gold `#e9c583`, sage green surfaces and subtle rules. Large
headings use a system serif stack (Iowan/Palatino/Georgia), controls keep
the sans-serif and markers use the existing monospace. No remote font
or animation library is added. The small wireframe cube is a proposed brand
mark, not a validated brand identity for the catalogs or the mod.

The home page is rebuilt around a story, an illustrative SVG landscape with three lighting moods,
an ivory section, a journey and collections. The landscape is explicitly an
illustration: it does not claim to show a real capture. The shapes reuse the
repository's vector illustrations; no private capture enters the public assets.
The morning/golden hour/night switch is reachable through native buttons with an announced state.
No WebGL context is created outside the viewer. Decorative animations respect
`prefers-reduced-motion`.

Navigation becomes a persistent capsule; the footer picks up the editorial
typography. Sign-in/sign-up, content, pricing, guides and collections use the same
palette. On large screens the gallery puts the pairing/storage tools in a dedicated
column and keeps the existing groups/renames/shares; standalone captures are laid out
in a grid without empty columns per area. Small screens get a single flow again.

Chromium visual validation: home, pricing, sign-in, installation, discovery,
journal, privacy and the public demo; gallery with test data intercepted
only in Playwright. Desktop/mobile check, no overflow or JavaScript error.
Firefox: lighting changes, reduced motion, navigation availability
at 360/390/730/740/930/1440 px and the menu closing after navigation. Interaction tests
cover the lighting and visitor/signed-in destinations in FR/EN. Aesthetic validation
by the owner remains open in issue #76; the proposal is not a final
brand validation.
