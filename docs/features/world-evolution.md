# World view: all its captures composed chunk by chunk

Replaces the per-zone "Evolution" player (one series per `zoneId`) and the tile attempt of 27 October
(see `docs/concepts/tiles-evolution-postmortem.md`). This is a world's normal viewer, not a separate mode, so the interface does not talk about an "evolving world".
Each world now has **a single view**: all its
identified captures are loaded into the same scene and the left filmstrip moves the world from the oldest
capture to the most recent.

## Principle: nothing changes in the mod or the format

The review of the previous attempt showed that splitting on the mod side (aligned tiles, `.mmtiles` bundle) made
captures bigger, erased terrain with partial tiles and broke Blender. Here:

- the mod, the `.glb`, the upload and the defaults are **unchanged**; every already identified capture
  (`worldId`, `captureBounds`, `captureOrigin`) benefits immediately, AFK as well as manual captures or selections;
- composition happens **in the browser**, from the exact bounds already present in the metadata.

## Composition rule

At step `n`, each block shows the **most recent capture ≤ n** that contains it, among the captures that actually
have geometry in its chunk column (16 × 16, absolute coordinates).

- Each triangle is attached to the block that owns it: centroid pushed 1/64 of a block against its normal, then
  absolute coordinates (`capture origin + local position`). A face lying on a chunk boundary therefore
  belongs to the right chunk.
- A more recent capture only hides the older one **within its exact bounds** (no alignment, no enlarged
  zone) and **only in the chunks where it has geometry**: a chunk that was not loaded at capture time
  never creates a hole; the old content stays.
- Vertical bounds count: a shallower capture leaves older caves below it visible.
- Point lights follow the same rule.

`apps/web/src/lib/world-evolution.ts` implements this model without depending on Three.js (100% test coverage).

## Optimizations

| Point | Choice |
| --- | --- |
| Transfer | File routes (private, shared, public) compress with GZIP level 4 **as a stream** when the client accepts it; no capture is held fully in memory. Measured: ~7.7× fewer bytes on GLBs from the real writer. |
| Order | Downloads from oldest to newest, 3 in parallel; a single decode/attach at a time so the main thread is not blocked. The first capture is displayed as soon as it is ready. |
| Budget | At most 256 captures and 768 MiB decompressed; beyond that, the most recent ones are kept (the current state of the world matters most) and the page says so. The API returns at most 512 metadata entries per world. |
| Composition | Triangles sorted once per chunk on load; each step copies contiguous index ranges (per-triangle tests only in partially covered chunks). A capture is only recomputed if the set of its visible newer captures changes. |
| GPU | A single index buffer per primitive, rewritten over the useful range (`addUpdateRange`); an empty primitive is hidden (no draw call). Fully covered captures therefore cost nothing to render. |
| Textures | A capture fully covered at the displayed step releases its GPU textures; Three.js re-uploads them from the retained images if it becomes visible again (checked in Chromium by going back to the first capture). Already loaded positions are read without copying. |
| Lights | 12 fixed lights shared by the whole scene, updated at each step: no shader recompilation. |

## Measurements (27 October 2026)

GLBs produced by the **real writer** `dev.minemories.core.GlbScene` (synthetic terrain generator, outside Git),
served by a local API (Bun/SQLite/filesystem) and opened in headless Chromium with SwiftShader (CPU rendering):

- a history of 6 captures (plain, house, tower to the east, lake with one unloaded chunk, selection, farm):
  5.5 MiB, loaded in 5.2 s; the computed top view checks the tower, the lake, the farm extension and **the absence
  of a hole** over the unloaded chunk;
- 60 overlapping radius-32 captures: 73.4 MiB raw, ~10 MiB transferred, loaded in 9.3 s; initial sort
  ≈ 4.5 ms per capture, composing one step ≤ 7.4 ms, 111,214 visible triangles out of ~2.2 million
  loaded.

These measurements do not replace in-game validation with real AFK captures and a real GPU.

## Viewer interface

- **Filmstrip** on the left, twin of the right toolbar (same glass, vertically centered, height
  fitted to its content); it is part of the studio: it fades when idle and disappears in immersive mode (H) like
  the other controls. Content: a thumbnail for each capture (image sent by the mod), time, a separator per day,
  a gold thread up to the displayed capture and greyed-out future captures. Loading state is a badge on the
  thumbnail (spinning while loading, red on failure with a retry button, blue if archived or
  over budget) and a thin progress bar while captures are arriving. A play/pause button at the top
  (1.8 s per capture, restarts from the beginning at the end); ← → or ↑ ↓ move from one capture to the next. On phones,
  the filmstrip becomes a horizontal strip. The old transport bar is removed.
- **Centering**: the camera pivot goes to the player recorded in the capture (`minemoriesPlayerPosition`),
  if they were inside the capture; otherwise (old captures, selection made from a distance) to the highest
  surface at the center of the capture, never the middle of the volume or empty space. "Recenter" and double-click
  target the displayed capture.
- **Transitions**: when switching captures, the camera pivot glides toward that point of the displayed capture
  (1.1 s, angle and distance are kept; a user interaction interrupts the glide) and the
  sun turns along the shortest path to the capture's time of day (1.6 s). `prefers-reduced-motion`
  makes both instant.
- **Zoom**: the mouse wheel no longer moves the pivot toward the cursor (`zoomToCursor` disabled); only
  panning moves it.
- **Pivot**: during an interaction, a soft shadow is placed on the visible surface right below the pivot,
  connected by a vertical line; it widens and fades with height. The surface is measured on the visible meshes,
  at most every 120 ms and only when the pivot moves. A raycast through every face cost about 33 ms on a
  1.3 M-face capture and froze panning (shift + drag), so each geometry gets a column grid instead
  (`lib/ground-index.ts`, `viewer-ground.ts`). Grids are built in the background, 3 ms at most per frame
  (about 110 ms in all for such a capture), and a probe then reads one column: 0.3 to 0.6 ms. It keeps the
  raycast's rules: drawn range, the side a material shows, 256 blocks up and 512 down. A composed world's
  layers are indexed from their stable triangle order (`sorted`), and `shown` tells which triangles the
  current composition draws, so a timeline step never makes a grid stale. Faces wider than 64 columns sit in
  one shared column. A turned, upside-down, multi-material, instanced, skinned or morphed mesh, or one
  whose grid failed to build, is still raycast. A capture adds ground only once its grid is ready, a moment after it loads.

- **Rain and snow** stop at the highest block of each column, as in Minecraft: nothing falls under
  a roof, a tree or an overhang. The height map is computed from the visible triangles, only
  when weather is active and after a geometry change (new capture or step); the shader hides
  drops and flakes below that height.

## Gallery

Servers/worlds form a **grid of tiles** (mosaic of the latest thumbnails, number of captures,
size, last visit, seed). The selected tile shows its zones below; the most recent one is selected by
default. A tile's pencil opens the **server sheet** (side sheet): editable name, kept in this
browser (`localStorage`) like zone names, with a link to go back to the original name; captures, size,
first capture, last visit, dimensions, seed and list of zones. Zones have a **Details** tab
(date, dimension, biome, X/Y/Z position, game time, weather, size, seed) next to Share, Publish and
Captures. **Right-click** (or the keyboard menu key) opens the actions of a zone (view, details, share,
publish, captures, rename, trash) or of a server (open, details, rename), at the pointer, keyboard
navigable. Zone cards show the dimension
(colored badge), readable biome (`Snowy taiga`), X/Y/Z coordinates, weather and size as chips.
Captures without a complete identity stay grouped by proximity. An archived capture is flagged in the
filmstrip and can be restored by opening it on its own.

## Known limits and next steps

- The geometry of all loaded captures stays in GPU memory, even when fully covered (textures,
  on the other hand, are released).
- Raw geometry size dominates (≈ 150 bytes per quad). Leads to measure before any format
  change: quantization (`KHR_mesh_quantization`, readable by Blender), `EXT_meshopt_compression`, and
  fingerprint-based storage of unchanged chunks so only what changed is downloaded.
- A more recent capture may keep its cut walls (`CutBoundary`) facing an older neighboring cave.
- The `timelapse.frames` contract (series per zone) is still served by the API but no longer used by the viewer.

## "taste-skill" pass (31 October 2026)

The gallery and the viewer were reviewed with the [taste-skill](https://github.com/Leonxlnx/taste-skill) skill in
app-screen mode (`references/app-screens.md`), `true-black-flat` style applied while keeping the brand's palette and
typography (`--keep palette,type`). Measurements from the skill's inspector on a static snapshot
of `/gallery` (1440, 768 and 390 px):

| | Before | After |
| --- | --- | --- |
| Failures | 4 (gradient, heavy shadow, text < 11 px, external image) | 1 (external avatar blocked by the container's network) |
| Warnings | 7 | 3, justified below |
| Title | 52 px, greeting "Your memories, Alex." under an eyebrow | 28 px, screen name and summary (captures, worlds, last visit) |

- Depth through brightness steps, with no border or shadow at rest; the selected tile takes the style's pattern
  (1.5 px accent border and pale tint).
- Gold is only used for data and selection; a single inverted primary action per screen, the other
  actions are discreet pills; each tile opens its world in one click ("Open").
- No more gradients, glass blur, eyebrows or monospace outside code; text at 12–13 px minimum.
- The number of tile columns follows the number of servers (`gridColumns`: at most 4 on a large screen,
  3 below 1,200 px, 2 on phones with the last tile alone at full width): no orphan tile.
- Declared exceptions (`taste-skill-ignore`): the sky swatches and the time-of-day track, which show the
  sky they select.
- Warnings left as is: shadows of elements floating over the 3D (bars, panels, menu, sheet); border of
  the site navigation bar (outside the gallery); secondary pairing/storage column shorter than the
  row of tiles; "cream" detected on the brand ink (`#f2efdf`, a text color).
