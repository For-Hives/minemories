# Resumable 200 MiB upload from Minecraft

Issue [#81](https://github.com/For-Hives/minemories/issues/81) was exercised on
15 October 2026 with the distribution JAR loaded from `mods/`, three Minecraft
processes and two processes of the real API. No production account or service
was used.

## Fixture and versions

Minecraft 1.21.1 / NeoForge 21.1.248, Temurin 21.0.12.1+1 and Minemories
0.1.1-dev.1; Mesa llvmpipe OpenGL 4.6 in an isolated profile. JAR SHA-256:
`34d6bf346cfe97d869325df9282295f9a67598a7a749705e20e4ec715646068f`.
The API runs the code from main, Bun 1.4.3, Better Auth, Hono/oRPC, persisted
SQLite and the filesystem driver, on a loopback address. A test account is
created and the mod exchanges a real six-digit code through `/api/mod/pair`; the
client persists the token in its configuration file.

The file is derived from a GLB actually captured in Minecraft. Its geometry,
textures and accessors are kept; the unused BIN chunk is padded with zeros and
the buffer/container length is adjusted to reach exactly
**209,715,200 bytes (200 MiB)**. This tests the boundary of the upload
protocol; this fixture is not a measurement of building a natural 200 MiB
scene.

File SHA-256:
`783a515d3bd761be4460fe3eb09278b1e9380e2d61b804a993a42d8fcee6e2b2`.

## Interruption and restarts

1. The first Minecraft client pairs the device with the real API, then calls
   the mod's normal transport with the 200 MiB file.
2. After three 4 MiB chunks are committed, the observer sees offset
   **12,582,912**, blocks new upload requests and stops the API process. The
   client gets an error after its bounded retries.
3. The local file and its session sidecar remain. The sidecar's UUID matches
   the interrupted session in SQLite. The Minecraft client exits.
4. A new API process opens the same SQLite, the same staging area and the same
   port. A new Minecraft client keeps its pairing and resumes the same file.
5. The second process's HTTP trace shows the first `Upload-Offset` at
   **12,582,912**, then the 47 remaining chunks. The two API processes received
   **50 chunks** in total, at offsets 0, 4 MiB, …, 196 MiB.
6. Finalization keeps the same UUID and produces a single 200 MiB memory. The
   SHA-256 of the stored file is identical, as are the provided metadata
   (`worldName`, `capturedAt`, `captureStartedAt`, `captureFinishedAt`). The
   sidecar is deleted after success; the complete local GLB remains.

Verification of the stored file uses `validateUploadFile`, the same bounded
reader and validator as production finalization: headers, resources, accessor
values and checksum are read without buffering the whole BIN chunk.

## Limits, quota and allocations

A third Minecraft client attempts **200 MiB + 4 bytes**. The JAR's transport
rejects the file and creates no sidecar/remote session. The API also rejects an
initialization of that size (HTTP 400 `invalid_upload`).

The isolated account has 300 MiB. After 200 MiB are stored, initializing
another 150 MiB upload is rejected with HTTP 413 `storage_quota_exceeded`.
The rejections add neither a memory nor a session; a single published capture
remains.

Both uploads are recorded with JFR (`jdk.ObjectAllocationOutsideTLAB`, stacks
included), filtering allocations whose stack contains `ChunkedUploader`. The
largest object observed is **4,194,320 bytes**, i.e. a 4 MiB payload array
with its JVM header, before and after the restart. No 200 MiB object is
observed in these stacks. The code keeps a single 4 MiB chunk and uses a
64 KiB checksum buffer; this measurement does not describe the game's whole
heap or its renderer's allocations.

## Scope and evidence

The artifacts are local in
`~/.local/state/minemories-validation/upload-200m-verified-20261015/`: fixture,
fingerprints, HTTP log, interruption offset, session/resumption reports,
JFR/allocations, limit/quota results and process logs.
Tokens, cookies, databases, worlds, JFR recordings and GLBs are not committed.

This validation completes the mod → real API → filesystem storage path with an
API interruption and a client restart. The existing tests and CI cover real
sessions/contracts, Garage, its outage and its recovery in a new process. It
does not prove network errors of a production deployment or players'
particular profiles, which remain in #83.
