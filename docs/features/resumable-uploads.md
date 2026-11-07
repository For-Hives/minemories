# Uploading large captures

The mod uses a sequential, resumable upload of up to **450 MiB** (471,859,200 bytes). Each request carries at most **4 MiB**.
The old `POST /api/mod/memories` stays available for old clients, with its
100 MiB limit. Deploy the API before the new mod.

## Usage

After pairing, `/minemories upload` behaves as before. Sending, SHA-256
computation and file reads run off the game thread. Only one upload can run at
a time in the mod; AFK snapshots use the same client.

Each request gets at most three attempts, spaced 1 then 2 seconds apart, for
network errors and 408, 429, 5xx or `409 upload_busy` statuses. A permanent
error, including 401, is reported immediately. After a lasting interruption,
running `/minemories upload` again resumes from the last offset confirmed by the API.

The `capture.glb.upload.properties` file, next to the GLB, keeps the session
identifier, the SHA-256 and the recipient's identity (a fingerprint of the API
and the token, without storing the token itself). It is deleted after final
confirmation. A modified file or another account/API creates a new session. A
change during upload makes the checksum fail; do not re-export the same file
while it is being transferred. An expired session can be started over.

## HTTP protocol

Every route requires `Authorization: Bearer <deviceToken>` and belongs to the
**paired device**, not just its account.

| Method and route | Content / result |
| --- | --- |
| `POST /api/mod/uploads` | JSON `{ id: UUID, size, sha256, metadata }`. Idempotent creation or resume with `offset`, `chunkSize`, `completed`, `expiresAt`. |
| `GET /api/mod/uploads/:id` | Persistent offset and session status. |
| `PUT /api/mod/uploads/:id` | Binary `application/octet-stream` body, `Upload-Offset` header. 4 MiB chunk, except the last one. |
| `POST /api/mod/uploads/:id/complete` | Checks the size, the GLB container and the SHA-256, then stores and publishes the capture. Replayable without duplicates. |
| `DELETE /api/mod/uploads/:id` | Cancels an incomplete session; a capture already published is kept. |

A replayed chunk is compared with the bytes already written. Different content
or an offset jump is rejected. The offset is confirmed only after the file has
been written and synced. An existing session keeps the metadata it was created with.
The GLB JSON is limited to 4 MiB and the number of GLB chunks to 64; the BIN
payload is never loaded in full for validation.

## Storage and deployment

Sessions are persisted in SQLite (`mod_uploads`) and their temporary files
under `UPLOADS_PATH`. Without configuration, this folder sits next to the
database, in `uploads`. **Keep the database and this folder on a shared
persistent volume** to resume after a restart. This implementation targets a
single API process using that volume; in-memory locks do not coordinate several replicas.

Limits: two incomplete sessions per device, 128 globally, 2 GiB of declared size
reserved for temporary files and four concurrent mutations/finalizations.
Sessions expire after 24 hours. Cleanup runs at startup, every hour and on
initialization. It removes temporary files and S3 objects/parts abandoned after
a storage attempt; unavailable storage keeps the session for a later cleanup.

A [per-account GLB quota](account-storage-quota.md), 2 GiB by default and
configurable with `ACCOUNT_STORAGE_BYTES`, comes on top of global staging. It
shares the budget across all devices, legacy and resumable uploads, the trash
and pending deletions. Exceeding it returns `storage_quota_exceeded`
(HTTP 413); a reservation already obtained is not charged twice on replay
or finalization. Space is released only after successful cleanup.

Finalization streams the file to S3 with **8 MiB** SDK parts, sent one at a
time with AWS SDK v3. Durable cleanup walks every page of multipart uploads and
aborts only those for the exact key. Mod → API chunks stay at **4 MiB**. See
[S3 storage](storage-s3.md). Private and shared download routes also use
streams. GLBs and metadata reachable through a share link carry
`Cache-Control: private, no-store` so a public cache cannot keep serving them
after revocation. A capture becomes visible only after storage finalization and
the SQLite transaction. After a crash between those two steps, a new
finalization replaces the object reserved for that session, then confirms the same capture.

The bucket must allow multipart operations (create, list uploads/parts,
complete, abort) in addition to object read/write/delete. Plan space for
temporary files and final storage; in filesystem mode, the final copy can
temporarily double the space taken by a capture. Configure the reverse proxy
to accept a 4 MiB request and to wait for S3 finalization (five-minute client
timeout). Bun accepts 100 MiB per request to keep the old endpoint working; new
chunks stay limited to 4 MiB.

## Checks

- `bun api:check`: routes, isolation between devices, replay, quotas, expiry,
  checksum, resume in a new process and temporarily unavailable storage.
- The API test assembles and finalizes a 200 MiB GLB in 50 chunks without buffering the whole file.
- `storage-stream.test.ts` runs the real S3 SDK against an HTTP fixture and
  checks the 8 MiB parts, their signed SHA-256 and cleanup after a part is
  refused. A source that holds back its end until the first part is received
  proves that sending starts before the whole file is read. This is not a real
  Garage test.
- `ChunkedUploaderTest` checks bounded retries, sidecar resume, permanent
  errors and invalid offsets.
- An HTTP smoke test of the Java client with `-Xmx64m` transferred and finalized
  200 MiB on the API with filesystem storage (a single capture published).
- `bun run build` checks and builds the web app, the API and the NeoForge JAR with JDK 21.
- `bun run api:garage` validates real storage, its outage and recovery, as well
  as resume after an API process restart, without duplicates.
- The native Minecraft flow at 200 MiB, cut off after 12 MiB and resumed after a
  client/API restart, is [validated and documented](native-upload-resume-validation.md):
  a single complete memory is stored, with identical checksum and metadata.

## AFK captures

AFK is on by default: five minutes of inactivity, at most one capture every
four hours and a 32-block radius. A saved opt-out is respected. The AFK button
is in the simple menu; delays and radius are configurable in advanced mode.

The capture can trigger while paused and when Minecraft does not have focus.
A paired player uploads the capture automatically; without pairing, it stays
local. AFK does not replace the GLB while an upload is already running. Errors
stay in the local Minecraft log; no remote collection is added.

For a short test, temporarily set both delays to one minute in the advanced
settings, then restore the values you want. Check a paired account, an
unpaired account, AFK OFF, returning movement, pause and an unavailable API.
Pause behavior and settings were validated on the development client; the
distributed JAR and upload resume after an outage still need to be exercised in game.

## 450 MiB cap

On 16 October 2026, the API test finalizes a 471,859,200-byte GLB sent in 113 requests of at most 4 MiB; the last chunk holds 2 MiB. One byte above the cap is refused at initialization. Validation reads stay streamed. The full suite includes quotas, resume and storage errors.

Older SQLite databases are migrated in a transaction: reservations, pending references and published references are kept, and their size and chunk-count constraints are raised. The test also runs a second migration with no changes and checks foreign keys. The viewer's timeline player accepts the same cap. The historical 200 MiB evidence above still applies to its respective versions.
