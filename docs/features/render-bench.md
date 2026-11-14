# Render bench

`bun mod bench` places every block of a modpack configuration in one flat world, captures it with the
production Minemories JAR and reports, block by block, what the GLB holds. Several configurations (Minecraft
version, loader, mod set) run one after the other and land in one HTML table, so a block that renders in one
configuration and not in another stands out.

It complements, and does not replace, the manual checks in
[modpack-renderer-validation.md](modpack-renderer-validation.md): the bench says whether geometry exists where a
block stands and whether some of it is drawn twice; it does not judge textures, colours or light.

## Running it

```bash
bun mod build fabric-mc1.20.1     # the Minemories JAR the configurations name in `target`
bun mod bench --list
bun mod bench fabric-1.20.1-create-6
bun mod bench --all               # one game at a time
bun mod bench --all --local       # on this machine's screen instead of Xvfb
```

Requirements: `uv` (installs [portablemc](https://pypi.org/project/portablemc/) 5.0.6 once), `xvfb-run` unless
`--local`, and the JDK each configuration names (`bun mod jdk install 17`). The Minemories JAR must be built at the
version `mod/1.21.1/gradle.properties` declares: an older build left in `build/mod-dist` is refused, not used.
Downloads (with their Modrinth metadata, so a rerun works offline), the launcher and one game folder per
configuration live in `~/.cache/minemories-bench` (`MINEMORIES_BENCH_HOME` to move them). AFK captures are turned
off in each game folder's `config/minemories.properties`, so none can replace the export the bench waits for.
Outputs go to `build/mod-bench/<config id>/` (`game.log`, `capture.glb`, `capture.json`, `placed.json`,
`result.json`) and the table to `build/mod-bench/report.html`. A configuration takes about 45 seconds once its
files are cached. A configuration that fails (missing JDK, download, crash) is listed in the report with its cause
(the driver's error, the crash report's description, or the log's last error) and the others still run.

## How a run works

1. portablemc installs the loader as a player's launcher would. The `mods` folder gets the production Minemories
   JAR, the configuration's Modrinth files (pinned by version id, checked against their SHA-512) and the bench
   driver.
2. The game starts offline. The driver (`mod/bench/drivers/<name>/`, active only with `-Dminemories.bench`)
   creates the singleplayer flat world `MinemoriesBench` (creative, peaceful, no random ticks, mob spawning,
   weather or daylight cycle).
   There is no dedicated server, so nobody accepts the server EULA on anyone's behalf.
3. It lists every registered block of the plan's `namespaces`, minus `exclude`, air and blocks with an invisible
   render shape, and places their default states on a grid, `spacing` blocks apart (4 by default), on the
   server thread. `/minemories export` stops at a radius of 128: a grid that would need more (about 3,600 blocks
   at spacing 4) stops the run with an error rather than reporting the far rows as missing. Split the namespaces
   across configurations instead.
4. With `contraption: true` it also builds a Create bearing on a creative motor with one wool block, and
   assembles it.
5. It writes `placed.json` (each block's position and the block the world actually kept, the renderer, the
   loaded mods), runs `/minemories export <radius>` and stops the game when the GLB is written.
6. Node reads the GLB without a 3D engine (`scripts/mod/bench/glb-cells.mjs`): every triangle goes to the block
   holding its centroid, using `captureOrigin` and each node's scale and translation (a rotated or nested mesh
   node is refused rather than misplaced). Positions, not names, decide: the capture groups geometry by material
   under the first model that used it.

Statuses, worst first:

| Status | Meaning |
|---|---|
| missing | the block stayed in the world, but nothing was captured in its area |
| doubled | some triangles in its area repeat another one exactly (corners, winding, material and texture coordinates): geometry drawn twice |
| not placed | the world did not keep the block (it needs a support or context) |
| ok | geometry present, nothing drawn twice |

A block's area is its cell, the ring around it (`(spacing - 1) / 2` blocks) and the layer above; the floor
below is left out.

The same face with another texture is counted as *layered*, shown in the report but not judged: it is how a
grass block's tinted side overlay is drawn, and also what a face drawn twice through two paths (once as a block,
once by its block entity) would look like. The bench cannot tell those apart.

The contraption carries one white wool block: 12 triangles when drawn once. It turns during the capture, so its
triangles are counted over the 3x3 cells around it: `unassembled` (no contraption entity), `missing` (nothing),
`partial` (fewer than 12), `doubled` (more than 12, or exact repeats: two copies at two angles are not exact
repeats, so the count is what catches them) or `ok`.

The report outlines a row when its status differs between configurations, or when its triangle counts differ
by more than 2x.

## Configurations

`mod/bench/configs.json`:

```json
{
  "id": "fabric-1.20.1-create-6",
  "minecraft": "1.20.1",
  "loader": "fabric",
  "loaderVersion": "0.17.2",
  "java": 17,
  "target": "fabric-mc1.20.1",
  "driver": "fabric-1.20.1",
  "mods": [{ "project": "create-fabric", "version": "HAqwA6X1" }],
  "plan": {
    "namespaces": ["create"],
    "contraption": true,
    "exclude": { "create:lectern_controller": "why it cannot be placed bare" }
  },
  "drawsNothing": { "create:fake_track": "why the game draws nothing for it" }
}
```

- `target` is a `mod/targets.json` target; `driver` a folder of `mod/bench/drivers/`.
- `mods[].version` is a Modrinth version id, never a "latest": a run must be repeatable.
- `exclude` and `drawsNothing` keep a reason per block. Exclude only what breaks the world (a crash, a hang);
  a block that simply does not stay goes in the table as "not placed".
- Only a Fabric 1.20.1 driver exists today. Forge and NeoForge drivers, and other Minecraft versions, need their
  own driver project.

## Limits

- Results come from Mesa llvmpipe under Xvfb (the report shows each run's renderer). A GPU driver can behave
  differently; a surprising result is checked in a normal game before being called a bug.
- Default states only: no rotations, powered states, fluids in tanks or multiblocks assembled from parts.
- The bench is a local tool. It is not part of `bun mod release` nor of CI: a third-party mod failing must never
  block a beta.

## Results, 14 November 2026

Fabric 1.20.1, production JAR 0.38.3-beta.1, llvmpipe. Two runs from a clean output gave the same counts.

| Configuration | Blocks | ok | missing | doubled | not placed | Contraption |
|---|---|---|---|---|---|---|
| `fabric-1.20.1-create-6` (Create 6.0.8.1) | 638 | 628 | 0 | 7 | 3 | ok, 12/12 triangles |
| `fabric-1.20.1-create-0.5` (Create 0.5.1-j) | 581 | 571 | 0 | 8 | 2 | ok, 12/12 triangles |

- `create:water_wheel` and `create:large_water_wheel`: every triangle of their block entity is in the GLB exactly
  7 times (7,150 triangles for 1,066 distinct ones; 6,741 for 963), on both Create versions. 7 is the six faces
  plus the "no face" a model is asked for: the wheels are OBJ models (loaded by Porting Lib on Fabric) that very
  likely answer every face with all their quads. Whether the game itself draws 7 copies is not checked yet; a
  capture that drops exact repeats would make these wheels 7 times lighter either way.
- Smaller exact repeats: `rotation_speed_controller` (18), `small_bogey` (24), `fluid_valve` (22, Create 0.5
  only), the three scaffoldings (2 each). Not investigated; some may come from the models themselves.
- Layered, not doubled: `controller_rail` (4), both cuckoo clocks (2), `rotation_speed_controller` (48).
- Not placed: `belt` and `gantry_carriage` (both versions), `factory_gauge` (Create 6): they need a support.
