# Legacy storage reconciliation

`bun run api:reconcile` prepares an inventory of complete objects, abandoned
multipart uploads and old deletion jobs. It reads their metadata from the API's
configured storage: Garage/S3 or filesystem. GLB files stay in their storage
during this preparation.

The command uses the same `.env` and working directory as the API.
`DATABASE_PATH` must point to an existing database, already migrated by the
current API version. Path errors prevent any SQLite creation.

## Prepare and review the plan

From the repository root:

```sh
bun run api:reconcile --plan /private-path/inventory.json
```

The JSON file is created with mode **0600** and holds a version, its date, the
SQLite target, the storage identity and the observations for each key. The
terminal shows only the counters. Creation refuses to overwrite an existing
file. Keep the plan in a private folder, since it contains account identifiers
and object keys.

The budgets are **50,000 examined records** (objects, uploads and jobs combined)
and **32 MiB** per plan. For a larger inventory, prepare one plan per owner:

```sh
bun run api:reconcile --plan /private-path/owner.json --prefix account-id/
```

S3 listings are paginated; multipart listings keep both markers. An error, a
cyclic pagination or duplicates abort the inventory. The filesystem driver
rejects symbolic links and paths leaving its volume.

| Proposal | Handling |
| --- | --- |
| `protected` | A memory or an incomplete upload still references the key, even if its session has expired. A contradictory job is kept for review. |
| `review` | The key, the owner or the job data are ambiguous or inconsistent. |
| `recent` | The object or at least one multipart upload for this key is less than 24 hours old. |
| `queue` | An old orphan, with a generated `owner/UUID.glb` key and a known owner, is proposed for the durable queue. |
| `repair` | An old job can recover its missing owner or size, or the cleanup of its multipart uploads. |
| `unchanged` / `gone` | The known data are already complete, or the object has disappeared. |

Owners are recognized from the accounts, devices, memories or sessions recorded
in SQLite. The recovered size comes from the complete object. When only
multipart parts remain, the original GLB size cannot be recovered: the plan
keeps `null` and says so in its reason. When neither the object nor any
multipart upload exists, a size of zero can be recovered.

## Apply offline

Stop the API process and review the plan's proposals before applying:

```sh
bun run api:reconcile --plan /private-path/inventory.json --apply --api-stopped --backup /private-path/before-reconciliation.sqlite
```

`--api-stopped` attests that the API is stopped; the deployment targets a single
API process. Applying checks the SQLite path and the storage identity, then
creates a full SQLite backup with mode **0600** under a new name. This backup
covers the metadata; keeping the GLBs depends on the object storage.

Each approved candidate is inspected again. The ETag, size, modification date at
HTTP precision and multipart uploads are compared with the plan's observations.
Garage returns milliseconds in LIST but seconds in the `Last-Modified` header;
the comparison respects that precision. The filesystem fingerprint also includes
the inode and the precise file date.

SQLite references and jobs are then re-read in an `IMMEDIATE` transaction.
Changed items are skipped; a protected, recent or review proposal stays
excluded. Replaying the same plan does not re-enqueue its jobs. A mutation error
rolls back the whole transaction.

New intents use `discard_upload=1`. Repairs fill in only the missing fields and
keep the original attempts, deadlines and dates. Physical cleanup is performed
by the [durable queue](durable-deletions.md) when the API restarts, with its
backoff and its protection of captures that are still referenced. Review the
ambiguous cases before resuming maintenance. A backup or inspection error
prevents applying; verify a backup copy before using it for a restore.

## Scope and verification

The inventory covers the current version of objects and their multipart
uploads. Old versions in a versioned bucket follow the provider's policy. Old
MinIO volumes must be targeted explicitly in their configuration.

Tests: plan validation and size, invalid UTF-8 and truncated JSON, private
files, missing DB, restorable backup, references that appeared after the
inventory, modified object, replay, rollback of the second change and retries
being preserved. The real Garage scenario keeps an active capture, completes an
old job, deletes its fixture's orphans and aborts their multipart uploads.
Upload and deletion failures and recoveries are still covered by the other
scenarios. No production data is used by these tests.
