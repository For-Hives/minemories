# Frequently visited area suggestions

The **M → Areas to explore** menu and `/minemories suggestions` show the five
most visited areas of the current world, dimension and player. These
suggestions stay local: opening the list changes no selection corner, produces
no GLB and triggers no upload. The player goes to an area and then chooses their
local export or capture as usual.

## Score and aggregation

The score is an approximate active time, sampled once per second on the client
thread. Two consecutive observations must be active and 1 to 2 seconds apart;
each credits at most one second. Nothing is caught up after a stop, a clock
change or a stalled client.

An observation is active when the game is focused, not paused, and the player
has moved or turned the camera within the last minute. The chunk must actually
have been received by the client: the counter does not load terrain. Long AFK
breaks therefore do not make an area artificially interesting. Stationary
interactions without camera movement are not an extra signal.

Chunks are aggregated into fixed **64 × 64 block** cells (4 × 4 chunks), rounded
down, including for negative coordinates. A cell appears after 60 credited
seconds. The list shows its X/Z bounds and the accumulated minutes; ties are
broken by coordinates. This is a visit signal, with no analysis and no promise
of detecting builds.

## Persistence and limits

Scores are kept separate from depth tracking:
`config/minemories/exploration/<hashed-identity>.properties.zones`.
The identity combines the singleplayer world path or the server address, the
dimension and the player UUID. No server name appears in the file name.
Tracking also works without pairing and with AFK captures turned off.

Each history keeps at most 10,000 cells; an old entry is evicted at the limit.
Crediting moves a cell to the end of the queue, but the eviction order is
rebuilt on read. A score saturates at 365 days. Reading refuses files larger
than 1 MiB, symbolic links and invalid scores/coordinates. Damaged text entries
are ignored; an unreadable file is preserved, and tracking for that session
stays in memory. Saves use the same atomic replacement as the settings, every
ten seconds and on an identity change or disconnect. A hard crash can lose the
last unsaved seconds.

## Validation

`VisitedZonesTest` checks aggregation, ranking, negative coordinates, threshold,
pause/missing chunks/clock, persistence without catch-up, eviction, list limit,
oversized files and symbolic links. The identity tests in
`ExplorationDepthTest` cover the shared world/dimension/player key.

## Native trial of 15 October 2026

Minecraft 1.21.1 / NeoForge 21.1.248, Temurin 21.0.12.1+1, Mesa llvmpipe
OpenGL 4.6. JAR 0.1.1-dev.1 loaded from `mods/`, SHA-256:
`27f273dc654bfc6f3cef3c8f4ef839750743af2f02258e1f8241136f1fd9788a`.
The QA driver is a separate mod, not included in the distributed JAR. It turns
the camera during two real 70-second stays, with the window focused, then opens
the **Areas to explore** button of the M menu.

The cells X 0…63 / Z 0…63 and X 64…127 / Z 0…63 appear after one minute. The
screen is inspected on a native 900 × 600 screenshot: text, bounds, minutes and
Back button are readable. Opening it keeps the selection; six seconds on this
paused screen credit nothing. Temporarily moving the client into a chunk that
was not received creates no score. A Nether/Overworld round trip separates and
then restores the suggestions of the initial world. The account stays unpaired
and AFK turned off; no export or upload is requested.

The restart, other-world and other-player processes check persistence and
isolation. The artifacts stay outside Git in
`~/.local/state/minemories-validation/visited-zones-fixed-20261015/`: driver
sources, JAR/hash, logs, assertion reports and screenshot. `bun check` and
`bun run build` pass with the 140 NeoForge tests, SpotBugs and unchanged
coverage thresholds.

On a remote server, per-connection separation and the configurable world
identifier are described in [Timelapse](timelapse.md). Without an explicit
identifier, the history is in memory (at most eight dimensions); with an
identifier, it is kept across connections. Existing singleplayer histories are
unchanged.
