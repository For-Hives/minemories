# AFK capture measurements

The progressive coordinator is described in [the GLB pipeline](spooling-glb.md).
The local `AFK capture phase timings (ns)` logs now separate columns/depth,
blocks/models, entities, CPU/GPU pixel reads, client transfer, texture
preparation, geometry/spool and GLB/history publishing. The renderer's texture
preparation (loading/binding) is still attributed to models. Client and worker
phases overlap; their sum is not the total duration. The maximum step time and
its overruns are still recorded.

## Corpus and hardware

Measurements from 15 October 2026: isolated copy of the Minecraft 1.21.1 test
world, NeoForge 21.1.248, JDK Temurin 21.0.12.1+1, AMD Ryzen 5 3600 (6 cores/12
threads), Linux CachyOS, Btrfs, Mesa 26.2.4 llvmpipe OpenGL 4.6 software
renderer and Minecraft resources. The mod and its core are loaded from the same
`0.1.1-dev.1` distribution JAR, SHA-256
`34d6bf346cfe97d869325df9282295f9a67598a7a749705e20e4ec715646068f`.

After the manual export, the same area is captured in AFK while paused. Radius 8
contains 755 blocks, 2 entities, 1,383 quads and 17 textures; radius 32 contains
14,107 blocks, 5 entities, 13,610 quads and 26 textures. Test profiles use a
1-minute idle/interval; product defaults remain 5 minutes / 4 hours.

| Measurement | Radius 8 | Radius 32 |
| --- | ---: | ---: |
| Synchronous manual export | 131.18 ms | 144.41 ms |
| Total observed AFK capture | 1.62 s | 14.90 s |
| Frames spanned | 42 | 471 |
| Maximum producer step | 4.74 ms | 2.03 ms |
| 2 ms budget overruns | 5 | 2 |
| Maximum full frame, rendering included | 86.62 ms | 89.84 ms |

| Phase, cumulative time | Radius 8 | Radius 32 |
| --- | ---: | ---: |
| Columns/depth | 0.64 ms | 1.24 ms |
| Blocks/models | 15.06 ms | 42.63 ms |
| Entities/models | 2.61 ms | 1.65 ms |
| CPU/GPU pixels | 6.53 ms | 2.61 ms |
| Client transfer excluding pixel reads | 7.54 ms | 7.89 ms |
| Strips/PNG/texture writing, worker | 86.46 ms | 58.41 ms |
| Geometry/spool, worker | 140.12 ms | 605.03 ms |
| GLB/history publishing, worker | 25.51 ms | 40.37 ms |

A renderer operation or GPU read is still indivisible. The producer step
excludes the initial metadata collection and context checks; the full frame
includes software rendering, the game and instrumentation. Spreading the work
reduces the load concentrated on the client but increases the total duration.
These results give no FPS ceiling and prove nothing about performance on other
GPUs/modpacks. The active world/unfocused matrix, the other scenes, upload tests
against a real API and their network costs are documented in
[the pipeline validation](spooling-glb.md#integration-validation); uploads
still use 512 KiB/s in 16 KiB HTTP chunks.

## Checks on the measured JAR

The isolated profile exercises pause, activity then resume, disabling, a real
reload, an unloaded chunk, an Overworld → Nether switch and disconnection. The
history stays intact and no partial commit or spool remains. The renderer source
is read with abnormal PACK/PBO state, and its restoration is checked after the
measurements. Both GLBs pass the shared API validator and are imported/rendered
in Blender 5.2.2. Glyphs and special renderers keep the limits of the
[entity contract](frozen-entities.md).

The artifacts/programs from this run are kept locally in
`~/.local/state/minemories-validation/afk-main-metrics-20261015/` (fingerprint,
events, JSON measurements, logs, GLBs and render). No personal profile or
original world was modified.

## Icon preparation

Before the production steps, the metadata attaches the world/server icon.
Reading the file is limited to 128 KiB and rejects symbolic links. Encoding
checks the PNG header and positive dimensions ≤512×512 before Base64. A rejected
icon is treated as absent and does not invalidate the GLB. Tests cover a normal
Minecraft icon, oversized file/dimensions, arbitrary data and a symlink. This
preparation no longer reads an entire file of unbounded size.
