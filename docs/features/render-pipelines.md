# Render pipelines a capture has to reach

A capture only contains what one of its passes can reach. Mods draw things in several ways, and each
way needs its own pass; a mod that draws in a way no pass covers is missing from the memory however
visible it is in game. This page maps the ways mods draw, the pass that reaches each, and how to add
a new one.

| How the game or a mod draws it | Examples | Pass | Status |
| --- | --- | --- | --- |
| Baked block models in the chunk mesh | terrain, most modded blocks | terrain walk (`captureCell`) | captured |
| A renderer per block entity or entity, on the CPU | chests, beds, mobs, Create parts | rendered collector (`RenderedModelCapture`) | captured |
| The same renderers moved to the GPU by an instancing backend | Flywheel 1.0 (Create 6), Flywheel 0.6 (Create 0.5.1) | `CaptureRenderScope` + Flywheel mixins force the CPU path while one model is collected | captured, see [modpack renderer validation](modpack-renderer-validation.md) |
| **Blocks stored away from where they are drawn** | Sable sub-levels: Create Aeronautics planes and balloons, Simulated physics assemblies, Offroad cars | detached volumes (`CaptureVolume`) | captured for Sable, below |
| Blocks drawn by a level-render pass instead of the entity renderer | Create 0.5.1 contraption bodies (bearings, trains, minecart contraptions on Minecraft 1.18.2 to 1.20.1) | none yet | missing |
| Pure GPU effects | shaders, glint, particles | none | out of scope ([capture limits](frozen-entities.md)) |

## Detached volumes (Sable sub-levels)

Sable (the physics library of Create Aeronautics, Create Simulated and Offroad) turns a built
structure into a *sub-level*: its blocks are moved into a "plot" of the same level, around twenty
million blocks from the origin (plot grid origin 10,000 plots of 128 chunks), and every frame Sable
draws that plot at the sub-level's pose (position, rotation about a pivot, scale). Entities stored in
the plot (a Create contraption mounted on the plane, a seat, an armor stand) are drawn the same way.

Before this pass the capture walked only the selected box: the plot was never visited, so planes,
balloons and cars disappeared, with everything built on them. Create contraptions on the ground were
not affected on Minecraft 1.21.1: their entity renderer draws the structure on the CPU path, and
`create:stationary_contraption` (the bearing, piston and pulley entity) is in the ATMons bench
captures of 15 October 2026.

How it works:

1. `CaptureVolume.around(level, box)` asks every registered `CaptureVolume.Source` for the volumes
   drawn inside the capture box. `SableVolumes` uses Sable's public companion API
   (`SableCompanion.INSTANCE.getAllIntersecting`) by reflection, so no Sable class is linked when
   Sable is absent; the plot box comes from the sub-level's plot when it exposes one, otherwise from
   its drawn bounding box mapped back into the plot.
2. `VolumeCapture` walks each volume's cells with the ordinary terrain code (models, tints, fluids,
   point lights, block entity renderers), then the entities stored in the plot, one step at a time
   so the AFK capture spreads it over frames.
3. `PlacedSink` wraps the capture's sink: the terrain code writes relative to a block of the plot,
   and every primitive and light is moved by the volume's `Placement` (double precision, so twenty
   million blocks away stays exact) into the capture's frame. A whole volume belongs to the chunk it
   is drawn over.

The volume is captured whole, like an entity: the box's cut faces never seal it. Its pose is the
client's latest tick (`logicalPose`), the same instant as the entities. A volume is included when its
drawn bounding box meets the capture box.

Limits: 256 volumes and 8,000,000 walked cells per capture, 2,048 entities stored in volumes; a volume
past a limit is skipped with one log line `Moving structures over capture limits`, the rest of the
capture is kept. A Sable version whose API no longer matches logs `Sable sub-levels are not captured
with this Sable version` once and the capture goes on without the sub-levels (unlike the Flywheel
probe, which fails the capture: a missing plane leaves the rest of the memory intact, a half-drawn
build does not).

### Adding another mod that stores blocks elsewhere

Valkyrien Skies 2 ships (Eureka, Clockwork, Trackwork) work the same way: blocks in a "shipyard",
drawn with a ship-to-world transform. A new integration is one class implementing
`CaptureVolume.Source` that returns, for each ship drawn inside the box, its storage cells, a
`Placement` and the test telling whether a storage chunk belongs to it, then one line in
`CaptureVolume.SOURCES`. Use the mod's public API by reflection, return nothing when the mod is
absent, and log once when its API is not recognized. Nothing else in the capture changes, on any
loader or Minecraft version: the pass only uses `Level`, chunk coordinates and the existing sink.

## Validation

Unit tests: `PlacementTest` (rotation about a pivot, inverse, normalization, sub-millimetre
precision twenty million blocks away, storage cells covering a drawn box, invalid placements),
`PlacedSinkTest` (quads, rendered quads and lights moved into the capture frame, chunk of the drawn
position, mirrored placements keep their winding), `CaptureVolumeTest` (plot ownership, per-capture
limits, a volume is never sealed).

In game, 14 November 2026: Minecraft 1.21.1 / NeoForge 21.1.248 dev client (`runClientGametest`),
with the exact JARs of the `mc breval` profile: Create 6.0.10, Sable 2.0.5 and Create Aeronautics
bundled 1.3.2. A flat world gets a 5 × 5 ship (planks, a wool wall, glass, a lantern, a chest, a
creative motor and a bearing, an armor stand) assembled with `/sable assemble area`, turned 30°
about Y with `/sable physics rotation @l set axis 0 1 0 30` and left to fall; a powered bearing
stands on the ground next to it. `/minemories export 12`:

| | Code of `main` | This change |
| --- | --- | --- |
| Ship blocks (planks, wool, glass, lantern, motor, bearing) | absent | present, turned 30° (a glass cube spans 1.37 = cos 30° + sin 30°) |
| Chest on the ship | absent | present |
| Ground bearing contraption (`create:stationary_contraption`) | present | present |
| Log | — | `Moving structures captured: 1` |

The AFK progressive capture (radius 16, idle 1 minute) of the same scene contains the same ship,
chest, lantern, motor and bearing (two AFK cycles, 187 and 189 frames). The Blender 5.2.2 renders
of both GLBs from the same camera show the ship only after the change. Evidence (GLBs, logs,
renders, scene script): `~/.local/state/minemories-validation/moving-structures-20261114/`.

Not exercised: a Create contraption carried by a sub-level (the bench's on-board bearing lost its
contraption when `/sable assemble` moved it, in game too, so there was nothing to capture), ships
built with Aeronautics' physics assembler in survival, Fabric, and a full modpack.
