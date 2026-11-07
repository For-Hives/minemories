# GLB v2: phase 0 measurements and decisions (issue #173)

This document comes before any format change. It records the measurements taken on 2 November 2026 on the
#73 corpus (`docs/features/glb-size.md`) and on a real 20 MiB capture, then the choices that follow from them.
Nothing here is validated in game: the measurements cover GLBs already produced by the real writer.

## Measurement tool

`python3 scripts/glb-report.py [--json] file.glb …` (standard library, system `brotli` optional): bytes per
category (positions, normals, UVs, indices, PNG, JSON), quads, duplicated vertices (exact / by position only),
gzip 6 and brotli 9, texture VRAM as 8-bit RGBA without mipmaps. Variants were produced with `gltfpack 1.3` and
`@gltf-transform` + `draco3dgltf` (outside Git, in `~/.local/state/minemories-validation/glb-v2-20261102/`).

## Starting point

| Capture | Bytes | Quads | Vertices | Exact duplicates | Duplicates by position | gzip | brotli | Texture VRAM |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| AFK radius 32 | 2,012,360 | 13,610 | 54,440 | 5,536 (10.2%) | 32,866 | 278,144 | 121,233 | 2.08 MiB |
| AFK radius 8 | 267,072 | 1,383 | 5,532 | 368 (6.7%) | 3,091 | 36,890 | 27,293 | 2.04 MiB |
| Full height | 446,728 | 2,858 | 11,432 | 1,669 (14.6%) | 7,877 | 62,375 | 39,390 | 25 KiB |
| Tower and surface | 59,396 | 206 | 824 | 19 (2.3%) | 422 | 9,209 | 8,039 | 12 KiB |
| Models, alpha, lights | 438,740 | 2,208 | 8,832 | 209 (2.4%) | 5,209 | 69,446 | 53,910 | 3.09 MiB |
| Real capture (modpack) | 20,299,828 | 134,951 | 539,804 | 72,714 (13.5%) | 361,272 | 2,599,432 | 1,492,397 | 2.14 MiB |

Findings:

- Geometry is 82–86% of the bytes once a capture exceeds a few thousand quads (radius 32: positions and
  normals 653,280 bytes each, UVs 435,520, indices 156,846 after #73, PNG 11,861). On the real capture:
  positions 6.5 MiB, normals 6.5 MiB, UVs 4.3 MiB, indices 2.7 MiB, PNG 76 KiB, JSON 293 KiB.
- On small captures, the JSON (materials, accessors) weighs almost as much as the geometry (28 KiB out of 59 KiB).
- **Exact** vertex welding (position + normal + UV) removes 2 to 15% of vertices: real but modest, as the issue
  predicted. Welding by position only would remove 60% of vertices, but it would merge vertices with different
  normals/UVs and change the rendering: rejected. Blender already welds exact duplicates on import (54,440 →
  48,904 vertices on radius 32), which explains the "overlapping vertices" seen with *Merge by distance*: they are
  mostly vertices from different faces.
- Textures are not a VRAM concern: 2–3 MiB across the whole corpus, including the 20 MiB modded capture.

## Variants tested offline (radius 32, raw bytes / gzip / brotli)

| Variant | Raw | gzip | brotli |
| --- | ---: | ---: | ---: |
| Current (#73) | 2,012,360 | 278,144 | 121,233 |
| gltfpack: quantization only (`KHR_mesh_quantization`, 14-bit positions, 12-bit UVs, 8-bit normals) | 1,049,264 | 187,372 | 148,589 |
| gltfpack + Meshopt (`-c`) | 386,948 | 100,953 | 95,328 |
| gltfpack + Meshopt (`-cc`) | 380,668 | 99,231 | 94,019 |
| glTF Transform: weld + Draco | 178,484 | 67,466 | 61,918 |

Same trend on the other captures (models: 438,740 → 289,856 → 185,608 → 151,144 with Draco; full height:
446,728 → 235,916 → 101,860 → 57,732).

Decoding (Node/Bun, parsing included, median): Meshopt 8.6 ms on radius 32, Draco 40.3 ms (5×); on the "models"
capture, 5.1 ms versus 8.5 ms. Evolving captures in the viewer are loaded by the dozen: decoding cost adds up (see
the tiles post-mortem, point 2).

## Blender 5.2.2 (Arch package `/usr/bin/blender`)

| Variant | Import |
| --- | --- |
| Original (float32) | OK, 1 object, 54,440 vertices |
| `KHR_mesh_quantization` | **OK**, same 27,220 faces, Cycles render 560 × 480, 16 samples, seed 42 visually identical (channel differences limited to edges, caused by gltfpack's 12-bit UV / 8-bit normal quantization) |
| `EXT_meshopt_compression` | **FAILED**: "Meshopt decoder library not found … libbf_intern_meshopt_bridge.so" (native library missing from this package) |

Consequence: a compression extension cannot go into the local `capture.glb`, which must open in Blender (lesson
from the post-mortem, point 5). Meshopt support in other Blender builds is not established here; a web search
found no primary source. Only the local measurement counts.

## Decisions

1. **Two tiers**, as proposed in the issue: the local/uploaded file stays self-contained glTF 2.0, with at most
   `KHR_mesh_quantization` (imported by Blender, already accepted by `validateSelfContainedGlb`); Meshopt
   compression is reserved for a **delivery derivative produced by the API**, with the original still downloadable.
2. **Meshopt, not Draco** for the derivative: 4 to 5× faster to decode, already provided by three.js
   (`MeshoptDecoder`; `meshoptimizer` is already installed as a transitive dependency), and it preserves triangle
   order, hence per-chunk triangle ranges (Draco reorders). Draco is smaller (gzip 67 KiB versus 99 KiB), but that
   gain justifies neither the extra decoder nor losing the ranges; to be revisited if storage becomes the dominant
   factor.
3. **KTX2/BasisU dropped for now**: measured VRAM is 2–3 MiB per capture; the risk of blurring pixel art is not
   justified. The gain will be reassessed if a capture exceeds several tens of MiB of textures.
4. **Metadata in glTF `extras`** (free-form JSON imported by Blender as custom properties), not
   `EXT_structural_metadata`/`EXT_mesh_features`: Blender does not import these extensions and they make the file
   heavier with no benefit for the viewer.
5. **No KHR_texture_basisu, no greedy meshing, no LOD, no tiles** at this stage (conditional phase 6).

The detailed format points (quantization scale, normals, nodes per category, chunk ranges) are set in
`docs/features/glb-size.md` as each phase implements them.

## Next (phase 4)

The Meshopt variant is implemented as an **on-demand transport variant**, with no durable storage: see
`docs/features/glb-derivative.md` (storage, quota, lifetime, measurements, limits).
