# GLB size: measurements and optimization

Issue #73 shrinks files without changing the visible data: indices use the
smallest possible integer type, and the unused areas of atlas PNGs are made
uniform. The format remains self-contained glTF 2.0, with no new extension.

## Real corpus and before/after measurements

Five existing Minecraft captures are replayed in the two identified JARs. The
old writer reproduces each original file **byte for byte**: the benchmark
therefore receives the same quads, PNGs, materials and lights, without
confusing the optimization with a texture animation or an entity moving.
Upload fixtures artificially padded to 200 MiB are excluded.

| Capture | Before (bytes) | After (bytes) | Gain | Triangles | Images |
| --- | ---: | ---: | ---: | ---: | ---: |
| Progressive AFK radius 8 | 605,228 | 267,072 | 55.87% | 2,766 | 17 |
| Progressive AFK radius 32 | 2,501,392 | 2,012,360 | 19.55% | 27,220 | 26 |
| Tower and surface | 63,096 | 59,396 | 5.86% | 412 | 12 |
| Full height | 483,628 | 446,728 | 7.63% | 5,716 | 25 |
| Models, alpha and lights | 819,204 | 438,740 | 46.44% | 4,416 | 32 |

The last scene contains a bed, chests, a sign, a cat, a wolf, a sheep, a pig, a
player and an equipped zombie, glass, water, tinted vegetation and 144 lights.
The large export also contains a polar bear. OPAQUE, MASK and BLEND materials
as well as emissive properties are kept.

On the initial radius 32: positions and normals take 653,280 bytes each, UVs
435,520, indices 326,640 and PNGs 331,100 (excluding JSON/padding). On radius 8,
PNGs dominate with 327,378 bytes, 321,233 of them for the block atlas: only
18 × 18 cells, margin included, are needed for the held item. Its PNG drops to
2,245 bytes without changing its dimensions or the sampling coordinates.

## Exact index encoding

Both writers pick the smallest type compatible with the primitive's vertex
count: 8 bits up to 255 vertices, 16 bits up to 65,535, then 32 bits. Quads add
four vertices; the boundaries actually exercised are therefore 252/256 and
65,532/65,536.

The [glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#meshes)
forbids the maximum value of the index type, which is reserved for primitive
restart. The vertex count, an exclusive upper bound on indices, therefore
prevents emitting 255/65,535 in the matching types. Corrupt values are refused,
with no silent truncation. Triangle order and count stay identical.

The spooled writer keeps temporary 32-bit indices and only compacts them during
the final copy, in the existing 64 KiB buffer. The temporary spool can therefore
be larger than the published GLB.

## Atlas PNGs: preserve samples, without moving UVs

For `rendered/...textures/atlas/...` images, the writer aggregates the UVs of
**all** materials referencing the same image. It keeps the rectangle of texels
that may be sampled plus a one-pixel margin. Other texels are replaced with a
uniform colour, which compresses better. Dimensions, NEAREST samplers without
mipmaps, UVs, positions, normals, alpha/tint factors and emissive links are
unchanged. Entity textures and ordinary sprites are not treated as atlases.

Repeated, negative, non-finite UVs, or UVs reaching the upper bound, cause a
fallback to the original PNG. Uses covering at least half of the image are left
intact. Decoding is limited to one PNG of 16 MiB / 4 million pixels at a time;
an unreadable or larger re-encode keeps the original. Processing checks for
capture interruption. It adds no texture or material and does not reduce the
image's GPU cost, since its dimensions are kept.

In the spool, this step happens after the append streams are closed and before
the final layout is computed; it only touches the owned temporary file, after
checking its identity and size. Atomic publication still applies. Spool,
capture and upload limits are not raised.

## Exact vertex merging (issue #173, phase 1)

Both writers share `VertexCache` and `QuadGeometry`: a vertex is written only once per primitive when its
position, normal and UV are **bit-for-bit identical**; the indices of following quads reuse it. The table is
direct-mapped with 65,536 entries (≈ 2.6 MiB of integers, constant size whatever the capture): a collision
evicts the old entry, which only misses a merge and never changes the render. The spooled writer therefore keeps
its heap bound (32 MiB test unchanged); temporary files only contain unique vertices.
Neighbouring edges are mostly shared between quads close in time (median 35 quads, 90th percentile 66 on
radius 32), which makes a bounded window almost as effective as a global merge.

A quad where neither of its two triangles has any area (`0,1,2` then `0,2,3`) is dropped instead of being written with
a zero normal; the normal of a "triangle" quad (repeated corner) comes from the first non-degenerate triangle. A
triangle whose two indices become equal after merging is not emitted. Intentional overlays (`RenderedLayer`) are
separated by a position offset: they are neither merged nor dropped.

Measurements on the five replayed reference captures (same quads, PNGs and materials, `Replay` outside Git):

| Capture | Before (bytes) | After (bytes) | Vertices | Remaining exact duplicates |
| --- | ---: | ---: | ---: | ---: |
| Progressive AFK radius 32 | 2,012,360 | 1,835,420 (−8.8%) | 54,440 → 48,911 | 5,536 → 7 |
| Progressive AFK radius 8 | 267,072 | 255,300 (−4.4%) | 5,532 → 5,165 | 368 → 1 |
| Full height | 446,728 | 393,540 (−11.9%) | 11,432 → 9,770 | 1,669 → 7 |
| Tower and surface | 59,396 | 58,788 (−1.0%) | 824 → 805 | 19 → 0 |
| Models, alpha and lights | 438,740 | 432,084 (−1.5%) | 8,832 → 8,624 | 209 → 1 |

Blender 5.2.2 render (Cycles CPU, 16 samples, seed 42, 560 × 480) before/after on radius 32 and the
models/lights scene: **pixel-for-pixel identical** (maximum difference 0). The gain stays modest, as predicted by
phase 0: the real reduction comes from quantization (phase 3). The measurements are those of the writer replayed
outside the game; in-game validation of progressive captures is still to be done with the next JAR.

## Format 2: categories, metadata and per-chunk ranges (issue #173, phase 2)

The glTF stays self-contained with no new extension; only the structure and `extras` change.

- **Nodes named by category**: `terrain` (full cubes), `decor` (non-full block models: plants, snow,
  carpets, slabs), `fluids`, `block_entities` (chests, beds, signs…), `entities`, plus one node per point
  light. Each node carries a mesh with the same name; only the categories present are written. One primitive per
  (category, material): the number of draw calls stays as before, give or take one primitive per shared category
  and material. No node per entity: `MAX_GLB_NODES`/`MAX_GLB_PRIMITIVES` are 4096 and an entity farm would exceed
  them. In Blender, each category becomes an object that can be deleted or hidden.
- **`asset.extras.minemories`**: `format: 2` (3 since issue #278, see below), Minecraft / loader / mod versions, dimension identifier, `chunkSize`
  and the number of quads per category. Closed, validated fields (`GlbMetadata`): no personal data, no world,
  server or player name, no seed, no path, no sign or book text, and **no absolute coordinate**. The bounds and
  capture origin stay in the metadata file already sent to the API.
  `scenes[0].extras.minemoriesPlayerPosition` is kept.
- **Per-chunk ranges**: each primitive may carry `extras.minemoriesChunks = [x, z, firstTriangle, count, …]`,
  `x`/`z` being relative to the chunk containing the capture origin. The capture traversal is now **chunk by
  chunk** (`CaptureCursor` and manual export); the owner is the source cell (entity: its chunk). A primitive with
  no known chunk, or that would exceed the budget of 40,000 ranges per scene, publishes none: the JSON stays bounded
  (4 MiB limit) and a reader falls back to its own sort.
- Old GLBs (a single mesh, no `extras`) are still read by the viewer and both validators: the viewer does not
  depend on these fields. **The viewer does not use the ranges, based on measurement**: its composition needs the
  block of each triangle (partial coverage of a chunk), computed from the positions. On 98,000 triangles in
  chunk-by-chunk order, `buildPrimitive` takes 22.2 ms, of which **1.9 ms is the sort** (less than 9%): the ranges
  would only save that sort. They remain available for third-party tools.

Measurements on the five captures replayed with categories (heuristic on material names, outside the game, ranges in
the original order and therefore more numerous than with the chunk-major traversal): radius 32 1,835,420 → 1,859,984
bytes (+1.3%, of which ≈ 24 KiB is JSON), full height 393,540 → 396,848. The cost is the JSON; the real reduction
comes from phase 3.

Validation: the five GLBs pass both the viewer and the API validators (5/5). Blender 5.2.2 imports one object per
category (e.g. `terrain` 1,400 faces, `decor` 1,748, `fluids` 336, `block_entities` 132, `entities` 800); the Cycles
render is pixel-for-pixel identical on radius 32, with 49 differing pixels (6 with a difference > 8, max difference 18
out of 268,800) on the models/lights scene, attributed to the render order of translucent materials across objects.
The viewer loads the file (headless Chromium, SwiftShader) and shows the complete scene. In-game validation: not done.

## Format 3: linear colours (issue #278)

glTF 2.0 reads `baseColorFactor`, `emissiveFactor` and `KHR_lights_punctual` colours as **linear** values. Up to
format 2 both writers stored the 8-bit sRGB tint as is, so every biome or block tint rendered too light in the
viewer and in Blender (terracotta, grass, foliage, water came out washed out). Format 3 converts each channel with the
IEC 61966-2-1 curve (`GlbColor`, shared by `GlbScene` and `SpoolingGlbScene`, which stay byte-equivalent): the
grass tint `0xA4C954` is written `[0.371, 0.584, 0.089]`, white stays `1`, and the opacity (fourth
`baseColorFactor` value) is unchanged. The textures were already sRGB images and do not change.

Readers tell the two apart by `asset.extras.minemories.format`:

- The viewer (`apps/web/src/lib/glb-colours.ts`, applied in `viewer-scene.ts`) converts base colour, emissive colour
  and imported light colours of files **without format 3** (format 1–2, or no Minemories metadata) once per
  material, so an old capture and a new one of the same place look the same.
- The landing film (`hero/scene.js`, `prepareCapture`) keeps its look on both: it converts legacy factors as before
  and only patches the old white fixed tints (spruce, birch, lily pad) on legacy files; a format-3 factor is brought
  back to sRGB first so the cobweb dimming and the collar colour stay identical. The shipped hero captures were
  re-baked by glTF-Transform and carry no Minemories format, so they count as legacy; a future re-bake must keep
  `asset.extras` or a format-3 capture would be converted twice.
- The API validators and the meshopt expansion do not read the format; the expansion keeps `asset` as is.

The same change fixes opaque ARGB fixed tints (1.21.x `BlockColors` returns `0xFF619961` for spruce leaves, birch
and the placed lily pad): the client used to replace any negative tint by white; `VertexColors.blockTint` now keeps
the RGB, and `-1` (no tint) is still white.

## `KHR_mesh_quantization` quantization (issue #173, phase 3)

Both writers quantize the geometry; the file remains self-contained glTF 2.0, readable by Blender 5.2.2 (measured,
see `docs/features/glb-v2-decisions.md`); `extensionsUsed`/`extensionsRequired` declare `KHR_mesh_quantization`.

| Attribute | Before | After |
| --- | --- | --- |
| POSITION | 3 × float32 (12 B) | 3 × int16 + 2 B of padding (8 B), `1/2^k` scale and integer translation carried by the category node |
| NORMAL | 3 × float32 (12 B) | 3 × normalized int8 + 1 B (4 B) |
| TEXCOORD_0 | 2 × float32 (8 B) | 2 × normalized uint16 (4 B) |

- Attributes are written with `byteStride` (8/4/4), which glTF requires for elements that are not multiples of 4 bytes.
- **Scale**: chosen at write time, per category, from the actual extent of the positions: the finest of the
  `1/128`…`1/16` block grids whose extent fits in ±32,766. Minecraft's grid (1/16) is therefore **exact**; rotated
  models and fluids are rounded to at most 1/256 of a block on small captures and 1/32 on very large ones, as close
  as possible to the viewer's 1/64-block threshold. A category spanning more than ±1,024 blocks keeps float32
  positions.
- **UV**: uint16 only if all UVs of a primitive are within [0, 1]; otherwise float32 (repeated UVs). Maximum error
  1/65,535 of the image, i.e. 0.016 texel on the 1024 atlas.
- **Normals**: kept (int8) rather than removed: without normals, `GLTFLoader` enables `flatShading`, which the
  viewer avoids (NaN reported on Firefox/NVIDIA, see `viewer-scene.ts`), and recomputing normals after merging
  would smooth the edges.
- In the spooled writer, the temporary spool stays in float32; conversion happens during the final copy, in a
  64 KiB buffer (plus an output buffer of the same size): the heap bound and the spool/file limits do not change.
  Both writers still produce byte-for-byte identical files.
- In Blender, each imported category carries a **scale of 0.0078** (1/128, or more on large captures): apply the
  scale (*Object → Apply → Scale*) before modelling. Light positions stay in float32.
- The `@minemories/api-contract/glb` validator already accepted these types (quantization, `byteStride`); the viewer
  reads positions through the node matrix (`localPositions`), so nothing changes there.

Measurements (replayed writer, outside the game; "before" = end of phase 2):

| Capture | Before (bytes) | After (bytes) | Gain | gzip before → after |
| --- | ---: | ---: | ---: | ---: |
| AFK radius 32 | 1,859,984 | 1,085,060 | −41.7% | 280,279 → 259,366 |
| AFK radius 8 | 260,368 | 182,588 | −29.9% | 38,927 → 34,435 |
| Full height | 396,848 | 243,820 | −38.6% | 60,637 → 58,676 |
| Tower and surface | 60,616 | 49,884 | −17.7% | 9,762 → 9,468 |
| Models, alpha and lights | 438,832 | 306,856 | −30.1% | 71,932 → 62,322 |
| Real capture (modpack) | 20,299,828 (original) | 10,651,588 | −47.5% | 2,599,432 → 2,408,324 |

The gain after transfer compression is small (gzip −7%, brotli on the real capture 1,492,397 → 1,578,659,
slightly worse) because quantized integers compress less well than highly repetitive floats: the transfer
reduction will come from the Meshopt derivative (phase 4). Quantization mainly reduces load-time memory and
uncompressed storage.

Validation: the six files pass both the viewer and the API validators; Blender 5.2.2 imports them, Cycles render
(560 × 480, 16 samples, seed 42): mean difference 0.85/255 on the models/lights scene and 0.35/255 on radius 32
(0.24/255 on average per 8 × 8 pixel block), up to 18/255 on average per 8 × 8 block on plants. It is no longer
pixel for pixel; the cause has not been isolated between int8 normals, 16-bit UVs and rotated model positions. The
viewer (headless Chromium, SwiftShader) shows the scene with no visible difference. In-game validation: not done.

## Atlas repack (issue #173, phase 3 continued)

Preliminary measurement: on the corpus and the real capture, **0 duplicate images** (83 unique images) and every PNG
has fewer than 256 colours for 3 to 76 KiB in total: **image deduplication** and **indexed PNG** would bring nothing
useful and are not implemented. The cost is VRAM: the 1,024 × 512 block atlas (2 MiB in 8-bit RGBA) only uses 2 to
27 of its 2,048 16 × 16 cells (221 on the modded capture, 11%).

`AtlasRepack` therefore rebuilds, for each `rendered/…/textures/atlas/…` atlas whose UVs are all within [0, 1[ and
non-repeating, an image containing only the texels the primitives can sample (each primitive's UV rectangle, a
one-texel margin as in #73, overlapping rectangles merged, shelf packing, most compact power-of-two width). Each
primitive gets an affine transform `u' = u × (W/W') + offset` applied at write time, with the 16-bit UVs of phase 3.
NEAREST samplers without mipmaps make the remapping exact up to texel edges. The repack is only kept if the
resulting image has at most half the texels; otherwise the #73 masking still applies. In the spooled writer the spool
keeps the original UVs: the transform is applied during the final copy, with no extra memory; both writers stay
byte-for-byte identical.

| Capture | VRAM before (8-bit RGBA) | VRAM after | Bytes before → after |
| --- | ---: | ---: | ---: |
| AFK radius 32 | 2,177,024 | 81,168 (−96%) | 1,085,060 → 1,082,984 |
| AFK radius 8 | 2,136,064 | 40,208 (−98%) | 182,588 → 180,516 |
| Models, alpha and lights | 3,244,032 | 150,436 (−95%) | 306,856 → 302,216 |
| Real capture (modpack) | 2,246,656 | 205,472 (−91%) | 10,651,588 → 10,614,852 |

Blender 5.2.2 render (Cycles, 560 × 480, seed 42): pixel-for-pixel identical to the quantized version on radius 32
(difference 0) and under 0.0001/255 on average on the models/lights scene (7/255 at most, a few pixels). The six
files pass the viewer and API validators; the viewer (headless Chromium, SwiftShader) shows the scene with no
visible difference. In-game validation: not done (entity, bed, chest and sign atlases are handled the same way; to
be checked with the next JAR on modded textures).

## Preparation cost

Local measurements on a Ryzen 5 3600, Btrfs, Temurin 21.0.12.1+1, 512 MiB heap:
median of five exports after three warm-ups, in separate JVMs per version. The
time includes ingestion into the spooled writer and publication, but not the
game capture or the initial PNG encoding of GPU pixels.

| Capture | Before (ms) | After (ms) |
| --- | ---: | ---: |
| Radius 8 | 44.89 | 78.03 |
| Radius 32 | 152.98 | 184.33 |
| Tower and surface | 15.49 | 16.48 |
| Full height | 49.73 | 47.52 |
| Models/lights | 61.97 | 112.29 |

Re-encoding the atlases costs about 30–50 ms extra here, mainly in exchange for a
smaller file. In AFK it stays on the worker. The approach exactly preserves the
attributes and pixels used; greedy meshing/LOD and compressions requiring an
extension are not introduced by this version. These measurements do not claim to
establish a theoretical minimum for every modpack.

## Validations

- Core tests: type boundaries, reserved/corrupt indices, agreement between the
  two writers, UV aggregation, margin, translucent/cutout RGBA, invalid files,
  fallback without growth and interruption. JaCoCo/SpotBugs pass without
  changing the thresholds.
- The five independent comparisons check binary-identical POSITION/NORMAL/UV
  attributes, identical decoded indices, identical materials/nodes/lights, image
  dimensions and every RGBA value of the protected rectangles.
- The ten replayed GLBs and four new native exports pass both the shared viewer
  validator and the bounded-file API validator: 14/14.
- Blender 5.2.2 imports and renders the five pairs, camera/lights unchanged,
  560 × 480, Cycles CPU, 16 samples, seed 42: the five RGB renders are
  pixel-for-pixel identical (maximum channel difference: 0). The scene with
  models/lights is also inspected visually.

The native trial of 15 October 2026 uses Minecraft 1.21.1 / NeoForge 21.1.248,
Mesa llvmpipe OpenGL 4.6 and the 0.1.1-dev.1 JAR loaded from `mods/`, embedded
core included. It exercises manual/progressive exports at radius 8/32 while
paused, PACK/PBO, activity/resume, disabling, resource reload, chunk removal,
dimension change and disconnect: no false commit and the worker is cleaned up.
AFK captures take 1.53 s / 14.80 s over 43 / 469 frames here; the maximum
capture steps are 2.33 / 2.02 ms (2 / 1 overruns of the 2 ms cooperative
budget). Total frame time also includes software rendering, FPS limiting and GC.

JAR hashes:

- Before: `34d6bf346cfe97d869325df9282295f9a67598a7a749705e20e4ec715646068f`.
- After, also tested in game:
  `be45cff30a5aad0201a4f75a272e8aae9566caf05a9ab3a655d68dc7f774d8d2`.

Artifacts outside Git: `~/.local/state/minemories-validation/glb-size-20261015/`
(corpus/hashes, Java replay, measurements, independent check, validators,
before/after renders and comparison, native driver/logs/scenarios). `bun check`
and `bun run build` pass; full CI is still required before merging.

## Overall results of issue #173 (outside the game)

"Before": the #73 GLB (compact indices + masked atlases); "after": exact merging, categories, quantization and atlas
repack; "transfer": gzip level 4 of the Meshopt variant served to the viewer (see `glb-derivative.md`). The real capture
is a personal capture (modpack), measured read-only, not published.

| Capture | Raw before → after | gzip before → variant transfer | Texture VRAM before → after |
| --- | ---: | ---: | ---: |
| AFK radius 32 | 2,012,360 → 1,082,984 (−46%) | 278,144 → 94,826 (−66%) | 2,177,024 → 81,168 (−96%) |
| AFK radius 8 | 267,072 → 180,516 (−32%) | 36,890 → 27,237 (−26%) | 2,136,064 → 40,208 (−98%) |
| Full height | 446,728 → 243,820 (−45%) | 62,375 → 28,944 (−54%) | 25,600 → 25,600 |
| Tower and surface | 59,396 → 49,884 (−16%) | 9,209 → 9,468 (variant not applicable) | 12,288 → 12,288 |
| Models, alpha and lights | 438,740 → 302,216 (−31%) | 69,446 → 50,923 (−27%) | 3,244,032 → 150,436 (−95%) |
| Real capture (modpack) | 20,299,828 → 10,614,852 (−48%) | 2,599,432 → 743,867 (−71%) | 2,246,656 → 205,472 (−91%) |

The local file stays readable by Blender 5.2.2 (a scale of 0.0078 per category to apply, renders with a mean difference
< 1/255 from quantization); categories make it possible to delete plants, fluids or entities. Limits: everything is
measured outside the game, without a real GPU; the viewer's full load time is not measured; the world view does not
use the variant yet; the viewer does not use the per-chunk ranges.

## In-game validation of the #174–#180 stack JAR (2 November 2026)

Native trial on an isolated profile (the #73 method): Minecraft 1.21.1 / NeoForge 21.1.248, Mesa llvmpipe software
rendering, JAR `minemories-0.30.2-beta.1.jar` (SHA-256 `75435739a2cfdeb9bea5fcf1c0d3a6ab7ea6a38509eeb07303271a816d5e8dae`)
loaded from `mods/` with its embedded core, a separate QA driver outside the distributed JAR (`ChunkValidation`), no
CurseForge profile touched, no real credentials, no pairing. Artifacts outside Git:
`~/.local/state/minemories-validation/glb-v2-20261102/native/` (driver, `run.init.gradle`, logs, GLBs, `*.insights`).

Scenario: plank house (chest, furnace, bed, sign, lantern, glass), plants, water, leaves and four frozen mobs,
placed around the player on the ground; manual export at radius 16 while paused, progressive AFK capture, two blocks
changed then a second AFK capture, AFK disabled for 600 frames.

| Check | Result |
| --- | --- |
| Manual export and two AFK captures | pass, GLB format 2, MC/loader/mod versions and dimension in `extras`, `KHR_mesh_quantization` + lights |
| Viewer and API validators | 3/3 |
| Classification | `terrain`: planks, furnace, stone, dirt; `decor`: glass, lantern, leaves, flowers, grass, snow, door; `fluids`: water (manual); `block_entities`: chest, bed, sign; `entities`: player, cat, wolf, sheep, zombie, polar bear, item |
| Chunks per primitive | `minemoriesChunks` ranges present on 105/105 primitives; entities attached to their chunk (a primitive can cover several) |
| Blender 5.2.2 | import succeeded (5 objects: terrain, decor, fluids, block_entities, entities), house and terrain recognizable |
| Viewer (headless Chromium) | shows the AFK capture; "Plants and decor" and "Creatures" toggles work |
| Chunk fingerprints | 1st capture: `new=9`; next AFK (different range from the manual export): `changed=6, new=3`; 2nd AFK after changing two blocks: **`changed=2`, `new=0` out of 9 chunks** |
| `*.insights` | written, 12 absolute chunks, house chunk: 19% built blocks, 2 block entities, 1 light |
| AFK disabled | no capture started in 600 frames, history unchanged |
| Network | no upload or attempt before pairing (log) |

Trial limits: a first launch placed the mock-up high in the air (player falling) and revealed a driver bug
(re-entrant `disconnect`), not a product bug; the second launch is valid. Leaving the world could not be exercised:
software rendering of the blurred background blocked the render thread after the captures, and the process was
stopped (the files were already written). Modded atlases (vanilla beds, chests and signs only), a modpack and a real
GPU were not exercised.

### Blender render difference after quantization: cause isolated

Cycles renders (16 samples, seed 42) of the models/lights scene, mean difference out of 255 compared with the original:

| Variant | Mean difference |
| --- | ---: |
| 16-bit UVs only | 0.0001 |
| int8 normals only | 0.035 |
| Positions shifted by 10⁻⁶ block (noise floor) | 0.34 |
| Positions rounded to 1/4096 | 0.70 |
| Positions rounded to 1/128 (quantization scale) | 0.83 |
| Positions rounded to 1/16 | 1.07 |
| Full quantization | 0.85 |

The difference is dominated by **Monte Carlo noise**: a 10⁻⁶ block perturbation already changes the ray paths at
16 samples (0.34/255). Normals and UVs are below this floor; rounding positions only adds ≈ 0.5/255 on off-grid
geometry (plants at 45°, rotated models). There is nothing to fix.

The phase 5 behaviours (adaptive radius, skipping the upload of an identical capture, `InhabitedTime`) are validated
in game with the same kind of trial: see `docs/features/chunk-score.md`.
