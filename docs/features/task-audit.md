# Task status — 14 October 2026

This audit keeps the evidence for the criteria that were exercised. On 14 October 2026, each of the 36 lines of `docs/AI/TASKS.md` was moved into a GitHub issue: 33 new issues plus updates to issues #5, #6 and #7. The file is now empty; open work is tracked only in [GitHub Issues](https://github.com/For-Hives/minemories/issues). An implemented feature stays open if criteria or validations are missing.

The repository's 38 issues, open or closed, use the existing labels. The 36 moved tasks are split into 18 `autonomous` and 18 `needs-human`, with the `mod`, `api`, `front` and `ideas` domains according to their scope. Issue #4 keeps its dependency dashboard and issue #8 stays closed. The evidence and criteria for each original line are in the body of its issue; no second local backlog is maintained.

## Completed flows

- AFK by default, pause/background and simple/advanced settings: validated by the user in a development client. Validation of the distributed JAR remains separate.
- Core/NeoForge sources and real export: startup and capture validated; the `GlbScene` crash is fixed.
- Automatic upload after pairing: AFK capture uploaded in production; without pairing, the capture stays local only.
- Real Garage: `bun run api:garage` passes eight HTTP/oRPC and storage scenarios, including a real container outage, a resume by a new API process and a crash after a legacy multipart upload, with no duplicate and with byte checks. Disposable Docker fixture, separate from the development volumes.
- Old local `dev_minio_data` volume: read-only inspection, no file and no capture bucket found. No local migration to perform. This conclusion does not cover any other deployment.

- Initial API audit: share headers without public caching, socket IP and trusted proxies, bounded in-memory limiter, limited pairing body, source-map-js fix. Remaining observations and alerts are in [the report](api-security-audit.md) and the follow-ups in [issue #66](https://github.com/For-Hives/minemories/issues/66) and [issue #65](https://github.com/For-Hives/minemories/issues/65).

- Durable deletions/purges: transactional SQLite queue, backoff, resume in a new process after a real Garage outage, and refusal to reuse pending keys. See [the validation and limits](durable-deletions.md).

- Fixed delays: thirty days for new trash entries, older deadlines preserved with at least thirty days of grace, countdown coming from the API and a sixty-day pairing cache. Persistent migration, rollback, calendar boundaries, oRPC contract and restore in the gallery tested; full build and seven Garage scenarios pass. See [the migration](trash-retention.md).

- API startup: explicit and distinct secrets, production configuration validated before SQLite, normalized origins and timers stopped on signal. Unit tests and real Bun processes with invalid/valid configuration, without real secrets. The deployment audit stays open. See [the checks and the consequences of a pepper change](api-startup-configuration.md).

- Embedded GLB resources: validation shared by legacy/resumable uploads and the viewer, external URIs refused, prevention of JSON replacement and missing buffers, limits kept. HTTP tests, real Three.js parser, local/gallery interactions, a 10 MiB Minecraft capture accepted and a Blender render inspected with its 55 PNG textures. Full build and seven Garage scenarios pass. See [the policy and limits](embedded-glb-resources.md).

- Auth/RPC/initialization JSON bodies: separate limits before parsing, oversized streams stopped even without a reliable size, cookies and tokens kept, two thumbnails close to the maximum accepted, and binary caps preserved. Tests on a real Bun server and oRPC sessions; the new middleware has 100% line and function coverage. See [the caps and their scope](api-json-limits.md).

- Per-account GLB quota: 2 GiB configurable, captures and trash, reservations for both upload kinds, objects pending deletion; concurrency, replay, outage and release after cleanup tested. Legacy upload made durable before writing, with atomic publication; crash after a 9 MiB multipart upload, Garage outage and cleanup by new processes exercised. Full build and eight Garage scenarios pass. See [the quota and the historical limits](account-storage-quota.md). Running the reconciliation in production is still tracked.

- Private storage summary: the oRPC contract and device status expose available space, total, reservations and pending deletions. The gallery explains how space is freed and that the local GLB is kept; loading, outage, refresh and late responses tested. Real sessions and Garage exercised. In Minecraft, the counter in both modes and the details screen were validated by the developer; the local fixture allows uploads up to 200 MiB. See [the fields and the flow](account-storage-quota.md#checking-available-space).

- Historical reconciliation: private inventory by key and multipart upload, a bounded plan that can be targeted by prefix, review then application after stopping the API and backing up SQLite. Existing claims are repaired only with known values; protected objects are kept and ambiguous cases require review. The durable queue then performs the deletions. Nine Garage scenarios pass; no production run is inferred from this local validation. See [the command and the flow](storage-reconciliation.md).

- Local history: distinct dated captures, migration of the existing latest export, `capture.glb`/`capture.json` compatibility copies, pagination and upload of the selected capture with its own metadata. Tests for collisions, write failure, bounded/unreadable JSON, paths, late response and upload during a new export. Minecraft 1.21.1 / NeoForge 21.1.248 exercised on an isolated copy: six real captures in the first trial, persistence after restart, then import of an old 57,016-byte capture and five new 61,300-byte terrain captures. Simple/advanced access, pages of four then two entries, back navigation, upload of the old bytes/metadata to a test HTTP API and refusal without pairing were checked; the screens were inspected visually. This does not prove production upload or the distributed JAR. See [the history and its limits](local-capture-history.md).

- Refusing empty captures: check of the chunks actually received, nothing published without geometry, latest GLB/JSON/reference kept and help messages in both modes. Core/history tests and an isolated Minecraft 1.21.1 / NeoForge 21.1.248 scenario: missing chunk, air selection, no upload and no provisional depth, then exports of BLEND water only and of loaded terrain. The messages were inspected visually. The NORMAL buffer is also tested for extreme finite coordinates, after fixing float subtractions. See [the scenario and its limits](local-capture-history.md#checking-that-empty-captures-are-refused).

Standard entities, beds and chests are now captured with their pose
and their real textures. The beta JAR was loaded on its own in Minecraft
1.21.1 / NeoForge 21.1.248: animals, equipped mobs, player, bed and
single/double chests closed then open; capture of a lone animal and AFK in the
pause menu. Blender renders and API/viewer checks pass. Specific modpack
renderers still need to be exercised. See [the validation](frozen-entities.md).


- GitHub pre-release `0.1.0-beta` published after PR #56 was merged and CI passed. The real download from the public guide has the same checksum as the JAR tested in game; compatible CurseForge profiles updated with a backup. See [the distribution](mod-distribution.md).

## Work still open


The core writer `SpoolingGlbScene` prepares bounded memory: geometry/textures/JSON on disk, a bounded cache of open files and atomic publication, with refusal of overflows, interruptions and replaced files. Tests check binary equivalence with `GlbScene`, including extreme normals; a real process with a heap capped at 32 MiB produces a 91,201,408-byte GLB. The legacy/spooled fixtures are identical and their Blender renders were inspected. PR #58 wires up progressive AFK capture: per-frame copying, bounded queue/worker, suspension, cancellations, upload throughput and capture dates. The final JAR is exercised in Minecraft, with a real loopback API and Blender renders; see [the evidence and measurements](spooling-glb.md). Issue #84 tracks this wiring; issue #79 is done with the [per-phase measurements and their corpus](afk-performance.md); specific modpack hardware/renderers stay in #91. The GitHub beta already published remains distinct from this development JAR.

Private consented diagnostics are implemented: explicit consent tied to the API/device/token, a revocable permit, bounded traces and steps, capture/upload correlation, persistent limits, retention and read-only CLI viewing/grouping. HTTP/Java tests cover refusals, identity changes, retries and late responses; two isolated Minecraft launches with a real loopback API exercised pairing, NO/YES, upload, outage, persistence, withdrawal/erasure and disconnection. The private reports were checked. Their deployment and production validation are still tracked in [issue #82](https://github.com/For-Hives/minemories/issues/82); see [the flow and limits](consented-diagnostics.md).

The remaining mod/API tasks are tracked in their GitHub issues: selection of frequently visited areas, GLB optimization, timelapse, progressive reading and performance measurements, other loaders, consented observability, Polar billing and hot/cold storage. In-game validations of production outages/resumes and of the JAR's other flows are still tracked. Gallery tests are still tracked. API coverage is now checked per file (90% of lines, 80% of functions), with a source inventory and a negative test of the real runner.

Visited depth is implemented with persistence/isolation tests and real captures imported into Blender; the full comparative surface/cave/return/other area, dimension, world, player and restart run is now [documented](exploration-depth-validation.md), with AFK disabled, full height and explicit selection verified. Dirt/stone cut faces are implemented, with tests of the limits and planes, and Blender renders of surface and depth. The water/glass/leaves/stairs control scene exported while paused confirms water faces on the cut and MASK/BLEND materials, with an inspected Blender render. Task #8 is done.

## Human actions and scope

- Issue #5: create/configure the Modrinth/CurseForge distribution projects and credentials. CI is ready; publication stays disabled by default.
- Issue #6: check/redeploy the front end and confirm that the gallery opens when authenticated. Previously grouped topics are now separate: API infrastructure [issue #66](https://github.com/For-Hives/minemories/issues/66), reconciliation [issue #65](https://github.com/For-Hives/minemories/issues/65), Nginx routing [issue #67](https://github.com/For-Hives/minemories/issues/67) and diagnostics [issue #82](https://github.com/For-Hives/minemories/issues/82).
- Logo and art direction: [issue #76](https://github.com/For-Hives/minemories/issues/76); mod mockups: [issue #62](https://github.com/For-Hives/minemories/issues/62). This work stays outside the priority mod/API implementation.


## Native upload at the 200 MiB limit

The #81 scenario is validated with the exact JAR and the real local API: pairing,
API stopped after three chunks, new API/Minecraft processes, resume at 12 MiB,
50 chunks in total, same UUID and SHA-256, intact metadata and no duplicate.
JFR allocations stay per chunk; overflow and quota are refused.
See [the evidence, the fixture and their scope](native-upload-resume-validation.md).
Validations on production profiles/deployments stay in #83.

## Frequently visited area suggestions

Issue #72 adds a local active-time score, aggregated into 64 × 64 block cells,
with five suggestions in M and `/minemories suggestions`. The bounded history is
separated by world/dimension/player; viewing the list changes neither the
selection nor capture/upload. Tests notably cover the real tick cadence, and the
JAR is exercised in game over two stays, pause, missing chunk, dimension, restart,
another world and another player. See [how it works and the evidence](visited-zones.md).


## Real public gallery and ranking

Issue #69 connects `/explore` and `/ranking` to voluntary, revocable and
moderated publication, separate from the `?demo=1` examples. Votes are unique
per account and limits are persisted; trash/restore, concurrency and
revocation before the feed responds are tested. The owner and moderators
have their controls; see [the contracts, limits and evidence](public-discovery.md).

## GLB size

Issue #73 adds adaptive indices and masking of unused atlas areas, without
extensions or changes to visible attributes. The real corpus shows a 5.86–55.87%
reduction, with preparation costs stated; the five pairs of Blender renders are
pixel-identical. Validators, boundaries, cancellations and the native JAR are
exercised. See [measurements and evidence](glb-size.md).
