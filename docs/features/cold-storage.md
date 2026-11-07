# Archiving inactive captures

Tracks issue [#85](https://github.com/For-Hives/minemories/issues/85).
Open tracking, preview, transitions and APIs are implemented, with an optional
worker and the viewer's restoration flow. Archiving stays disabled by default.
Public classes, delays and costs are compared in
[the policy and cost estimate](cold-storage-costs.md); enabling it on a real
account is a deployment matter.

## Last real open

`memories.last_opened_at` is a SQLite timestamp in milliseconds, initially
`NULL`, including for captures that existed before the migration. The private,
shared and public GLB routes update it when the first non-empty chunk of the
stream is delivered. This is a server-side read of the file; it does not prove
that the browser finished rendering or downloaded the whole file.

An unauthorized request, a handle opened but never consumed, an empty stream or
a failure before the first chunk do not count. Authorization is checked again
before recording the open. Gallery, metadata and thumbnail accesses, and
internal conversion/reconciliation reads, do not count. A partial delivery
counts if bytes have already been delivered.

The update is monotonic, uses the creation date as a lower bound and follows
the memory row after its physical key is converted. A deleted capture no longer
receives new dates. When there has been no open, the inactivity policy must use
`created_at`; no earlier history is invented.

## Previewing eligibility

From the repository root:

```bash
bun api:archive:plan --idle-days 90 --limit 100
```

The command opens an existing, migrated database read-only. `--idle-days`
accepts an integer from 60 to 90; otherwise `COLD_STORAGE_INACTIVE_DAYS`
applies, then the value 90. `--limit` bounds the result between 1 and 1,000
objects (100 by default). The JSON contains private keys and identifiers: keep
its output in a private location. No provider access, archiving or deletion is
performed. This result is not a reservation: a worker must check eligibility
again atomically before any transition.

Selection takes the most recent creation/open date across **all** memories that
reference an object. Virtual manifest keys are not physical objects. A
deduplicated chunk is counted only once, even if it appears several times in
the same memory. Memories in the trash protect their chunks; conversions,
in-progress timelapse reads and deletion intents exclude the objects involved.
The preview does not change open dates.

Reads of original GLBs get a lease in `capture_readers`, visible to other SQLite
connections. It is renewed during the transfer and released on close,
cancellation or a storage open failure. A stream with no progress for 15 minutes
is interrupted; an expired lease cannot be renewed. The budget is 8 readers per
owner and 64 in total for originals, on top of the timelapse reader limits.

The deletion queue and reconciliation also recognize these readers: a
conversion can replace the logical key while a download keeps the original
open, without deleting that file before the stream closes. Stale leases after
an interruption are collected; deletions stay in the durable queue until then.

## Durable states and read exclusion

`object_tiers` keeps the state of each object: `hot`, `archiving`, `cold` or
`restoring`. A missing row means the object is hot. The catalog reserves an
object in an immediate SQLite transaction, checking again its exact
eligibility, all its references and active readers/conversions. The preview
limit does not restrict this check to a first batch.

Read leases check within their own transaction that the objects are hot. A
timelapse memory checks **all** its chunks before opening a stream; a single
unavailable chunk prevents the whole open, with no partially created reader. A
conversion can neither read an original in transition nor reuse a cold chunk.
In-progress archiving/restoration operations also protect their objects from
deletion and reconciliation.

Jobs have an operation generation and a 15-minute worker lease. Taking over an
expired lease does not make the object hot again: an old confirmation cannot
change the new reservation. A failure keeps the unavailable state and a retry
date in the database, with exponential backoff from 1 minute to 1 hour. A
restoration request during archiving waits for its confirmation; repeated
requests are idempotent. Restoration takes priority over a new archiving.

After a confirmed restoration, a 15-minute window prevents immediate
re-archiving before the viewer fetches the file. This window does not count as
a real open and does not change `last_opened_at`. A confirmed deletion removes
the tier metadata that is no longer needed along with its durable task.

The SQLite reservations are connected to the optional worker. Its adapter
confirms remote results, including after a lost response, before publishing a
readable state. SQLite leases cannot cancel a copy the provider has already
received. The status/restoration APIs and their display are connected to the
worker.

## Physical generations and cleanup

The logical keys of memories and timelapse chunks stay stable. A copy reserves a
new physical key in `<owner>/tiers/<uuid>.glb`, distinct from upload keys. The
reservation is persisted before writing. After the provider confirms, the
physical pointer and the new state are published in the same transaction. An
expired worker gets another key when it resumes and cannot publish the old
reservation.

This separation also protects against a remote request already received whose
response was lost: if it finishes after a restoration, it writes its old
generation, never the file that became readable again. API reads and deletions
resolve the pointer; the GLB stream keeps streaming and URLs, permissions,
metadata and thumbnails do not change. The logical quota does not count a
memory twice during a technical copy. The catalog grants only one active copy
lease at a time; transient physical costs still need to be included in the
operator's sizing.

The old copy is kept until the new one is published. It then joins a physical
cleanup queue separate from memory deletion. This distinction makes it possible
to free the old object even if its logical key is still in use. A published or
reserved generation stays protected from cleanup and from the reconciliation
inventory. Copies abandoned after a lost lease go through the orphan grace
period (24 hours). Reconciliation recognizes the `tiers` namespace in case a
late write recreates an object already removed from this queue.

The cleaner handles at most one generation per pass, keeps failures and their
retry delays in SQLite, then waits for the in-progress transfer when it stops.
Its scheduler is connected to the provider worker; no tier archiving or
physical cleanup is enabled without explicit configuration.

The tests use real files: archiving/restoration with a key change, deletion of
the original, reading through the new generation, recovery after interruption,
deletion failure and an old write finishing late. They also check that the
quota and reference cleanup stay consistent.

## Constraints for what comes next

### Availability and restoration requests

The shared contract exposes `captureStorage.status` and
`captureStorage.restore`, with owner access (memory ID), a shared link (token)
or a public publication (public ID). Authorization is re-evaluated in the same
transaction as the manifest and the restoration request. Revoked or deleted
accesses can neither read the status nor add work.

The response contains the `ready`, `archiving`, `cold` or `restoring` state,
the number of distinct physical objects that are ready and their total number,
with no key or provider details. A deduplicated chunk counts only once. The
request covers every chunk in the manifest; repeats stay idempotent and do not
change the last open. No reader starts while a chunk is still cold.
Availability describes the catalog; a storage outage remains a separate error
at read time.

The three GLB routes respond `202` with `memory_restoration_required` and
`availability` when restoration is needed, keeping
`Cache-Control: private, no-store`. Checking this state or receiving this JSON
does not count as opening the GLB. The HTTP/oRPC tests cover owners, account-less
shares, approved publications, revocation, original files and deduplicated
captures. When the provider is configured, `restorationAvailable` is `true` and
an authorized request adds the durable job; the suggested polling interval is
five seconds until the capture is ready. Otherwise this value stays `false`, an
authorized request returns `503` and no polling is announced. A test of the
configured API also walks through the real anonymous RPC of a shared link, the
SDK copies over local HTTP, the exact GLB download and the final deletion. Only
its test transport is redirected; no cloud account is used.

### Viewer flow

The owner, shared, public and timeline views recognize the 202 response before
creating a GLB file. A panel translated into French and English shows the state
and the number of ready items. The restoration button is explicit; viewing a
cold capture never starts a paid request automatically. A restoration already
in progress is followed automatically at the announced interval. Progress
counts ready objects and does not claim to measure a percentage of bytes or
announce an unverified provider delay.

Transient errors allow a new idempotent request. Revoked access ends the
tracking. Navigating or selecting another capture cancels the requests, the
pending action and the local timers; work already accepted by the server
continues. Without an active provider, the panel offers a manual check, with no
polling or restoration request. The timeline keeps its bounded reader and still
checks the exact GLB size. The tests cover the logic at 100%, the interactions,
the translations, the public links and cancellation.

### Configuration and remote processing

The configuration stays disabled by default (`COLD_STORAGE_PROVIDER=off`).
Enabling it requires an explicit choice of `aws` or `r2`, `COLD_STORAGE_CLASS`
(`GLACIER`, `DEEP_ARCHIVE` or `STANDARD_IA`; R2 accepts only the latter), and an
explicitly set HTTPS endpoint, bucket and region. This configuration enables a
pass at API startup and then every minute. Garage and local storage do not
automatically get a cold policy.

On first configuration, SQLite binds the catalog to the driver, the full URL,
the bucket, the region and the chosen policy. A pre-existing catalog without an
identity must be reconciled before this binding. Rotating credentials does not
require a migration. Changing the destination or policy requires an explicit
migration; even after the worker is disabled, a different destination blocks
API startup and reconciliation before the inventory is accessed. This protects
published generations and cleanups still pending.

`ColdStorageWorker` uses the catalog and its durable reservations, handles one
operation per pass and coalesces concurrent calls. It renews its lease during
remote calls, passes a cancellation signal and waits for the operation to end
when stopping. A provider must confirm the source is available before copying,
then check the destination size and class before returning. A restoration still
pending resumes with the durable retry delay. A copy whose response is lost
stays isolated in its generation, and its cleanup waits for the orphan grace
period. The tests cover these cases with real files, along with lease loss and
stale acknowledgements. The `S3ColdStorageProvider` adapter is now tested with
the real SDK against a local HTTP server. `ColdStorageMaintenance` ties together
selection, copies and physical cleanup: at most one object is handled per pass
and pending jobs come before a new archiving. If an old generation is still
waiting for deletion, no new archiving is selected; explicit restorations
continue. Stopping cancels the worker and also waits for the in-progress cleanup
before closing SQLite.

Stopping the API also closes the HTTP listener, waits for requests and the
periodic upload cleanup, then closes SQLite only once even if several signals
arrive. Concurrent calls to the deletion queue wait for the same bounded pass;
after it stops, no new object is deleted. A remote request already sent
completes its acknowledgement or keeps its durable retry before closing. The
tests launch the real Bun process with a suspended HTTP deletion, for a memory
and then an expired upload, and check the SQLite confirmation after two stop
signals. Objects not yet started remain to be handled at the next launch.

The adapter copies on the storage side, without downloading the GLB into the
API. It checks the size (bounded by the same limit as resumable uploads), the
owner, the reserved keys, the class and the source ETag, passes
`CopySourceIfMatch`, then requires a matching SDK result and destination `HEAD`
before publishing. Metadata is preserved and no public ACL is added. The
hot/cold classes are `STANDARD` and the explicitly chosen class. On AWS, every
preparation/copy rejects a bucket that is versioned or whose versioning was
suspended: ordinary deletions would not guarantee that old private versions are
erased. The same check precedes every AWS deletion, including abandoned uploads
and retired generations. The deletion policy comes from the persisted identity
even after archiving is disabled. A delete marker or a version ID in the
response prevents confirming the cleanup: the task persists and a memory
deletion keeps its reserved quota until it is resolved. This also covers
versioning being enabled concurrently between the check and the DELETE. R2 does
not implement `GetBucketVersioning`; this operation is not sent to it.

For Glacier/Deep Archive, `RestoreObject` requests a temporary one-day copy in
Standard mode. An accepted response or an "already in progress" conflict does
not make the GLB readable: the worker waits for a `HEAD` confirming the
restoration, with at least fifteen minutes before expiry, then copies to a new
permanent `STANDARD` generation. R2 and `STANDARD_IA` use `CopyObject`
directly. The fees and delays of this mode are detailed in
[the cost estimate](cold-storage-costs.md).

The HTTP tests also cover an XML error inside a 200 response, a lost response
after a remote write, a rejected precondition, inconsistent metadata, SDK
cancellation and a remote copy finishing after the worker stopped. That copy
stays in its unpublished generation; a retry publishes another key. These tests
do not replace validation against the real provider.

Metadata and thumbnails remain accessible. A restoration must make every needed
chunk readable before opening the GLB stream; the viewer must show the state
and progress. Transitions must be able to resume after an interruption and
reconcile with the provider, without bypassing deletion claims.

The choice of provider and classes is still to be confirmed. S3 compatibility
alone does not establish the availability of cold classes or `RestoreObject`.
Official references consulted on 15 October 2026:

- [Garage S3 compatibility](https://github.com/deuxfleurs-org/garage/blob/main-v2/doc/book/reference-manual/s3-compatibility.md):
  check which operations are actually available for the deployed version.
- [AWS S3 restoration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-objects.html):
  Glacier Flexible Retrieval/Deep Archive require a temporary restored copy;
  keeping it hot requires a separate transition.
- [AWS S3 copy](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html):
  validate the full response through the SDK; an HTTP 200 status can contain a
  copy error and is not enough to allow publishing a generation.
- [AWS S3 deletion](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html):
  a delete marker does not destroy previous private versions; the first adapter
  rejects versioned or suspended buckets.
- [AWS archival constraints](https://docs.aws.amazon.com/AmazonS3/latest/userguide/archival-storage.html):
  take minimum durations and early deletion fees into account.
- [R2 classes](https://developers.cloudflare.com/r2/buckets/storage-classes/) and
  [R2 pricing](https://developers.cloudflare.com/r2/pricing/): Infrequent Access
  charges retrieval fees and a minimum billed duration.
- [R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/):
  conditional copy operations and `STANDARD`/`STANDARD_IA` classes;
  `GetBucketVersioning` is not implemented.

No regional pricing or operating cost is assumed. The final choice must price
storage, transitions, requests, restoration, minimum duration and latency with
the account and region actually used.
