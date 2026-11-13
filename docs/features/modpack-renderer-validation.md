# Modpack renderer validation

The scope below covers targeted renderers, then isolated copies with the
profiles' full JAR lists. Compatibility with each third-party renderer
and each player configuration still has to be assessed separately.
Personal saves are neither used nor modified. The test benches have their
own settings; the full-profile trials also reproduce the pack's compatibility
settings explicitly listed below.

This validation covers Minecraft 1.21.1, with the NeoForge JAR lists of the
`mc breval` and `All the Mons - ATMons` profiles. The local DeceasedCraft
profile runs Minecraft 1.20.1 / Forge 47.4.0: it does not receive this NeoForge
JAR and is not validated by these trials. Other loaders are tracked by
[the porting issue and the loader matrix](loader-support.md).

## Overflowing UVs on the Create goggles

A player's log revealed an additional case, tracked in
[#115](https://github.com/For-Hives/minemories/issues/115): the Curios renderer
for the Create 6.0.10 goggles uses `assets/create/models/block/goggles.json`, where two
faces of the glass have UVs `[11, 0, 17, 0.2]`. They therefore go past the right edge
of a sprite whose nominal coordinates run from 0 to 16.

On a large atlas, these faces do not map to a single sprite. The collector
now copies the pixel rectangle that is actually sampled, with one neighboring
texel for filtering, then remaps the UVs to that rectangle. It keeps the
per-sprite split for other faces and shares crops that were already copied.
It does not remove the player's or the accessory's geometry and does not clamp the UVs
to the original sprite, which would change the model's pixels.

Pixel, PNG, texture and lookup limits are unchanged. A crop that is too
large or UVs outside the atlas are still errors; primitives with non-finite UVs
are dropped. Only the absence of a sprite containing the UVs enables this
path: exceeding a lookup limit does not trigger it.

Unit tests reproduce the glass coordinates and check that texel positions are
preserved, along with edges/degenerate cases and rejections.
The isolated bench reproduces the failure with the previously installed JAR (SHA-256
`13a05b64cf1c8ff7b9055b1b68d099739f2fc89d932a83a6c88a54073ac3a021`).
It uses Minecraft 1.21.1 / NeoForge 21.1.248, Create 6.0.10, Curios 9.5.1,
Sodium 0.8.13 and Irregular Implements 1.12.0, with their dependencies. An unused
texture grows the atlas to 4,096 × 4,096; the player actually wears the goggles
in the Curios `head` slot. Personal saves are not used.

The fixed local JAR, embedded version 0.5.0-beta.1, has SHA-256
`7f108a5234b51381d278d13ea8ea10491fb27f79a2d0caea7119d2e1400b8d46`.
This local version name does not replace an already published artifact; publication
will follow the usual workflow once the fix is merged.

- The manual export succeeds: 914 triangles, 10 images, 89,264 bytes.
- The progressive AFK capture, continued while paused, succeeds: 22,812
  triangles, 52 images, 1,721,840 bytes. The capture scope does not stay active
  between steps.
- Both GLBs embed the player, the glass and the goggles' strap. The problematic
  crop is shared and measures 8 × 3 pixels. Its 24 encoded pixels were
  compared in game with a fresh read of the GPU rectangle: they are identical.
- Eleven OpenGL states are restored, with a 16-byte PBO and non-standard packing.
  Positions/normals/UVs are finite; no image of the full atlas is
  embedded. The API validators and metadata checks pass.
- The Minecraft screen and the Blender imports/renders were inspected. `bun mod:check`
  and `VITEST_MAX_WORKERS=2 bun run build` pass, without changing the quality thresholds.

Local evidence: `goggles-atlas-20261015/evidence.json`, `baseline/`, `fixed/`,
`full-build.log` and `mod-check.log` under the private validation directory.

## First bench, 15 October 2026

Minecraft 1.21.1 / NeoForge 21.1.249, Mesa llvmpipe OpenGL 4.6, with no additional
resource pack and no shader pack enabled. The client loads these exact versions:

| Component | Version |
| --- | --- |
| Create | 6.0.10 |
| Flywheel bundled with Create | 1.0.6 |
| Bundled Ponder | 1.0.82+mc1.21.1 |
| Cobblemon | 1.7.3+1.21.1 |
| Mekanism | 10.7.19.85, declared version 10.7.19 |
| Kotlin for Forge | 5.12.0 |
| GeckoLib loaded | 4.9.2 — no specific GeckoLib renderer is validated here |

The bench places Create shafts, a cogwheel, a large water wheel and a press,
Create/Mekanism tanks, a Mekanism infuser, tinted foliage, red glass,
flowing water and a Pikachu whose secondary texture is marked emissive. The mod stays unpaired and
AFK captures are explicitly disabled during this first manual trial.
Settings and the save are specific to the bench.

With the previous JAR, Flywheel bypasses the CPU renderer of animated components.
The export succeeds but omits the geometry of several components visible in game.
Pikachu and its two textures are already present. The fix gives
access to the CPU renderer only while a model is being collected:

- a thread-local scope wraps block entity and entity renderers;
  it is restored on normal exit, on error and for nested calls;
- an optional mixin on the Flywheel implementation answers "no GPU visualization"
  within that scope. The rest of the game's rendering keeps its backend;
- a probe checks during capture that Flywheel actually stepped aside.
  An unknown API or a backend that does not step aside makes the capture fail rather than
  silently recording missing parts. The absence of Flywheel is
  not an error. The scope is never left active between two AFK steps.

This integration targets the Flywheel version above. It does not extract an arbitrary
mesh from a shader: the mod involved must provide a usable CPU path.
Purely GPU effects, glint, text, lines and layers without normals remain subject
to the [capture limits](frozen-entities.md). Texture and primitive limits
are not raised to hide a compatibility problem.

## Before/after evidence

The reference JAR has checksum
`4104f3cd139857846593db52b61a47c84590a0c75a3e2f43ca2460a8d464113a`.
The first candidate exercised has checksum
`9a6433648ddb3b3ab405e2849366b6d5fb0ba2a70d162258f1cffab35090c2bc`.
Atlas texture references are shared; the material name is not enough
to identify each block. The check therefore counts the triangles produced by the
renderer within the components' geometric cells:

| Component | Before | After |
| --- | ---: | ---: |
| Shaft | 0 | 12 |
| Cogwheel | 0 | 1,284 |
| Large water wheel, central cell | 0 | 279 |
| Press | 0 | 42 |

These numbers are triangles whose center lies in the inspected cell,
not the total for the whole model. The GLBs contain 4,148 and 14,130
triangles respectively, with finite positions/UVs. Pikachu poses and counts changed
between trials; pixel-for-pixel identity of the whole scene is not claimed.
The Blender 5.2.2 before/after renders and the Minecraft screen after capture were
inspected: the previously missing Create components appear.

The monitored texture bindings, pack/PBO, active unit, program and framebuffer
stay identical before/after capture. Flywheel is active after the capture.
Two unit tests check nesting, errors and isolation between threads; the
Java, Spotless and SpotBugs checks pass. This first trial does not yet exercise
all the conditions of #91.

Local evidence outside Git:
`~/.local/state/minemories-validation/modpack-renderers-20261015/`, notably
`installed-targets.json`, `cpu-fallback/runtime.json`,
`cpu-fallback/renderers.json`, `cpu-fallback/comparison.json`,
`cpu-fallback/screenshots/`, `cpu-fallback/before-blender.png`,
`cpu-fallback/after-blender.png` and `cpu-fallback/blender-report.json`.
The validation Gradle project is kept separate from the repository to run NeoForge 21.1.249.
The first trials fixed the driver (explicit chunk loading and a
valid block state), without attributing those failures to the product.

## Powered mechanisms and fluids

The final candidate of this step, after formatting the mixin JSON, has SHA-256
`972533a8cf84199aded16a7cfc0be8ab3a734aa4a7599adc4b073e72d42008ec`.
The second client run confirms the following synchronized values: shaft,
cogwheel and press at 16 RPM, a large wheel driven by water at 4 RPM,
a Create tank with 4,000 mB of lava and a Mekanism tank with 8,000 mB of water.
The manual export produces a self-contained 2,715,596-byte GLB, with the nine monitored
OpenGL states preserved and Flywheel still active after capture.

All three files (reference, first CPU fallback and powered mechanisms) pass
the API's real GLB and metadata validators. Movements are frozen, not
exported as playable animations. The reports are in `powered/` and
`api-validation.json`. Blender imports the 22,282 triangles of the second export;
its render and the Minecraft screen were inspected, with the mechanisms, the
waterfall and the tank contents present. The first press placement used a shaft not connected
to the motor; the driver was fixed and non-zero speeds were then
checked on the client, without presenting this fixture failure as a mod defect.

`bun run build` passes on this code, including `bun check`, the unit tests,
Spotless, SpotBugs and JaCoCo. The additional trials and the full profiles
are described below.

## AFK, cancellation and render combinations

The same `972533a8…` JAR completed a progressive AFK capture while paused,
with radius 12 and full height enabled in the bench. The producer
reports 909 steps, 59,917 blocks, five entities and 39,622 quads. The
6,888,448-byte GLB contains 79 embedded images and 79,244 triangles; the Create
components, the tank fluids and Pikachu are present. Positions/UVs are
finite and both interval timestamps are recorded. The Blender render
was inspected. The producer is still subject to indivisible operations: seven
soft-budget overruns were measured, with a maximum step of 16.98 ms;
no hard two-millisecond budget is claimed for a third-party renderer.

The collection scope is disabled between AFK steps and Flywheel stays active.
A second cycle is cancelled: no additional memory is published, the
hash of the last complete GLB stays identical and the spool is cleaned up. No
Minemories pairing or network upload is used in this run.

| Combination exercised | Result |
| --- | --- |
| NeoForge 21.1.248, without Flywheel | Startup and capture of a chest, dyed sheep, foliage, glass and water; scope restored. |
| NeoForge 21.1.249 + Sodium 0.8.13 | Capture of powered mechanisms and fluids; nine monitored GL states identical, Flywheel active after capture. |
| Same bench + Iris 1.8.14-beta.1 + MakeUp UltraFast 9.5e | Iris API confirming the shader is enabled; capture succeeds, nine monitored GL states identical. In this combination Iris already disables Flywheel outside capture. |

The matrix's seven GLBs, including AFK and the regression, pass the real API
validators. The Blender renders of the regression, Sodium and Iris were also
inspected. Sodium reports that the collector uses the generic vertex path;
this diagnostic is not hidden and no Sodium acceleration of the collector is
claimed. Shader-specific visual effects are not reproduced in the GLB,
which keeps the self-contained base geometry and textures.

Evidence: the `afk/`, `vanilla/`, `sodium/`, `iris/` subfolders,
`api-validation.json` and the associated Blender reports/renders. These combinations
use the targeted subset of mods; the trials with the full lists
are described in the following sections.

## Full-profile atlases

The `mc breval` copy loads the profile's list of 483 third-party JARs with NeoForge
21.1.248 and the `972533a8…` candidate. Loading the world requires the existing
JustDynaThings setting `disable_chisel_modern=true` and the pack's KubeJS
data. With that data, the bench's mechanisms and fluids are visible, but
the export fails: the block atlas is 8,192 × 8,192 pixels, above the limit
of four million pixels per image. No incomplete GLB is published and the
monitored GL states are restored.

The fix under validation identifies the sprite of each renderer primitive
on large atlases and reads only its GPU region, in strips. UVs are
remapped to that image; the image matches the texture actually displayed,
including the current frame of an animated texture. The per-image, cumulative-pixel
and texture limits are unchanged. The lookup keeps at most 256 used sprites, walks at most one million
entries per lookup and shares a budget of 32 million examined entries
across all atlases in the capture; a primitive spanning several sprites
fails explicitly rather than using a wrong image. Non-finite UVs
are dropped. Tests cover the coordinate change, small sprites,
edges, spanning primitives and lookup budgets.

The first trial of the ATMons copy without its compatibility settings fails
before any capture, in the Mekanism Covers Sodium mixin. The original profile
sets `disableAdvancedCoverRendering=true`; the bench now reproduces that
setting, without removing any mod. This first failure therefore does not prove an
incompatibility of the configured profile.

The intermediate candidate `0590b85a…` succeeds at the manual export of the full pack
with the 8,192 × 8,192 atlas: 1,347,424 bytes, 17,104 triangles and 42 embedded
images. The nine monitored GL states are identical after capture. The copy
of a 16 × 16 stone sprite is compared with its 256 original pixels; it
preserves the GL states. The GLB and its metadata pass the API's real
validators. The Minecraft screen and the Blender render were inspected: mechanisms,
tanks, dyed sheep, glass, leaves and water are present. The MakeUp shader
is enabled; its lighting stays specific to the game.

The first read also ran into a GL error already pending (`1281`)
before any copy. The next candidate logs and consumes earlier
errors, with a bounded loop, then separately checks the errors of its
own read. The driver injects a prior error to check this case; it
does not work around the collector's read errors. The `7a01ab0c…` candidate
passes this injection before the sprite read and then before the manual export, with the nine monitored GL states restored.

The same JAR completes an AFK capture **before any manual export in this session**
in the mc breval copy, while paused, radius 12/full height. It contains
59,854 blocks, eight entities, 78,764 triangles and 98 embedded images for
6,081,860 bytes. The animated components and both fluids are present; the
positions/UVs are finite and the API validators accept the GLB and metadata.
The interval is `04:37:38.921451715Z`–`04:40:10.365172822Z`, on 15 October 2026.
The scope is disabled between the 813 steps and the Flywheel state stays identical
to what it was before capture (disabled by Iris). The 54 soft-budget overruns,
with a maximum of 35.57 ms, are kept in the measurements; the software bench's
total time is not a performance promise. The Blender render was
inspected. The next cycle is cancelled: history unchanged, last complete
file preserved and spool cleaned up. The manual export that follows also succeeds,
with 21,506 triangles and 42 images; its metadata and GLB pass the API.

The intermediate candidate `5388c08c3563ebc1e5c99c14f4d0d67d83a27ea6f676407b59dfc1edfad85831`
adds a safeguard: atlas descriptors count towards the texture budget
before they are built, even if the renderer emits no vertex. Unit
tests, Spotless, SpotBugs and `bun run build` pass (140 web tests, 235 API
tests run, 33 core and 154 NeoForge). The first ATMons trial with a shader runs out of Java heap (5 GiB) during
JEI/Ars Nouveau initialization, before the Minemories scenario. It is kept
as a bench failure, not as product validation. The new trial keeps
the 396 third-party JARs, with a 7 GiB heap and shaders disabled; the runs
with a shader on mc breval and on the targeted bench are kept separately.
Evidence: `full-breval/crop-clean/`, `full-breval/cold-afk/`, JAR files and
checksums kept with each run; `full-atmons/heap5g-attempt/`, `full-atmons/client-sync-attempt/` and
`full-atmons/atlas-no-shader-afk/` for what follows.

The next ATMons trial confirms synchronized speeds and fluids, then reproduces
the limit of the first index: more than 65,536 entries in the atlas. The next
candidate keeps a lazy view of the atlas and caches only the sprites
found for primitives. It no longer materializes a full index; the image/pixel
limits are identical and lookup work stays bounded. Tests
exercise an atlas of more than 80,000 entries without allocating a full index,
the cache for repeated lookups, the budget shared between atlases and the limit
on kept sprites. A race in the driver, which read client blocks before
the chunks were received after a teleport, was also fixed in the bench;
it is not presented as a Minemories defect.

## Final candidate and validated scope

The JAR `6b6c10b93c29e1daa3b45dd57b7690c5e12212e24355d43c9fce29cbad71c318`
passes `bun run build`, including the global checks and 156 NeoForge tests.
It is exercised in ATMons with its 396 third-party JARs and 434 loaded mod
identifiers, NeoForge 21.1.249, Sodium 0.8.13 and Iris present with shaders disabled.
The pack's Mekanism Covers setting is reproduced; the Java heap is 7 GiB and
the validation process is limited to 12 GiB, without swap. The atlas exposes 71,641
entries. The comparison of the GPU sprite's 256 pixels and the restoration of the
nine monitored GL states pass, including after injecting an earlier
GL error. Flywheel is active after the manual export.

The manual export contains 1,186,344 bytes, 15,172 triangles and 42 embedded images.
AFK while paused produces 5,298,968 bytes, 71,890 triangles and 94 images, with
59,917 blocks and five entities. The producer counts 836 steps (837 callbacks
observed by the driver), 19 soft-budget overruns and a maximum of
19.85 ms. The interval is `05:07:13.713390313Z`–`05:08:05.780712909Z`, on
15 October 2026. Scope disabled and Flywheel active between steps; second
cycle cancelled with history and last complete file preserved, spool cleaned up.
The mechanisms, fluids and Pikachu textures are present, and positions/UVs
are finite. The GLBs and metadata pass the API; Minecraft screens and the manual/AFK
Blender renders were inspected.

Checking the layers reveals one limit: both Pikachu textures,
including `pikachu_emissive.png`, are embedded, but the specific self-illumination of
this Cobblemon layer is not translated into glTF emission. The earlier
"bright pass" observations must not be read as a validation of this
effect. Arbitrary GPU effects, glint, text and other exclusions are still
tracked in [the capture limits](frozen-entities.md).

The same JAR passes the NeoForge 21.1.248 regression without Flywheel: chest, dyed
sheep, foliage, glass, water and Enderman. The driver forces a 16-byte read PBO
and non-standard packing settings (alignment 8, row length
23, offsets 3/2); the eleven compared GL states are restored. The
1,008-triangle GLB contains nine embedded images, with finite positions/UVs and
metadata accepted by the API. The Enderman's eyes do carry
`emissiveFactor=[0.65,0.65,0.65]` and their emission texture. The Minecraft
screens and the Blender render were inspected, with the dyed sheep and the glowing
eyes present. The first Blender check had revealed two sheep
exactly on top of each other in the fixture (duplicated triangles); the driver now
clears these entities before placement. The run was replayed with a single
sheep, without changing the product.

Final evidence: `full-atmons/atlas-no-shader-afk/` and `vanilla/atlas-final/`,
with the exact JAR, inventory, settings, GL results, geometry, special layers,
API validation and renders. These trials validate this scope; they do not guarantee
every modpack renderer and setting. CI still needed before merging.

## Flywheel 0.6 (Create 0.5.1), 13 November 2026

Create 0.5.1 bundles Flywheel 0.6 (`com.jozufozu.flywheel`), not Flywheel 1.0
(`dev.engine_room.flywheel`). The mixin above only knew the 1.0 API, so on the
targets that run Create 0.5.1 (Forge 1.18.2, Forge and Fabric 1.19.2 and 1.20.1)
the probe saw no Flywheel and the capture went ahead with the GPU path still on.
33 Create renderers start with `if (Backend.canUseInstancing(level)) return;`:
curved tracks, shafts, cogs, belts, presses, mixers, fans, deployers, arms,
gauges, funnels, steam engines, pulleys, bearings and train bogeys. With
Flywheel's default `INSTANCING` backend they drew nothing into the capture.

On Andy's Lalaland server (Fabric 1.20.1, Create 0.5.1, Steam 'n' Rails 1.6.9,
Flywheel 0.6.11), zone 3 (origin 1193 166 -549, radius 128) had only its
straight track pieces (`railways:track_oak` block models). Every curve was
missing, leaving the deepslate tile slab beds under them bare, and the
`block_entities` layer held 108 quads (track station, beacon, bellows).

Fix: `FlywheelLegacyCaptureMixin` (`@Pseudo`, `require = 0`) answers false from
`Backend.canUseInstancing` inside `CaptureRenderScope`, in the five adapters
that can meet Flywheel 0.6. `FlywheelCaptureBridge` now probes both generations
and fails the capture if either one still claims the level, instead of saving a
model with missing parts.

The same zone recaptured with the fixed Fabric 1.20.1 JAR from the same origin
and bounds: `block_entities` goes from 108 to 25,874 quads, with `create:track`
(the curves), `create:steam_engine` and `create:hose_pulley` added. Stills
rendered from the same camera before and after show the curves back on their
beds up to the tower.

Limits:
- Only Fabric 1.20.1 was exercised in game. Forge 1.18.2, 1.19.2 and 1.20.1 and
  Fabric 1.19.2 carry the same mixin against the same Flywheel 0.6 method, and
  build, but were not run with Create.
- A train's body (its contraption blocks) is drawn by Create in its own layer
  pass, not by the entity renderer, so it is still not captured; its bogeys
  should be. No train stood in the recaptured zone.
- A build cut by the capture box keeps only the part inside it. Zone 3's box
  stops at X 1321, so the castle at X 1311 to 1324 lost its back; that is the
  bounds, not this renderer.

## How a block quad gets its colour

`ClientRuntime.addQuad` is the single point where the colour of a block-model quad is resolved, on
every loader and Minecraft version, the way the chunk renderer does it:

1. the game's own `BlockColors` (26.x: the state's tint source) is asked for the quad's tint index
   with the real level and position, so Fabric `ColorProviderRegistry`, Forge/NeoForge
   `RegisterColorHandlersEvent` and biome blending are all consulted (they register into that same
   object);
2. that tint is multiplied by the colour the renderer applies on top: the colour the platform read
   from a Fabric mesh, otherwise the colour baked into the quad's vertices (`VertexColors.quadColor`).
   Vanilla's `putBulkData` multiplies the baked vertex colour into the tint, so a model that bakes its
   green into the vertices (NeoForge `face_data` colours, quads built in code) used to export grey;
3. the result becomes the material's `baseColorFactor` (`GlbColor`, linear) and the viewer multiplies it
   with the texture.

Not recoverable from the GLB's side: block entities, entities and items that the game draws through
`BlockRenderDispatcher.renderSingleBlock` use `BlockColors` with a null level, and a provider that
returns white there is white in game too. Not exercised in game for this change: modded foliage that
bakes vertex colours (only the unit test covers it).

Regression guard: `GlbReport` (every loader's in-game test) fails when the oak, spruce or birch leaves, the
grass block top or the short grass export with a white `baseColorFactor`. It prints its success line last, so the
headless harness, which stops on that line, can no longer hide a failed assertion. Before 07ede8e the colour
`FoliageColor.getEvergreenColor()` / `getBirchColor()` (an opaque, hence negative, ARGB int in 1.21.x) was
discarded as "no tint", which exported spruce and birch leaves white.
