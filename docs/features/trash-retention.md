# Memory recovery windows

Moving a memory to the trash now keeps it for thirty 24-hour days, i.e.
2,592,000,000 ms. The deletion date and the deadline are stored together in
`deleted_at` and `purge_after`. Restoring the memory clears both dates; moving
it back to the trash afterwards starts a new window.

The previous conversion used `3_600_1_000` for one hour, i.e. 36,001,000 ms
instead of 3,600,000 ms. It produced a retention of about three hundred days.
The migration does not shorten a recovery period already granted: for each
memory already in the trash, it keeps the later of two dates: its old deadline
or thirty days after the migration. A memory whose old deadline has passed
therefore gets at least thirty days of grace. Some older memories still show
more than thirty days remaining.

The column and the deadlines are added in a single SQLite transaction. A failure
rolls everything back; a restart after success does not extend the deadlines.
Active memories keep a null deadline. The fallback for a trashed row with no
deadline is `deleted_at + thirty days`.

`memories.listTrash` returns `purgeAt`, used by the site's countdown. This field
is optional in the contract so an older API is still accepted; the web fallback
is then thirty days after `deletedAt`. Deploying the migrated API before the
front end makes the protected deadlines of old captures display correctly.
The purge checks deadlines at startup and every hour. Physical erasure follows
[the durable deletion queue](durable-deletions.md) and can be delayed by a
storage outage.

The web cache of the pairing badge keeps its intended duration of sixty 24-hour
days. This fix changes neither the five-minute pairing codes nor the device
tokens.

Validation: migration of a persistent old database then reopening, rollback and
recovery after an SQL error, protection of old dates, purge at the deadline,
restore and re-trash, owner isolation, the real oRPC contract and the countdown
with restore from the gallery. Tests use durations and calendar dates that are
independent of the production constants. `bun run build`, `bun web:check` and
the seven `bun run api:garage` scenarios pass.
