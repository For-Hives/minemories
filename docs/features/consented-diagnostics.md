# Private diagnostics (on by default, can be turned off)

Since 27 October 2026, diagnostic help is **on by default** (owner decision: the mod must work without any action from the player). The mod still sends **no report before the installation is paired**. Memories and uploading them work without this option. Each API has its own authorizations; switching API or device carries over no explicit consent.

Consent is read from `config/minemories.properties` with three states:

- `diagnosticsConsent` key **absent**: diagnostics on (default consent, bound to the current identity: API, device and token);
- `diagnosticsConsent=true`: explicit consent, valid only if `diagnosticsIdentity` matches the current identity;
- any other value, in particular `diagnosticsConsent=false`: **refused**. An explicit refusal is kept when the installation is paired, disconnected or switches API. Only an explicit consent (`true`) bound to the old identity is cleared.

In Minecraft: **M → advanced settings → Diagnostics** to turn it off or back on. On pairing, a message reminds the player that diagnostics are on and how to turn them off. The server must confirm a first permit for the identity before anything is collected. This confirmed authorization is kept with the sanitized queue: after a relaunch, the same account keeps an error even if the API is temporarily offline. Every upload again requires a current server permit. Each explicit opt-in creates a `diagnosticsEpoch` (`default` while consent stays implicit): an old queue cannot come back after a withdrawal followed by new consent. Switching accounts changes the default identity, which purges the old identity's queue.

**Risk to review before release:** diagnostics on by default in a product also aimed at under-13s touch on minors' consent (GDPR, COPPA). The data stays sanitized (no messages, paths, names, coordinates or tokens) but the legal basis must be confirmed; see #89 and #156.

The client keeps at most eight operations with eight steps each, and a single last-capture correlation for its immediate upload. Other files get a new upload correlation. Pending sanitized reports are kept in `config/minemories-diagnostics.properties`, without URLs, tokens or raw logs: at most eight reports for seven days, a file capped at 128 KiB, and owner-only permissions where the system supports them. Writing uses a temporary file and an atomic rename when available. A modified queue is rebuilt field by field before any upload; free-form data and invalid/expired reports are never resent.

Only one report is in flight. 200/201 responses remove the entry; a 401/403 refusal stops collection and purges the queue. Outages and 5xx are retried on the client's one-second heartbeat, with at least thirty seconds of waiting; `Retry-After` is clamped between thirty seconds and one hour. The persistent budget limits attempts to five per hour. The same UUID is kept so the server can stay idempotent. Permanent 400/409/413/422 responses remove invalid reports; compatibility exception: a crash report refused with 400 is kept with a five-minute wait to allow the new API to be deployed. A consent that was never confirmed allows no offline collection. Every upload attempt re-reads consent before adding the diagnostic headers.

The client mixin intercepts entry into the real `Minecraft.crash`: it writes a sanitized trace to the queue before letting Minecraft produce its report and exit normally. The next launch sends this entry once the permit is confirmed. The last active operation provides the correlation and steps when an export is in progress; wrapped exceptions are reduced to their technical cause without reading their messages. A force-killed process, a native/JVM failure, an out-of-memory condition that prevents any allocation, or a crash before the hook is loaded may leave no usable trace. The mod neither reads nor sends the full `crash-reports/*.txt` files.

Switching to **OFF** stops collection, clears the local queue, cancels in-flight requests and asks the old API once for revocation/deletion, without sending a report. Late responses are ignored. If that API is unreachable or the token is already revoked, immediate deletion cannot be confirmed; its retention policy and the cleanup of revoked devices apply. If saving the withdrawal fails, diagnostics stay off in memory and a warning is shown: fix the permissions and save the withdrawal before restarting, because the old setting on disk could not be changed.

## What is kept

The mod's report contains a random ID, the date, the mod/Minecraft/loader versions, the capture/upload/pairing/crash phase, a correlation ID and a structured Java stack trace limited to twelve frames. Eight known steps with their durations locate the failure. The server only accepts a strict contract: allowed library classes, Java identifiers, `.java` file names without folders, bounded line numbers and versions.

Exception messages, URLs, tokens, local paths, world/player/server names, seeds, coordinates and capture content are not contract fields. Extra fields are rejected. The server receives neither the full Minecraft crash report nor any free-form log.

An upload that carries consent and a current permit can also produce a private diagnostic of the API error. The trace keeps only recognized API source file names, functions and line numbers; the exception message and paths are removed. Without consent, the server log records only a fixed event and a random correlation, with no raw error object.

## Authorization and withdrawal

- `POST /api/mod/diagnostics/consent`, with a paired device's Bearer and the strict body `{ "enabled": true }`, returns `{ "permit": "UUID" }`. Each opt-in replaces the previous permit, with at most five opt-ins per minute.
- `POST /api/mod/diagnostics` requires that Bearer, the `X-Minemories-Diagnostics-Permit` header, then `{ "consent": true, "report": { ... } }` matching the shared contract. The body is capped at 16 KiB, even without `Content-Length`. No read is allowed with the mod's token; only an explicitly authorized web operator session can view reports.
- Consented uploads carry `X-Minemories-Diagnostics-Consent: true`, `X-Minemories-Diagnostics-Permit` and `X-Minemories-Correlation` (UUID). These values are not free-form report data. A missing, replaced or revoked permit forbids any storage.
- `DELETE /api/mod/diagnostics` deletes the device's reports and revokes its permit in one transaction. A late report with the old permit is rejected, even after a new opt-in. Revoking a device also forbids ingestion/opt-in; cleanup removes its reports and permits.

Identity and permit are checked again inside the storage transaction. Receipts, refusals and deletions carry `Cache-Control: private, no-store`. Withdrawal does not reset the upload and opt-in limits.

## Limits and retention

Retention is counted from server receipt. Cleanup runs at startup, every hour and before/after an ingestion; no call to GLB storage is needed. When the cap is reached, older reports are evicted in a deterministic order.

| Variable | Default | Accepted range |
| --- | --- | --- |
| `DIAGNOSTICS_ENABLED` | `true` | `true` or `false` (ingestion always requires consent) |
| `DIAGNOSTICS_RETENTION_DAYS` | 14 | 1 to 90 days |
| `DIAGNOSTICS_MAX_PER_DEVICE` | 1000 | 1 to 1000 reports |
| `DIAGNOSTICS_MAX_REPORTS` | 10000 | 1 to 10000 reports in total |
| `DIAGNOSTICS_PER_HOUR` | 5 | 1 to 20 reports per device |

The hourly quota uses a persistent one-hour window starting from the first report. A restart does not reset the window. Resending the same UUID with identical content from the same device is idempotent and uses no quota; different content with that UUID is refused. Reports older than 90 days or dated more than five minutes in the future are refused. Disabling ingestion does not prevent withdrawal.

These caps bound the active data in SQLite, not the file's historical size after deletion. Operations must keep volumes, backups and logs private; no public route publishes diagnostics. An old backup keeps its old data until it expires under the operator's backup policy.

## Operator-only access

```sh
bun api:diagnostics --limit 100
bun api:diagnostics --reports --device <UUID> --limit 20
```

The command opens an existing SQLite database read-only via `DATABASE_PATH`. It creates no database and purges nothing; it remains available alongside the private console. Groups are deterministic fingerprints of the source, phase, exception class and first five frames; capture UUIDs and dates do not split groups. The detailed JSON output stays private: do not publish it automatically and never add environment secrets to it.

The mod contract lives in `packages/api-contract/src/diagnostics.ts`. The tests exercise the real HTTP handlers, free-form content refusals, authentication/revocation, stale permits, persistent limits, retention, targeted deletion and read-only access. The in-game consent/withdrawal test completes this evidence before the mod change is merged.

## Private operator console

The `/admin/diagnostics` route requires a Better Auth session and the administrator role (`user_roles` table, promoted from `/admin/users`). No environment variable designates operators. The link appears in the footer only once the role is confirmed; the route stays lazy-loaded, excluded from prerendering/sitemap and under `noindex`, including through Nginx and the Vite preview.

The `diagnostics` oRPC contract exposes `access`, `list`, `detail` and `update`. The API checks the role on every read and update, with `Cache-Control: private, no-store`. The list groups occurrences by source/phase/type/frames fingerprint and shows the real versions, occurrence/device counters, dates and the latest trace. Filters: status, phase, mod/API source and version. Pages of 25 groups and 20 occurrences. Details show the bounded traces, steps, device and correlation.

The statuses are `open` (to review), `in_progress`, `resolved` and `ignored`. A new occurrence reopens a resolved group; ignored groups stay ignored. Idempotent resends reopen nothing. Each update requires the observed revision: a new occurrence or a concurrent decision returns CONFLICT and asks for a refresh. The latest decision, its date and the operator are persisted; no issue or external notification is created automatically. Erasing a device and retention also remove groups that become empty. The migration initializes groups for existing reports.

See [activation and production validation](remote-observability-operations.md), tracked separately in [#82](https://github.com/For-Hives/minemories/issues/82).

## In-game validation

On 14 October 2026, two Minecraft 1.21.1 / NeoForge 21.1.248 launches on an isolated copy with a real loopback HTTP API exercised the flow: OFF by default, opt-in unavailable without pairing, pairing keeping OFF, normal upload without diagnostics, then a storage outage producing no report without consent. After an explicit opt-in, the API and the mod kept four technical reports with a shared correlation and the real versions. Private viewing checked the bounded traces and steps, with no free-form message, URL, path or world/player field.

Consent persists when the screen is reopened, when only the local folder changes and after a restart. Withdrawal stops collection and deletes this device's reports and permit in the fixture. A new failure stays visible to the player without being collected; upload works again once storage is restored. Disconnecting and switching API remove consent. The Diagnostics ON/OFF screens were inspected at a GUI size of 320 × 240. This local evidence does not validate a production deployment; its access, retention and viewing still need to be checked after redeploying.


On 15 October 2026, the [#108](https://github.com/For-Hives/minemories/issues/108) follow-up was exercised in three Minecraft 1.21.1 / NeoForge 21.1.248 launches, an isolated development client with a real Hono/SQLite API on loopback. The control fixture explicitly turns on its own consent, generates a technical capture failure and calls the real `Minecraft.crash`. The hook keeps the report before shutdown; the second launch sends it without new manual consent. The API then holds one capture report and one crash report, with the real versions and without the injected private sentinel strings. The capture failure is injected through the instrumented operation; this fixture does not exercise a new full world export.

The third launch withdraws consent and triggers a new controlled failure: the local queue, reports, permit and orphaned groups are erased, with no new collection. The simple screen (Diagnostics button), ON and OFF were captured and inspected at 854 × 480 pixels, GUI 427 × 240. Chromium on the web build viewed these two reports with a real operator session and saved a status; FR/EN, five widths from 390 to 1440 px, redirect to login without a session and `noindex` were checked. This evidence stays local and does not count as validation of the production deployment.
