# Per-account storage quota

The API caps the GLB bytes allocated to an account. The default limit is
**2 GiB**, i.e. 2,147,483,648 bytes. `ACCOUNT_STORAGE_BYTES` changes it at
startup; the value must be a positive integer that JavaScript can represent
exactly. An invalid value stops the API before SQLite is opened. This technical
limit does not define a commercial offer or a subscription.

For a given owner, the total adds up:

- finalized captures, including those in the trash;
- the declared sizes of unfinished resumable sessions, even expired ones, as
  long as their cleanup has not succeeded;
- the bytes of in-progress or abandoned legacy uploads;
- objects whose physical deletion is still pending.

All devices paired with the account share this total. Other accounts keep their
own budget. Receipts of already finished sessions are not counted twice. The
limit applies to GLBs; SQLite metadata, thumbnails and multipart storage
overhead are not GLB bytes. The global temporary staging quota remains separate.

## Reservation and publishing

Both endpoints reject an extra allocation that would exceed the limit with HTTP
413 and `{"error":"storage_quota_exceeded"}`. Reaching the limit exactly is
still allowed. Per-file limits do not change: 100 MiB legacy, 450 MiB resumable
and 4 MiB chunks.

A resumable initialization checks the budget before creating the staging file,
then checks it again in an `IMMEDIATE` SQLite transaction when registering the
session. This second check covers a legacy upload that arrived while disk
operations were pending. A rejection at that point removes the temporary file.
Replaying the same initialization returns its receipt without a new allocation.

Finalization converts the reservation into a capture in a single transaction.
Replaying it adds no bytes. A legacy reservation that already puts the account
over the limit cannot be finalized until space is freed; existing captures stay
accessible. Changing the limit causes no additional automatic deletion.

Before anything is sent to storage, the legacy endpoint records a cleanup intent
with the key, the owner and the byte count in `object_deletions`. That record
and the quota check are transactional: two simultaneous uploads cannot reserve
the same available space. The queue ignores this intent while the upload is
active in the current process. Publishing the memory and removing the intent
form another atomic transaction. A crash before publishing therefore keeps a
known key, its reserved bytes and a cleanup to resume.

After a failure, the legacy endpoint releases its in-memory protection and tries
to clean up the object and the abandoned multipart parts. An outage keeps the
intent, its quota and its retries. A new process resumes the queue; it re-reads
each job before deleting so an old batch cannot delete an upload that has just
been published.

## Freeing space and migrating

Moving a capture to the trash or restoring it does not change the total.
Permanent deletion or purging moves its bytes to the deletion queue in the
transaction that removes its metadata. The space becomes available again after
physical deletion and SQLite acknowledgement. During an S3 outage, this delay
prevents bypassing the quota with a series of deletions and uploads. Cancelling
or expiring a resumable session follows the same principle: its reservation
stays until cleanup succeeds.

The migration adds `user_id`, `size` and `discard_upload` to existing jobs,
without resetting their deadlines or attempts. Old jobs whose size and owner
were already lost still need cleaning, but they can be completed after
reviewing the inventory with [storage reconciliation](storage-reconciliation.md),
when their attribution and exact size are recoverable. Legacy objects without
metadata and old versions in a versioned bucket also stay outside this
inventory. Follow-ups remain in
[issue #65](https://github.com/For-Hives/minemories/issues/65); no production
objects are scanned or deleted.

The deployment targets a single API process, like resumable sessions. Keep
SQLite and staging on their persistent volumes, and allow the multipart
operations needed for cleanup. The gallery shows this information. The
Minecraft client also shows the space and a specific quota message. Readability
of the simple/advanced modes and of the details was confirmed in game. The local
capture is kept after an upload is rejected.

## Checking available space

The oRPC contract provides `account.storage()` for an authenticated web session.
`GET /api/mod/status` provides the same `storage` object with a valid device
token. The owner is derived from the session or token; no input lets a caller
choose another account. Responses carry `Cache-Control: private, no-store`; this
header is also applied to the other private RPC responses.

| Field | Meaning, in bytes |
| --- | --- |
| `usedBytes` | Total of captures, trash, reserved uploads and pending deletions. |
| `limitBytes` | Limit configured on this API. |
| `availableBytes` | Reservable space, never below zero, even for a legacy account over the limit. |
| `reservedBytes` | Incomplete resumable sessions and unpublished legacy intents, including their cleanup after a failure. |
| `pendingDeletionBytes` | Permanently deleted or purged captures whose object is still waiting to be erased. |

The summary is computed in a single SQLite query, without reading GLBs or
querying the bucket. A per-owner index backs the cleanup queue. Old jobs with no
size/owner stay out of the summary, as they do from the quota.

The gallery refreshes the summary along with its captures every twelve seconds
and after its actions. It shows the available space, the permanent deletion
needed to free the trash, the reservations and the deletions still in progress.
A full quota reminds the user that a rejected upload keeps the local GLB. When a
refresh fails, the previous figures are removed and an unavailability message
is shown; captures stay accessible. An old slow response, successful or failed,
does not replace a newer summary. Closing the page invalidates responses still
pending.

## In Minecraft

The simple mode shows a free-space button (`… / …`) once the account is linked.
It opens the storage details; the advanced mode offers `Gallery storage` next to
the AFK settings. The details show free space, total used, reserved uploads and
deletions still pending, with the actions to free space in the gallery. Displayed
units (kB, MB, GB…) are decimal. The limit comes from the configured API,
including a self-hosted API.

The status is requested in the background every twelve seconds while the menu
is open, then after an upload or a settings change. No status is requested
without a token. Closing, switching mode or switching account invalidates old
responses; an error removes the old figures. An old API without a `storage`
field remains usable for capturing and uploading, with storage shown as
unavailable. A rejected token asks the player to link the account again.

An HTTP 413 identified by `storage_quota_exceeded` shows that there is not
enough space, that the local GLB is kept and that permanent deletion from the
trash is needed, then `/minemories upload` to retry. This rejection is not
retried automatically and keeps the local session identifier for a resume.
Any other HTTP 413 keeps its generic HTTP message. JSON responses for status,
pairing and upload are limited to 16 KiB of received bytes, even without
Content-Length; GLB upload bodies and their limits are unchanged.

This interface is built and tested automatically. On 11 October 2026, the
tester confirmed that both modes and the details are readable in the isolated
development client. The first rejection on the full fixture kept the GLB and its
resume file in the local folder; the resume to the real local API then succeeded.

The first local fixture simulated a full gallery without receiving GLBs. It was
replaced by the repository's API, with SQLite and filesystem storage in the
isolated test folder, a dedicated account and a **200 MB** quota (200,000,000
bytes). The test client's link remains usable. A 13,628,224-byte capture sent
from Minecraft was finalized; downloading it with an authenticated web session
returns the same bytes as the local GLB. The summary reports 186,371,776 bytes
available, with no pending reservation or deletion. This local test does not
validate a production deployment or the distributed JAR installed in a player
profile.

## Checks

- Boundary tests, isolation between owners/devices, reservations and trash
  added together, invalid numeric values, migration and replay.
- Concurrent legacy/legacy and legacy/resumable requests: a single allocation at
  the boundary, no rejected staging left behind, no double counting on publish.
- Deletion, purge and expiration with a cleanup failure: bytes kept until
  acknowledgement; recovery after reopening SQLite.
- Real Garage test: a process is interrupted just before a memory is recorded,
  after a 9 MiB legacy multipart upload. The stored GLB is compared byte for
  byte, the fixture is stopped, cleanup fails in a new process, then succeeds
  after Garage restarts in another process.
- `bun run build` including `bun check`: 93 API tests pass, 64 web tests pass,
  Gradle and distributed JAR built. The quota and the queue have 100% line and
  function coverage. `bun run api:garage` passes its eight real scenarios.
- Real HTTP/oRPC sessions: anonymous access rejected, isolation between
  accounts, identical summary on the device side, private no-cache headers.
  Contract tested on invalid quantities; gallery interactions covering loading,
  full quota, refresh, outage and late responses.

- Mod: thirteen new tests, including real authenticated HTTP requests, exact
  limit/multibyte, old API and rejected connection, invalid quantities, late
  responses and applying results on the client thread. A quota rejection checks
  a single attempt, unchanged local bytes, a resume file without a token and
  replaying the same identifier after space is freed.

No GLB format change.
