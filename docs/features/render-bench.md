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
`--local`, and the JDK each configuration names (`bun mod jdk install 17`). Downloads, the launcher and one game
folder per configuration live in `~/.cache/minemories-bench` (`MINEMORIES_BENCH_HOME` to move them). Outputs go to
`build/mod-bench/<config id>/` (`game.log`, `capture.glb`, `capture.json`, `placed.json`, `result.json`) and the
table to `build/mod-bench/report.html`. A configuration takes about 45 seconds once its files are cached.

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
   server thread.
4. With `contraption: true` it also builds a Create bearing on a creative motor with one wool block, and
   assembles it.
5. It writes `placed.json` (each block's position and the block the world actually kept, the renderer, the
   loaded mods), runs `/minemories export <radius>` and stops the game when the GLB is written.
6. Node reads the GLB without a 3D engine (`scripts/mod/bench/glb-cells.mjs`): every triangle goes to the block
   holding its centroid, using `captureOrigin` and the node transforms. Positions, not names, decide: the
   capture groups geometry by material under the first model that used it.

Statuses, worst first:

| Status | Meaning |
|---|---|
| missing | the block stayed in the world, but nothing was captured in its area |
| doubled | some triangles in its area repeat another one exactly, with the same winding: geometry drawn twice |
| not placed | the world did not keep the block (it needs a support or context) |
| ok | geometry present, nothing drawn twice |

A block's area is its cell, the ring around it (`(spacing - 1) / 2` blocks) and the layer above; the floor
below is left out. The contraption is checked on its own: `unassembled`, `missing`, `doubled` or `ok`.

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

Fabric 1.20.1, production JAR 0.38.3-beta.1, llvmpipe:

| Configuration | Blocks | ok | missing | doubled | not placed | Contraption |
|---|---|---|---|---|---|---|
| `fabric-1.20.1-create-6` (Create 6.0.8.1) | 638 | 625 | 0 | 10 | 3 | ok |
| `fabric-1.20.1-create-0.5` (Create 0.5.1-j) | 581 | 568 | 0 | 11 | 2 | ok |

- `create:water_wheel` (6,084 of 7,150 triangles repeated) and `create:large_water_wheel` (5,778 of 6,741) are
  drawn several times over in `block_entities`, on both Create versions. To investigate.
- Smaller repeats: `rotation_speed_controller` (66), `small_bogey` (24), `fluid_valve` (22, Create 0.5 only),
  `controller_rail` (4), the three scaffoldings and both cuckoo clocks (2 each). Some may come from the models
  themselves.
- Not placed: `belt` and `gantry_carriage` (both versions), `factory_gauge` (Create 6): they need a support.
