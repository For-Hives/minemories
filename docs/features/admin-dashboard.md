# Service administration

The `/admin` dashboard shows the sections available to the account (accounts and roles, moderation, diagnostics); the accounts and metrics panel lives under `/admin/users`. It is reachable from “My account” once the server has checked the permissions. It shows finalized volumes in decimal GB per hour, sign-ups, 24-hour, 7-day and 30-day periods, a paginated account search with a role filter, storage and activity counters, and the 50 most recent role changes. Hours are grouped in UTC. Administrator rights grant no additional access to private files.

## First administrator

On the API server, with its real database and environment, run:

```sh
bun api:admin --email existing-account@example.com
```

`DATABASE_PATH` must point to the existing database. The command refuses a missing database and an unknown account; it creates neither an account nor a password. It is idempotent and logs the first grant. At the owner's request, a temporary bootstrap holds their address on the server side (TODO #125). At startup, it promotes the existing account once and keeps a persistent marker: no account creation, no sign-up hook, and no re-grant after a demotion or after the account is recreated. If the account does not exist, it creates nothing; a later restart can initialize the account once it exists. This temporary exception must be removed once operator access is confirmed. On a server without a shell, `ADMIN_BOOTSTRAP_USER_IDS` (comma-separated account IDs, the same ones as `DIAGNOSTICS_OPERATOR_IDS`) promotes each existing account once at API startup; the ID is remembered, so a restart never undoes a demotion, and an account not yet created stays pending. Unlike an email address, an ID cannot be claimed by someone else. This local command is not exposed over HTTP. Running it against a test database does not change permissions on the deployed site.

## User list and storage

`/admin/users` lists every account (25 per page, search by name, email or ID, role filter). Sorting (`sort`: `registered_desc` by default, `registered_asc`, `storage_desc`, `storage_asc`) is optional in the contract: an older client that does not send it gets the historical order, and the fields added to the output do not break existing readers.

For each account, the procedure returns metadata only: ID, name, email, role, sign-up date, number of captures and devices, and three byte counts: `usedBytes` (what counts against the quota), `reservedBytes` (unfinished or abandoned uploads) and `pendingDeletionBytes` (objects awaiting deletion), plus `storedBytes` (captures only, trash included). Never content, file names, object keys, private links or tokens. The response also exposes `quotaBytes` (`ACCOUNT_STORAGE_BYTES`, 2 GiB by default) and `overview`: number of accounts, total bytes used, and accounts at 90% of the quota or more, computed over all accounts regardless of filter and page.

Usage comes from `ACCOUNT_USAGE_SQL` (`apps/api/src/storage-quota.ts`), the same rule as `accountStorageSummary` and the quota check on upload: captures + upload reservations + pending deletions. A single aggregated query (`GROUP BY user_id`) is joined to the page, with no per-account loop; sorting by used space relies on that same join. The sort order is picked from a fixed table of clauses; nothing is interpolated from the request.

For each account, the interface shows a progress bar (`role="progressbar"`, `aria-valuenow`, full `aria-valuetext`), the “used / quota” text, the percentage, the exact byte count, a “Near quota” (≥ 90%) or “Quota reached” label, and the reserved/pending-deletion breakdown when non-zero: color is never the only signal. Sizes use decimal units (kB, MB, GB) written by `Intl.NumberFormat` for the current language (`src/lib/bytes.ts`), so 2 GiB displays as roughly 2.15 GB. On phones, the table becomes a list of cards. Promotion and demotion keep their flow (password, audit, last administrator protected); the dialog names the target account, and the list, metrics and log are reloaded after success. No quota change or impersonation is offered.

## Usage insights and account deletion

`admin.insights` (administrators only, read-only) adds three cards without any new tracking:

- **Versions in use**: Minecraft, mod loader and Minemories versions, counted once per device from its latest consented diagnostic report (`versions` in the report). It therefore only covers devices that sent diagnostics; a device whose consent is refused or whose reports expired is absent. Values are capped to the eight most common.
- **Shared links**: links created, active, revoked, world links, links opened at least once, total openings and the most opened links (snapshot name and owner, never the token). Openings are counted in `share_links.open_count` / `last_opened_at` when the link's page metadata is first requested; moving between snapshots of a world link (`?snapshot=`) does not count again. No visitor identity, IP address or user agent is stored.
- **Most active accounts**: over the last 30 days, score = logins (sessions created) + 3 × snapshots uploaded + 2 if a paired device was seen. 15 or more is "Very active", 6 or more "Active", otherwise "Occasional". Sessions are only counted while Better Auth still holds them, so the login figure is a lower bound.

`admin.deleteUser` deletes another account after the administrator re-enters their password (same confirmation and limit as role changes). It refuses the administrator's own account (`SELF_DELETE`) and any administrator account (`ADMIN_ACCOUNT`: remove the role first). In one transaction it queues every capture, timelapse frame and chunk object in `object_deletions` (the durable queue removes the files), then deletes the account's captures with their share links and publications, timelapse readers and leases, devices (and their diagnostics), pairing codes and upload reservations, records the action in `admin_account_deletions`, and deletes the user (Better Auth sessions, credentials and billing rows cascade). Unfinished multipart uploads are left to storage reconciliation.

## Permissions

Roles are stored in SQLite and re-read on every request: a demotion takes effect immediately. Each promotion or demotion requires the signed-in administrator's current password, with the same session check and the same limit of eight confirmations per minute as the account settings. The server re-checks the role inside the write transaction; the last administrator cannot be demoted. The role and its audit entry are committed together. The panel requires a session and stays excluded from public prerendering and from crawlers.

## Metrics

SQLite triggers aggregate sign-ups and capture publications within their originating transaction. An incomplete upload, a rollback, a resume or a repeated finalization call does not double count. Converting an existing capture does not count as an upload. A later deletion keeps the historical volume. These are finalized captures and their logical size, not network traffic, abandoned attempts or a provider bill.

Tracking starts when this version is installed: no past series is rebuilt from captures that may have been deleted. Earlier hours are flagged as having no history; the first hour and the current hour are partial. Current counters separate captures and trash, pending deletions, upload reservations, unexpired sessions, paired devices, approved publications and cold/restoring objects. The aggregates store no client events and no IP addresses. Better Auth ISO dates are normalized for display and session expiry.

## Validation

Tests cover transactions, search and pagination, last-administrator protections, bootstrap, resumed publications, rollback and history retention. HTTP flows use real Better Auth sessions and the oRPC contract; they also check that an administrator cannot download another account's private file. Interaction tests cover denied access, filters, periods, pagination and role confirmation.
