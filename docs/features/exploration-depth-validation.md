# Visited depth validation

The scenario of issue [#7](https://github.com/For-Hives/minemories/issues/7) was
exercised on 15 October 2026 in four real Minecraft launches, with a separate
validation mod and the distribution JAR loaded from `mods/`.

Versions: Minecraft 1.21.1, NeoForge 21.1.248, JDK Temurin 21.0.12.1+1,
Minemories 0.1.1-dev.1; Mesa llvmpipe OpenGL 4.6 and Blender 5.2.2.
JAR SHA-256:
`34d6bf346cfe97d869325df9282295f9a67598a7a749705e20e4ec715646068f`.

## Comparative run

An isolated copy of the test world contains a small build above ground and a
room at Y=30, with two foundation blocks at Y=28/29. Teleports use the
integrated server's commands, then the tests wait for the client position and
the received chunks. Captures around the player use radius 2 (5×5 columns).
Spectator mode prevents a stone ceiling from blocking the visit.

| Step | GLB bottom, world Y | Top | Height | Size |
| --- | ---: | ---: | ---: | ---: |
| Surface, before descending | 69 | 80 | 11 | 63,096 bytes |
| Room, feet at Y=30 | 28 | 80 | 52 | 184,312 bytes |
| Back on the surface | 28 | 80 | 52 | 184,312 bytes |
| Other area, 64 blocks away | 69 | 84 | 15 | 67,380 bytes |
| Explicit full height | -64 | 80 | 144 | 483,628 bytes |
| Selection Y=40..45 | 40 | 46 | 6 | 16,512 bytes |
| Back after a trip to the Nether | 28 | 80 | 52 | 184,312 bytes |
| Same world after a full restart | 28 | 80 | 52 | 184,312 bytes |
| Other save, same name/seed/position | 69 | 74 | 5 | 57,016 bytes |
| Same save, other player UUID | 69 | 80 | 11 | 61,864 bytes |

Extremes are read from the position accessors and moved back into world space
with the origin recorded by the manual export. The top of the build is kept
before and after the descent. The Y=28 floor does keep two blocks below feet at
Y=30. Explicit corners do not reuse this depth; full height goes down to the
dimension minimum of -64.

In the Nether, the history path changes and no Overworld Y=30 depth is
inherited. On return, the Overworld path and its minimum are found again.
A temporary client position in an unreceived chunk adds no entry: the visit
map is identical before and after. This check calls the tracker before a
network tick and then restores the position; it does not load the chunk.

The second launch reopens the same world/player and finds the Y=28 minimum on
the surface. The third opens another save with the same name and seed; its
capture stays shallow. The fourth launches another player name/UUID in the
first world; its history does not pick up the first player's.

## Persistence, limits and privacy

All four launches use an explicitly disabled AFK preference, kept after
restart. Depth tracking continues despite that preference. No device is
paired; captures and histories stay local. The upload transport reads the GLB
and its metadata, without reading the exploration history.

The `ExplorationDepthTest` tests separately cover negative coordinates, extreme
limits, identities, tampered files, persistence and a run of 100,001 chunks:
the oldest entry is evicted, the file stays under 8 MiB and the kept minimum is
found again after reading. History is capped at 100,000 chunks per
world/server, dimension and player. Visits before installation are not
invented.

The scenario's ten GLBs pass the shared API validator. Blender renders of the
first surface capture and of the return after the deep visit were inspected:
the build is intact, the shallow volume stays short before the descent and the
underlying volume extends after the visit. The cut seals follow the rule of
`glb-face-culling.md` (enclosed cave cells only).

Local artifacts: `~/.local/state/minemories-validation/depth-zones-20261015/`
(program, JAR checksum, events, bounds reports, GLBs, renders and logs of the
four processes). The original world, personal profiles and their preferences
were not modified. No private world, GLB or history is committed.

On a remote server, per-connection separation and the configurable world
identifier are described in [Timelapse](timelapse.md). Without an explicit
identifier, history is kept in memory (at most eight dimensions); with an
identifier, it is kept across connections. Existing single-player histories are
unchanged.

## Five-block bottom margin

Captures around the player now keep five blocks below the lowest visited foot position in the relevant chunks, without going below the bottom of the dimension. This margin also applies to history already recorded. Explicit selections keep their corners.

Check of 16 October 2026: Minecraft 1.21.1 / NeoForge 21.1.248, distribution JAR `0.5.1-beta.1` (SHA-256 `4c34794280d40fb8fb2ab0921e69d84de54442772aaa61e351eb7d371146d331`). A visit to Y=30 produces a GLB whose bottom is Y=25; returning to the surface and changing dimension keep that bottom. Full-height mode and explicit corners are still verified. The GLB was imported into Blender 5.2.2 and its render inspected. Isolated client with master volume at zero; no personal world modified. Local evidence: `~/.local/state/minemories-validation/depth-margin-five-20261015/`.

## Builds under the cut

The visited depth alone cuts off what other players built below the places this
client has been: on a shared server, a fresh install has no history, so a
capture taken at Y=64 stopped at Y=59 and left out a cave base whose floor was at
Y=58, and the storage rooms under it. Since 0.36.5, an automatic bottom also goes
down through the builds that reach it (`BuildDepth`, `ClientRuntime.followBuilds`),
read from the loaded chunks of the capture area:

- A build touches the cut when a placed light source or a block entity stands
  within 6 layers above or below it. Natural ones do not count: lava, fire, glow
  lichen, amethyst, glowing ores, sculk, spawners, bee nests, ruins, geodes and
  Lootr's structure chests. A waterlogged lantern still counts.
- From there, only block entities (chests, barrels, furnaces, machines, signs…)
  carry the build further down, each at most 6 layers below a cell already
  joined, in the same chunk or a neighbouring one. Torches alone light mines and
  do not: a lit tunnel on the other side of the area, or a base 40 blocks down
  with nothing in between, is not connected.
- At most 64 layers below the automatic bottom count, and five foundation blocks
  stay under the lowest joined layer. Explicit depth, full height and selections
  are unchanged.
- Known limit: the client never receives loot tables, so a plain `chest` or
  `barrel` that a structure generated (a dungeon, a stronghold, a trial chamber)
  looks like a placed one. Within 6 layers of the cut it can lower the bottom by
  a few blocks, and generated containers in neighbouring chunks can carry it
  further, never past the 64-layer cap.

Measured on the reported world (Fabric 1.20.1, area 257 × 257 around
213/2254, automatic bottom Y=59) by replaying the rule on the save: a first
version that let torches chain and did not check chunk adjacency went down to
the 64-layer cap (Y=-10), following lit mine tunnels and modded amethyst geodes
across the whole area. The rule above stops at Y=41: it keeps the cave base, the
Create machines at Y=50 to 54 and the storage room at Y=46 to 48 under the
player's chunk, and nothing else. `BuildDepthTest` covers both cases.

