# Minemories tiles and evolution mode: post-mortem of an attempt (27 October 2026)

This document records what was built on 27 October 2026 to split captures into tiles (`.mmtiles`) and show how a
world evolves over time, what did not work and what to take away. The corresponding code was later removed from
`main` by revert commits; it can still be browsed in the Git history (commit list at the bottom).

Status: **abandoned as is.** The automated tests passed, but the result in real conditions (game, production API,
browser) was unsatisfactory. Nothing described here was fully validated in game before being pushed.

The approach adopted afterwards (composition in the browser, with no mod change) is described in
`docs/features/world-evolution.md`.

## Original goal

A player plays and the mod takes snapshots (AFK or manual); in the viewer they see **a single world that
evolves**: one area can change while another stays frozen in its last known state. Not two modes (classic view /
evolution): evolution is the normal view.

## What was built

### 1. Tile format (mod, API, viewer)

- **Absolute** grid of N×N chunks (`tileBlocks = 16 × N`), indices `floor(x / tileBlocks)`, full column in
  height. A quad belongs to the tile of its horizontal centroid; the union of the tiles = the capture's quads.
  Vertices are relative to `(tileMinX, 0, tileMinZ)`; the viewer translates according to the origin of the
  reference capture.
- Each tile is a self-contained `.glb` with its own texture atlas (a texture added elsewhere does not change
  another tile's UVs). Fingerprint = SHA-256 of the bytes.
- `minemories-tiles-v1` JSON manifest (tiles sorted by `(x, z)`, contiguous offsets).
- `.mmtiles` bundle: `MMTB` + version + manifest length (multiple of 4) + manifest + tiles end to end. A single
  file to keep resumable upload, quota and deletion working.
- Mod (`core`): `TiledGlbScene` (in memory, deterministic sort), `TiledSpoolingScene` (streaming for AFK, one
  spool per occupied tile), `TileBundle`. AFK captures first, then an option for manual captures.
- API: detection of the `MMTB` header on resumable upload, strict validation (manifest, each GLB, both
  SHA-256), `memory_tiles` table (offset, size, fingerprint), byte-range reads,
  `GET /api/memories/:id/tiles/:x/:z` (owner only), assembled GLB for the file routes (gallery, sharing,
  public).
- Viewer: tile scheduler (diff by fingerprint, concurrency 4, prefetch of 8, retries), tile-by-tile loading,
  GLB merging (`mergeGlbTiles`) to export a single `.glb`.

### 2. "World" evolution

- Time index series **per world** for tiled captures (instead of one series per `zoneId`), with a new
  `timelapse.tiles({ cumulative: true })` call: for each grid cell, the most recently written tile at the chosen
  date; a newer capture that fully contains a cell with no tile clears it.
- Capture footprint aligned on the tile grid (so a tile is always complete and can replace another one without
  losing the rest).
- Single viewer (evolution built into the studio), gallery with one card per evolution, opening on the latest
  capture, GZIP responses from the API.

## What did not work

1. **Wrong series shown.** Captures were not grouped as intended: the gallery showed one card per capture and
   each "evolution" had only one step. Successive causes: manual captures not tiled (hence one series per
   `zoneId` with exact bounds, which changes on the slightest move), a switch disabled by default, then grouping
   done in the API but not in the gallery.
2. **Size and slowness.** A quad weighs about 150 bytes in the GLB (4 vertices with position + normal + UV). A
   64×64-block tile is ~7.5 MiB; an aligned 128×128-block capture, 30 to 50 MiB. Loading in the browser took more
   than a minute. GZIP cuts the transfer about 8× (measured), but browser decoding (one tile at a time,
   `compileAsync` for every tile) was still to be measured.
3. **Alignment enlarges captures.** To keep tiles complete, the captured area grows from 65×65 to 128×128 blocks
   (then 96×96 with 32-block tiles): 2 to 4 times more data per capture.
4. **Partial tiles.** A capture covering only part of a tile replaces the whole tile: older unaligned captures
   "lose" terrain. Unloaded chunks in the enlarged area leave holes that also replace older content.
5. **Compatibility.** `capture.glb` became a bundle Blender could not read (misleading behavior); changing the
   tile size makes old captures impossible to combine; old captures remain isolated series.
6. **Insufficient validation.** No real bundle was opened in Blender or in the viewer before pushing; the first
   real test exposed problems 1 to 3 at once. The test environment could not drive the game window (no
   screenshots, no virtual keyboard).
7. **Deployment.** CI failed on `bun audit` (a vulnerability in `better-auth`), which silently blocked the
   production release.

## Hard points to anticipate next time

- The real problem is **composing several partial captures** of the same world: complete or partial tiles, holes
  from unloaded chunks, captures of different shapes and times. The model (aligned complete tiles? block
  volumes? differences between captures?) must be decided before writing code.
- The **raw geometry size** dominates (not textures): a per-capture budget and a reduction (hidden-face removal,
  quantization, levels of detail, merged mesh) are needed before enlarging the area.
- **Grouping** (what counts as "the same area") must be validated on real data before building on it.
- Any change to a **default value** (tiles enabled, aligned manual captures) affects every player: do it last,
  once the end-to-end path is validated.

## Lessons

- Validate end to end with **real data** (a real bundle in the viewer and in Blender) before stacking layers (API,
  viewer, gallery, options).
- Measure before optimizing: real size and decoding time of a tile and of a full capture.
- Do not enable by default a feature not validated in game; keep the old path usable.
- Keep the product view simple first (a single viewer, one card per world), then add the technology behind it.
- Check that the deployment CI is green (`bun audit` included) before assuming a push is in production.

## Removed commits (available in the history)

Tile format and mod: `b04f474` (splitting in the core), `2bd39f0` (spool per tile), `baaaea5` (bundle for AFK),
`0bf0a39` (option for tiled manual captures).
API: `509718f` (validation and contract), `f192555` (index and byte range), `735ed1f` (tile upload and serving),
`9e3eb90` (test), `71950ee` (assembled GLB on the file routes).
Viewer: `e9dc2eb` (scheduler), `f92829a` (tile-by-tile loading), `6421a5f` (GLB merging), `e292557` (exporting a
capture), `b73b976` (merging moved into the contract package).
World evolution: `43832af` (cumulative timelapse), `76c0b20` (single viewer), `7aaadeb` (one card per evolution,
GZIP, 32-block tiles), `9bd26e1` (test for old history and `zoneId`).

Commits kept from the same day: simple screen, tabbed advanced settings, linking reminder, diagnostics (`e37123b`
to `7c60436`), `minemories.net` domains (`690b6a5`), `better-auth` security fix (`3e5eac2`) and `bun audit`
advisory (`5b1fd1b`).
