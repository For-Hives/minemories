# Durable object deletions

Permanently deleting a memory and purging the trash record the object in
`object_deletions` in the same SQLite transaction that deletes the metadata. If
that record fails, the memory and its share links are kept. After commit, the
memory disappears and its links stop working, even if storage is unavailable.

A manual deletion immediately tries to erase its object. The periodic worker
resumes jobs at startup and then every minute, with at most one hundred objects
per pass and a single pass running at a time. A failure keeps the job and its
counters; retries are spaced one, two, four, eight, sixteen, thirty-two and then
at most sixty minutes apart. The database must stay on a persistent volume.

A restart resumes the jobs that are due. A deletion that already happened can be
replayed: a crash after the S3 erase and before the SQLite acknowledgement leaves
a job that will be acknowledged on the next attempt. Starting an upload cannot
reuse a key that is still pending, so that an old job cannot erase a new capture.
The purge keeps running every hour; physical deletions can be delayed by failures
and by the number of pending jobs.

This implementation targets a single API process, like the upload locks. The
queue also refuses legacy jobs whose key still references a memory or an
incomplete resumable session, even an expired one. It keeps those jobs and their
counters for review; receipts that are already finished do not protect an object
missing from the memories. Filtering happens before the batch limit, so that a
large number of conflicts does not block other deletions. The reference is
checked again before erasing. S3 permissions must include object deletion. A
SQLite maintenance error is reported without an object key or token, and does not
stop the following passes. Jobs contain keys, dates and attempts, never a copy of
the GLB. The filesystem driver follows the same queue.

Validation: tests of transactions, owner isolation, share revocation, reuse
blocking, backoff, batch limit and no overlap. The Garage test stops the dedicated
fixture, fails the deletion in one process, restarts Garage, then runs a new
process against the same database and checks that the file is gone. No production
object is touched.

The queue covers explicit deletions, purges and, since 11 October, legacy uploads.
Each legacy upload records an intent before writing the object, protected while
the upload is in progress. Publishing and removing that intent are atomic. A crash
before publication leaves a resumable job, which also removes abandoned multipart
parts. A failure keeps the key and its reserved bytes until cleanup succeeds. An
old batch re-reads the job before erasing, to preserve an upload that was just
published. See [the quota and the Garage crash test](account-storage-quota.md).

Deletions and purges also keep the owner and size in their new jobs, to release
the quota after the physical erase. The migration preserves the due dates and
attempts of old jobs; their forgotten sizes remain unknown.

The [historical reconciliation](storage-reconciliation.md) inventories forgotten
keys, completes recoverable claims and prepares missing intents. Running it on
the real storage is still tracked in [issue #65](https://github.com/For-Hives/minemories/issues/65). Old versions in
a versioned bucket depend on the provider's lifecycle policy.

New trash entries expire after thirty days. Older due dates are protected by
[the retention migration](trash-retention.md), which also grants at least thirty
days of grace to memories that were already past due.
