# Zone score, per-chunk fingerprints and suggested radius (issue #173, phase 5)

Goal: know **which areas matter** to the player, without sending anything and without touching their preferences. This
phase changes **neither AFK triggering, nor the radius, nor uploading**: it ranks area suggestions and keeps
locally what each capture showed. The prototype is validated on real captures and **in game** (native trial of
2 November 2026: see `glb-size.md`, “In-game validation”). The behavior changes (see “Remaining”) are not done.

## Signals and score (`ZoneScore`, `core` module, tested without Minecraft)

Score of a 16 × 16 chunk in [0, 1]: weighted average of saturated signals (`min(1, ln(1+x)/ln(1+cap))`, linear
for a proportion). **An unknown signal is dropped and the remaining weights are renormalized**, never counted as zero.

| Signal | Weight | Cap | Source | Status |
| --- | ---: | ---: | --- | --- |
| Active time in the area | 0.30 | 2 h | `VisitedZones` (existing) | used |
| Player edits (place/break) | 0.25 | 64 | no client entry point without a mixin | **not implemented** (unknown) |
| Share of built blocks (planks, bricks, glass, wool…) | 0.20 | 30% | capture quads, `NaturalBlocks` | used |
| Block entities (chests, beds, furnaces, signs) | 0.15 | 8 | quads in the `block_entities` category ÷ 24 | used (approximate) |
| Placed lights | 0.05 | 16 | capture lights | used, weakly discriminating |
| Chunk `InhabitedTime` | 0.10 | 72,000 ticks | `ChunkAccess.getInhabitedTime()` exists in 1.21.1 (checked with `javap`) | **not used**: client-side value unverified, planned as an optional bonus |

64-block area (4 × 4 chunks described by captures): `0.6 × best chunk + 0.4 × average`. Without a capture, only
time counts. **Suggested radius**: 16 to 64 in steps of 16 depending on the score; shown in the suggestion, never applied.

## Local storage (`ZoneInsights`)

An `*.insights` file next to the area history (same defensive reading and bounding rules: 10,000 chunks, 2 MiB):
share of built blocks, number of block entities, lights and fingerprint per **absolute** chunk. It is only read and written
in the player's persistent world; it never leaves the device (neither before nor after pairing), never goes into
the GLB or the uploaded metadata, and the diagnostics opt-out, disabled AFK or any other explicit
setting are neither read nor modified. Manually triggered and AFK captures feed it the same way.

## Per-chunk fingerprint (`ChunkStats`)

Used to recognize **unchanged** chunks between two captures. Independent of the capture origin and of quad
order: a sum of shape hashes (material + relative edges) and first- and second-order moments of quad centers,
**shifted to absolute coordinates** once the origin is known; entities (mobile) are excluded. It is a change
detector, not a proof (two blocks swapped symmetrically go unnoticed). The client logs
`total / changed / new` after each capture; **no capture is skipped yet** on this basis: deciding not to
recapture a chunk changes the mod's behavior and needs in-game validation (see “Remaining”).

## Validation on real data (outside the game)

The 42 readable captures from the local history (46 folders; 4 in another format not read), replayed through the real
writer with categories inferred from material names:

- The score clearly separates builds from nature: a capture where 66% of quads are built (832
  block-entity quads) reaches 0.88 on its best chunk; the nine captures with less than 0.5% built quads stay
  between 0.00 and 0.29 (best chunk). The highest-scoring captures (≥ 0.85) are all sites where block entities and
  built blocks are present.
- Lights almost always saturate (128 = writer limit, many natural sources in caves): they
  stay at weight 0.05.
- Heat map of one capture (chunk at 1.00 containing the visible structure) overlaid on a top-down Blender view:
  consistent to the eye, but the top-down render is flat (sand) and does not allow a fine comparison.
- Fingerprints: on two captures of the same range taken two minutes apart with origins offset by one
  block, **106 chunks out of 134 (79%) are recognized as identical**; the other compared pairs have different ranges
  (depth, different origins) and differ almost everywhere, as expected.

## In-game validation

Native NeoForge 1.21.1 trial on an isolated profile: `*.insights` written and read back, `Chunks seen by this capture` log, and on two
same-range AFK captures separated by editing two blocks: `changed=2, new=0` over 9 chunks. Disabled AFK is
respected (no capture in 600 frames) and nothing is sent without pairing.

## Behaviors (phase 5 follow-up)

Validated in game (see below), all **local**: no extra upload and no new setting read besides
`captureRadius`.

- **Adaptive AFK radius.** If the player has **never saved** a radius (`captureRadius` key absent from
  `minemories.properties`), AFK uses the area's suggested radius (16, 32, 48 or 64 depending on the score) **once
  captures have described that area**; otherwise, and as soon as a radius is saved (the AFK screen writes it), the setting is used as is. The
  AFK context (`CaptureSettings`) is not modified: only the capture receives the chosen radius, and the log shows
  `radius=…, stored=…` and the score.
- **Upload skipped for a capture with nothing new.** An AFK capture where **no chunk changed, none is new
  and the number of creature quads has not moved** stays saved locally but is not uploaded
  (`upload skipped`). Creatures therefore enter the decision through their quad count per chunk, not through the fingerprint:
  a world where creatures move around is never skipped. An old `*.insights` file (without these counts) counts as
  “creatures moved”: nothing is skipped on an assumption. `/minemories upload` and manual captures are not
  affected; without pairing, nothing is sent anyway.
- **Player edits.** There is no client entry point shared by the loaders (placing and breaking are loader-specific
  events or mixins), so the phase relies on the measurable signal: the **number of captures that found the chunk
  different** from the previous one (`changes` counter, up to 1000), counted as 16 edits per observed change
  (score cap at 64). A chunk never seen changing stays “unknown”, not “never edited”.
- **`InhabitedTime`.** `ChunkAccess.getInhabitedTime()` is read **in the integrated server** (server thread, chunks the capture
  has just described), in single player only; on a remote server the signal stays unknown. A vanilla API shared by the loaders,
  validated in game on NeoForge only.

### In-game validation of the behaviors (2 November 2026)

Same method as `glb-size.md` (NeoForge 21.1.248, isolated profile, JAR `minemories-0.30.2-beta.1.jar` SHA-256
`2ecec8eb2697d532d674fcf13324ead29b8fea41e365bc221e5a59efebcac131`, QA driver outside the JAR, local HTTP server counting requests):

| Check | Result |
| --- | --- |
| Before pairing | 0 requests after two AFK captures |
| 1st capture with no saved radius, unknown area | radius 32 (capture width 64), score 0.26 |
| 2nd capture, area described, active time set to 2 h (driver fixture) | score 0.79 → **radius 48** (width 96), 49 chunks |
| Radius 16 saved | radius 16 used as is (`stored=true`, width 32) |
| Paired, modified capture | upload attempted (3 requests: deliberate 503 refusal from the local server, with retries) |
| Next identical capture | `upload skipped`, **0 more requests**, no pending upload |
| `InhabitedTime` | 25 chunks read, 4,850 to 8,692 ticks, 0 unknown |
| Changes | 9 chunks seen changed after editing blocks; 2 chunks out of 25 for two blocks edited between two same-range captures |
| AFK disabled | no capture in 600 frames, history unchanged |

## Remaining (tracked in #173)

- Validate this phase's behaviors on Fabric and Forge (the code is shared and compiles on all three loaders; the native
  trial only covers NeoForge) and on a remote server (`InhabitedTime` unknown by design).
- Count real block placements/breaks: needs per-loader events.
