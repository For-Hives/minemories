# Timelapse from regular captures

> Since 27 October 2026, the viewer no longer shows a per-zone evolution: see
> [`world-evolution.md`](world-evolution.md) (a single world composed chunk by chunk). The sections below
> describe the foundations still in use (identity, index, storage) and the old per-zone player.

The gallery offers **Evolution** for identified captures. The viewer shows the
states actually recorded, with navigation, playback at an adjustable rate,
pagination and local resume. The private index and the deduplicated storage are
wired into the existing downloads. The site's demo timeline remains illustrative.
How #75 works and how it was validated is described below.

## Identifying future states

The mod writes `worldId`, `worldScope`, `zoneId`, `captureMode`, `captureBounds` and
`captureOrigin` together in the metadata. The API still accepts older memories
without these fields; it rejects a partial identity, an invalid volume or an
origin other than the integer center of the inclusive bounds. The coordinates
stay in the memory's private metadata.

`worldId` is a SHA-256 with a versioned domain, presence markers and
length-prefixed UTF-8 fields. In singleplayer (`worldScope: world`), it combines
the normalized save path, the known seed, the dimension and the UUID of the
signed-in profile. No visible name or geographic proximity is enough to merge
worlds. Copying or renaming a save can produce a new identity. The hash is
neither proof of ownership nor an anonymization of the coordinates.

On a remote server, an address is not a world UUID. The default mode
(`worldScope: session`) uses a random connection identifier, with the address,
dimension and signed-in profile. Reconnecting creates another series, even if
the server keeps its map. Changing dimensions and then returning to the
initial world keeps the session. This avoids implicitly assigning the captures
of two connections to the same world when its seed is unknown.

For intentional continuity across connections, open **M → Advanced mode →
World**, generate an identifier, then save. This local choice gives
`worldScope: namespace`: with the same address, identifier, dimension and
profile, future states stay in the same series after reconnecting and
restarting. If the server replaces its map, generate and save another
identifier. Clearing and then saving goes back to per-connection mode. This
choice does not reassign older memories. No universal UUID provided by the
server is claimed.

Configured UUIDs are kept per address in `config/minemories.properties`
(keys `remoteWorld.<fingerprint>`). The screen validates a complete UUID; an
invalid configuration value falls back to per-connection mode and can be
cleared from that screen. Editing these keys by hand requires a client
restart. The setting's identifier is not sent to the Minecraft server: the
captures contain the declared scope and the computed fingerprints. Uploading to
the API still requires pairing. Actually changing an identifier invalidates the
context of in-progress AFK captures/uploads; saving the same value does not.
AFK preferences, the API and the device token are kept.

Exploration follows the same remote boundaries. In per-connection mode, depths
and zones stay in memory for at most eight dimensions, evicting the least
recently used; no file is created per session. Returning to a dimension
recovers its state as long as it is within that window. In configured mode,
histories are persisted under the chosen identity and recovered after a
restart. Existing local histories keep their keys. Old remote histories are not
automatically reassigned to a newly identified world. The configured setting is
cached: the properties file is not read again on every exploration tick.

`zoneId` ties this world to the mode and the exact horizontal bounds. The
`selection` mode also includes the explicit vertical bounds. In `around` mode,
the explored depth can grow without changing the zone; changing the horizontal
center or the radius produces another zone. Older memories will not be
retroactively assigned to a series based only on their name or seed.

The origin is the center of the bounds actually exported, not the player's
position. In progressive AFK it is computed after the depth search, right
before the metadata is finalized. World data is still read on the client
thread. This will allow successive scenes to be translated correctly if their
vertical center changes.

## Chunking

The API codec walks a stream without loading a whole GLB. A 63-byte rolling
window produces content-defined boundaries: chunks of 16 to 256 KiB, the last
one possibly shorter, with a SHA-256 fingerprint per chunk. The working buffer
is 256 KiB; each emitted chunk is a copy owned by the consumer. Chunking stays
identical regardless of how the incoming stream is fragmented. An insertion
can therefore preserve the following chunks, unlike chunking purely by fixed
offsets.

Processing yields to the event loop every 64 KiB and checks for cancellation
between windows and after each chunk. It rejects an announced size that is
invalid or differs from the bytes received. The consumer must also cancel I/O
blocked at the source. The test with an insertion into 4 MiB of deterministic
data keeps more than 80% of the bytes in unchanged chunks; this synthetic
result is not a measurement of savings on Minecraft captures.

## Transactional catalog and leases

The migrations add a catalog of chunks and manifests, without converting
existing memories. Only one conversion lease can be active in the database,
even with several processes; it expires after fifteen minutes without renewal.
Chunks are isolated per owner and SHA-256 fingerprint. Their provisional
references protect in-progress writes.

Publishing requires the write acknowledgement of each chunk, the exact sizes
and the presence of the original memory, still active and unchanged. One
transaction replaces its logical key, publishes the ordered manifest and
schedules deletion of the old GLB. Any error rolls back the whole publication.
The catalog itself does no I/O: the conversion service acknowledges each write
after the provider responds. The catalog tests alone do not prove that write.

A shared chunk is kept as long as a memory, a conversion or a read references
it. Readers hold their own temporary references, independent of the trash and
of memory deletion: at most eight readers per owner and sixty-four in the
database, with renewable fifteen-minute leases. The streaming reader closes or
renews these leases. Collection removes expired leases and marks at most one
hundred unreferenced chunks as `deleting` before scheduling their deletion. A
new conversion can never reuse the key of a chunk marked this way. References
and reconciliation protect `pending` and `ready` chunks.

Eight initial SQLite tests cover publication/rollback, two owners, sharing,
trash/purge, expired leases, deletion state, incomplete manifests, reader
limits, two connections and reopening the database. A ninth test checks the
cleanup of late writes. `deleting` entries are removed in batches of one
hundred once their physical deletion request has been consumed.

## Converting and replaying files in the API

`TimelapseFiles` converts an identified memory by walking its original GLB. It
writes new chunks one by one and checks the size and SHA-256 of reused chunks
before publishing. An error keeps the original memory and schedules cleanup of
the attempted chunks, including when the provider wrote the bytes before
losing its acknowledgement. A versioned cleanup debt prevents starting another
conversion and accumulating temporary copies.

Each new cleanup intent from the catalog carries a random generation. The
queue only removes or postpones the generation actually processed: a late write
that requests cleanup again during an asynchronous DELETE therefore does not
lose its request. It can recreate this intent even after the catalog entry has
been collected. Old jobs and their attempts are kept by the migration.

The reader rebuilds the GLB from the ordered manifest. It checks each chunk,
bounded to 256 KiB, before emitting it, and the global hash before emitting the
last chunk. Read references stay protected if the memory is purged during the
download. Closing or cancelling the stream releases the leases, including
before the first read. A heartbeat renews the leases and aborts the operation
after fifteen minutes without progress; the provider must honor the abort
signal to interrupt its I/O.

Nine service tests use real local files and an on-disk SQLite database:
deletion of the original GLBs, reopening the database, exact comparison of the
rebuilt files, chunk reuse, write limits, errors/corruption, purge during a
read, cancellation and lease renewal/expiry. Production maintenance runs every
five seconds and converts at most one identified candidate per pass, with a
single conversion lease in the database. Errors get persistent delays, from one
minute to one hour; invalid metadata does not block the following candidates.
Older unidentified memories are excluded. On shutdown, maintenance aborts its
I/O and waits for the cleanup to be persisted before closing SQLite.

The private, shared and public download paths use this reader. They re-check
access after the asynchronous open; a revocation wins before the headers are
sent. If a conversion replaced a key between lookup and open, the reader
retries once with the new key. URLs, permissions, logical quotas and the
`Cache-Control: private, no-store` header stay the same as for existing
memories. The filesystem and S3 SDK adapters propagate abort signals to writes
and open streams.

The API suite has 225 active tests passing and six Garage tests skipped without
a dedicated server. `bun api:garage` passes the three existing HTTP/session
tests, the new conversion flow, then the six real Garage tests with outages and
restarts. The time-based flow checks private/shared/public downloads,
moderation by another account, revocation, trash/restore, quotas and the final
reclaim of all of the owner's objects. An inventory aged 48 hours classifies
every live chunk as protected, on filesystem and Garage. The dedicated Docker
fixture and its volumes are removed after the run.

The viewer integration is described in the integrated validation below.

## Foundations validation, 15 October 2026

The JAR `dce71edee097db9bb0b0206b103a392b2dcbb40ef53fa3b013c4a7e84cf4a9b3`
was loaded into five Minecraft 1.21.1 / NeoForge 21.1.248 processes with Mesa.
Ten manual captures cover surface, cave, return, another zone, full height,
selection, dimension return, restart, another save and another player. Four AFK
captures notably cover radii 8 and 32 and the cancellations/resumptions of the
existing pipeline. All their metadata pass the API's real parser. The expected
identities stay stable after restart and depth change; different worlds,
players and fingerprints stay separate. Each origin is the exact center of the
final bounds.

Local evidence outside Git:
`~/.local/state/minemories-validation/timelapse-foundation-20261015/`, notably
`identities-verified.json`, the game logs and the fixture metadata. An
off-production trial chunks the 14 GLBs, writes the unique chunks and rebuilds
each file as a stream: size and SHA-256 stay identical. The 5,904,752 bytes of
captures take 3,069,548 bytes of unique chunks (−48.02%, excluding manifests).
This corpus reuses test saves and says nothing about savings in production; it
is not an integration of deduplicated storage into the API. The report is
`codec-replay/report.json`.

The Java tests also cover separation by dimension/seed, null fields, integer
limits and deferred metadata finalization. The API tests cover
partial/inconsistent identities and the codec's properties.

## Private time index

`timelapse.frames` receives the UUID of a memory belonging to the signed-in web
session, an optional anchor and a direction `around`, `before` or `after`.
Shared links, public publications and mod tokens do not give access to the
owner's index. Memories without a complete identity stay accessible through
their usual paths; the index does not assign them to a series by name.

The series key is derived server-side from the owner, `worldId`, `zoneId`,
dimension, mode and exact horizontal bounds. For a selection, the vertical
bounds are also part of this key. Reusing the same zone hash with other
coordinates or another dimension is therefore not enough to mix captures.
Around the player, the vertical extension driven by exploration keeps the
series; each frame keeps its own bounds and origin.

Ordering uses the capture start, then `capturedAt` if it is missing, then the
upload date recorded by the API. The `timeSource` field explicitly marks that
last source. UTC dates, limited to 64 characters, are ordered by seconds and a
fraction padded to a fixed length, without rounding to the millisecond; ties are
broken by UUID. An interval ending before it starts, even by a single
nanosecond, is rejected by the metadata parser.

A response contains at most 128 real states, without images or GLB content. The
initial window includes at most 64 states up to the anchor and 64 after it. The
`before` and `after` windows exclude the anchor and provide at most 128
contiguous states. `hasPrevious`, `hasNext`, the total count and the series'
logical bytes allow navigation without silently dropping states outside the
window. Files stay limited to 200 MiB; the existing owner quota stays 2 GiB by
default, including the trash and pending deletions. Shared chunks avoid keeping
an extra full copy per state.

The index is written in the same transaction as the new memory. A catch-up
processes at most twenty identified memories per maintenance pass; invalid
imports are marked so they do not block the following ones. Renames are read
from the current memory, the trash is excluded from queries and a restore
reuses the same entries. Purging deletes the projection through a foreign key.

Eight dedicated tests cover time comparisons, 300 states and bidirectional
windows, incompatible fingerprints, owners, names, trash/restore/purge,
invalid imports and reopening SQLite. The HTTP/oRPC test also checks
anonymous/other-owner access and restore, on filesystem and Garage. The 14
native captures already validated give seven series, six of which are states
of the main fingerprint. The Y origin offsets of −21 blocks in the cave and −67
blocks at full height are kept for future replay. Local evidence:
`native-index-report.json`. `bun check` and `bun run build` pass, with 233
active API tests and six Garage tests skipped without a dedicated service.

## Remote scope validation, 15 October 2026

The JAR `4104f3cd139857846593db52b61a47c84590a0c75a3e2f43ca2460a8d464113a`
passes nine Minecraft 1.21.1 / NeoForge 21.1.248 processes: an integrated host
listening only on loopback, two remote client processes, five local regression
runs and one upgrade run of the old test save. The remote fixture uses offline
authentication, without LAN publishing.

The twelve remote GLBs and their metadata pass the API's real validators and
give six series. Returning from the Nether keeps the same identity and the cave
depth in memory. Reconnecting by default starts from another identity and does
not inherit that depth. The configured world keeps five states in the same
series, including after reconnecting and restarting the client; its persistent
history recovers the cave at Y=28. Changing the UUID and then clearing it
separates the new states and does not reuse that depth. The disabled AFK
preference is preserved. The real empty/configured screens were captured and
inspected, with generation, clearing and saving through their buttons.

The local runs keep ten depth/selection captures and four from the AFK run,
including cancellations, resumption, OpenGL states and radii 8/32. The trial on
the previous JAR's old folder recovers exactly the same `worldId`, `zoneId` and
Y=28 depth: no migration of singleplayer histories is forced.
Evidence outside Git: `~/.local/state/minemories-validation/timelapse-remote-20261015/`
(`report.json`, captures and screenshots) and `timelapse-world-scope-20261015/`
(`identities-verified.json`, `upgrade/report.json`).

The API exposes `TemporalWindow.scope` to distinguish a known world, a remote
session and a declared world. Old remote tags without a seed or declared scope
are excluded from series but remain downloadable. The index cache migration
only rebuilds the projection and keeps memories, manifests and files. The tests
cover this migration and the three scopes; the shared `temporalIdentity` helper
will let the viewer offer only compatible captures.

## Preparing the time player, 15 October 2026

The Three.js engine accepts an origin translation and keeps the camera between
captures. It keeps the previous model until the next one compiles
successfully; a cancellation or an error releases the rejected model and shows
the previous one again. Shared geometries, materials, textures and ImageBitmap
pixels are released once per capture. The sky is repositioned before immediate
renders, including thumbnails. Imported lights belong to the replaced model and
keep their position after translation.

The `TemporalLoader` controller limits requests to one active load and one
replaceable next selection. Fast scrubbing aborts the active request, waits for
its parser to finish and loads only the latest selection. No model is
downloaded or decoded in parallel; an error requires a new explicit selection.
This controller is now used by the player described below.

Eleven targeted tests check replacement, cancellation before reading/during
compilation, closing during parsing, GPU error/recovery, resource release and
300 fast selections. `bun web:check` passes with the coverage thresholds
unchanged. The global `bun run build` check, including `bun check`, passes at
this stage.

Graphical validation: headless Chromium with WebGL/SwiftShader actually loads
24 successive captures (surface, cave, full height, back to surface), with
camera position and target unchanged and a single current model. GPU counters
stay exactly constant for each of the four states over six cycles: 30/14,
34/17, 44/19 and 34/17 geometries/textures respectively. This checks this
bounded flow, without claiming to measure all of the browser's memory. The log
contains no JavaScript exception; its only network error concerns the favicon
missing from the test bench. The renders were inspected.

Blender 5.2.2 imports and renders the four native GLBs with a shared camera and
the same origin correction (glTF axes converted to Blender axes). The surface
and the reference column stay aligned despite the depth differences. Evidence
outside Git: `~/.local/state/minemories-validation/timelapse-viewer-20261015/`,
`report.json`, four Chromium renders, `blender-report.json` and four Blender
renders. The Blender bench's first framing aimed at zero rather than the
geometry; the corrected framing targets the first capture's bounds and the
final renders were inspected. This engine stage precedes the interface
validation described below.

## Streaming trial at the 200 MiB limit

A GLB actually captured with the JAR above was extended to 209,715,200 bytes by
adding unused zeros to its BIN chunk, without changing geometry or textures.
This file passes the API's streaming validator. The production filesystem
engine converts it, deletes the original and then, in a new process, serves it
through the private HTTP route: size and SHA-256 stay identical
(`9083bafe3aa58c4306c8253ff7a3d4355d47d7773851b0857b2efee288d5c3ab`).
Blender 5.2.2 imports and renders the rebuilt file: one mesh, 2,766 polygons,
terrain, vegetation and entities visible.

The observed peak RSS goes from 84,416 to 164,700 KiB for the conversion, and
from 83,892 to 152,716 KiB for the HTTP replay in the new process. The
production paths keep per-chunk buffers; these measurements include the
runtime and its temporary allocations. This artificial padding produces six
unique chunks and is not a scene compression benchmark. Local evidence:
`large-stream/report.json`, `fixture.json`, `blender.json` and `replayed.png` in
the foundations validation folder.

## Integrated player and limits

Open **Gallery → world folder → Evolution** on a compatible capture. The date
shown is that of the last model rendered successfully, and its source (capture
or upload) is explicit. Exact timestamps can be viewed on the date; capture
intervals are shown when known.

**Play / Pause** steps through only the states that exist, at 1, 2, 5 or 10
seconds per capture. This display rate does not change the AFK rate: five
minutes of inactivity and at most one capture every four hours by default. The
player stops at the last state, on error or when the tab becomes hidden. Pause
stays available during a load; the current capture may finish displaying, then
no following state starts. No transition reconstructs changes before the first
capture or between two memories.

The camera stays fixed between captures, with compensation for the geometric
origins. **Recenter the camera** frames a depth that has grown. The slider only
covers the current page; the **Older captures** and **Newer captures** buttons
replace the window, limited to 128 metadata entries. Neighboring GLBs are not
preloaded: a single download/decode is active, with a single replaceable next
selection. Each file is streamed within a 200 MiB limit and must match its
announced size exactly. The GPU replacement temporarily holds the old and the
new model, then releases the old one; it keeps no cache of previous scenes.
Memory for decoded pixels depends on the file's textures, not only on its
compressed size.

Resume keeps at most 32 series in the browser's local storage and only writes
after a successful display. Series are tied to the owner on the API side; a
local preference grants no access. A deleted or unavailable resume capture
leads to an explained return to the selected capture. Preferences are not
synchronized across browsers. Older files without a complete identity, and old
ambiguous remote tags, do not offer Evolution.

The existing logical quota bounds the captures kept per account, even when
chunks are deduplicated. A full quota refuses new uploads; the system does not
silently delete memories to make room. Trash/restore, purge delays and
reconciliation still apply. History has no additional time cutoff: pages walk
through the active captures available within this quota, without loading the
whole series into memory.

## Real interface validation, 15 October 2026

The interaction tests cover navigation, pause/rate, page switching,
cancellation on fast slider movement or closing, network errors, denied
authorization, missing resume and WebGL failing to start. Preferences are
validated and bounded to 32 series. The file reader stops an oversized stream
before collecting the rest; truncated files are rejected.

Chromium with WebGL/SwiftShader opens the full application against a real local
Bun/SQLite/filesystem API and a temporary test account. Three hundred test
entries are derived from four validated native GLBs, with dates spaced out for
pagination: these are not three hundred distinct Minecraft acquisitions. The
run checks the initial display without preloading neighbors, changed depth, a
blocked network error then recovery, playback at one second then pause, moving
backward/forward beyond 128 metadata entries, browser reload with resume,
gallery links and the 390 px mobile layout without overflow. No JavaScript
exception is recorded. The desktop/mobile renders were inspected.

Evidence outside Git: `~/.local/state/minemories-validation/timelapse-ui-20261015/`,
`browser-report.json`, screenshots and check logs. The driver's first pass
looked for the cards in a closed gallery folder; the corrected driver opens that
folder before checking the links, and the full run passes.

The same viewer also loaded, from the API's deduplicated storage, the native
GLB extended to 200 MiB described above. A single file is requested, the model
appears about 3.3 seconds after navigation on this SwiftShader bench and no
JavaScript exception is recorded. The render was inspected (`native-200m.png`,
`large-browser-report.json`). The BIN padding is artificial; this duration is
not a performance promise for a detailed 200 MiB scene.

The final global `bun run build` check passes under Bun 1.4.3 / JDK 21, with
`bun check`, 140 web tests, 235 active API tests and the Java checks. The six
Garage tests require the dedicated service; their real validation is described
in the backend checkpoints above. Coverage thresholds are unchanged.
