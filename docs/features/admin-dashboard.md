# Service administration

## Admin console

Every `/admin` page shares one frame (`components/AdminLayout.tsx`): a rail on the left with the pages the account may open, and the page beside it. Pages come from the capabilities the server confirms (administrator, moderator, operator); a badge on Moderation and Health counts what is waiting. Navigating between pages fades the new one in with React's `<ViewTransition>`; sheets slide in with `motion` (both respect `prefers-reduced-motion`).

| Page | Route | Question it answers |
| --- | --- | --- |
| Pulse | `/admin` | Is the service healthy, and what needs someone today? |
| Growth | `/admin/growth` | Do people arrive, reach their first capture and stay? |
| Accounts | `/admin/users` | Who is this account, and what can I do? |
| Worlds | `/admin/worlds` | What do players capture, and where? |
| Moderation | `/admin/moderation` | What should I approve or reject? |
| Health | `/admin/diagnostics` | What breaks, for whom, and since which version? |
| Platform | `/admin/platform` | Where are the bytes, what may each role store, who changed access? |

Rules every page follows:

- **Period and comparison live in the address** (`?period=24h|7d`, `?compare=0`; 30 days and comparing are the defaults). The console loads one 1,440-hour series (`admin.summary({ hours: 1440 })`) and cuts the period and the period before it from it on the client, so changing the period asks for nothing. A previous period that predates tracking is never compared.
- **Lists open a sheet, not a page.** Accounts and Health keep the selection in the address (`?user=`, `?issue=`); arrow keys move through rows and Escape closes. Where the sheet does not fit beside the list (under 1,300 px), it slides in over the page.
- **Pressing Refresh in the header reloads the page's own data too** (`ConsoleData.loads`).
- **Derived figures are pure and tested**: `src/lib/admin-insight.ts` (windows, deltas, daily buckets, the weekday heatmap, chart paths, storage growth, error share by version, moderation keys). Components only draw them.

Figures that come from existing data only: key figures and their change, the activity series, the heatmap (uploads by UTC weekday and 2-hour slot, last 30 days), storage by state and its 90-day projection (linear, labelled as an estimate), the share of an error held by each mod version against the installed fleet (a ratio above 2 flags a regression), the moderation queue and its keys (A, R, J, K), and the role limits and audit.

Growth and Worlds read `admin.analytics` (`apps/api/src/admin-analytics.ts`, administrators only), computed from tables the service already holds, with nothing tracked for it:

- **Funnel**: accounts, verified e-mail, paired device, first capture, shared link, submitted to the gallery (each counted once per account, ever).
- **Time to first capture**: from the account's first paired device to its first capture, in six buckets and a median.
- **Retention by sign-up week**: eight Monday-to-Sunday (UTC) cohorts; an account is active in a week with a login (a Better Auth session still held), an upload, or a paired device last seen. Expired sessions are gone, so every rate is a minimum.
- **Concentration**: the share of live bytes held by the top tenth of accounts, the Gini index and the Lorenz curve.
- **Worlds**: biomes, dimensions, server or singleplayer, capture sizes and the median, from `metadata_json`. Coordinates, seeds and world names are never returned. A server is named only when at least two accounts captured it, and only the five biggest are listed.
- **Publication funnel**: live captures, shared by link, submitted, approved, voted, and with five votes or more.

**Request counters** (`apps/api/src/request-counters.ts`, shown on Platform): one Hono middleware counts every finished request by fixed label into `request_counters` (hour, kind, key, count, summed duration). Stored: mod downloads by target id (a successful `GET /downloads/<target>/...` only), requests and server errors (5xx) by API group (`rpc`, `auth`, `mod`, `public`, `memories`, `downloads`, `github`, `roadmap`) with their mean time, and pairing outcomes (`done`, `rejected`, `limited`). Never stored: a path, a query, a token, an address, an account. Rows older than 70 days are deleted; the panel reads 30 days of downloads and 24 hours of the rest. Counting starts when this version is deployed, and the date is shown.

## First administrator

On the API server, with its real database and environment, run:

```sh
bun api:admin --email existing-account@example.com
```

`DATABASE_PATH` must point to the existing database. The command refuses a missing database and an unknown account; it creates neither an account nor a password. It is idempotent and logs the first grant. At the owner's request, a temporary bootstrap holds their address on the server side (TODO #125). At startup, it promotes the existing account once and keeps a persistent marker: no account creation, no sign-up hook, and no re-grant after a demotion or after the account is recreated. If the account does not exist, it creates nothing; a later restart can initialize the account once it exists. This temporary exception must be removed once operator access is confirmed. On a server without a shell, `ADMIN_BOOTSTRAP_USER_IDS` (comma-separated account IDs, the same ones as `DIAGNOSTICS_OPERATOR_IDS`) promotes each existing account once at API startup; the ID is remembered, so a restart never undoes a demotion, and an account not yet created stays pending. Unlike an email address, an ID cannot be claimed by someone else. This local command is not exposed over HTTP. Running it against a test database does not change permissions on the deployed site.

## User list and storage

`/admin/users` lists every account (25 per page, search by name, email or ID, role filter). Sorting (`sort`: `registered_desc` by default, `registered_asc`, `storage_desc`, `storage_asc`) is optional in the contract: an older client that does not send it gets the historical order, and the fields added to the output do not break existing readers.

For each account, the procedure returns metadata only: ID, name, email, role, sign-up date, number of captures and devices, and three byte counts: `usedBytes` (what counts against the quota), `reservedBytes` (unfinished or abandoned uploads) and `pendingDeletionBytes` (objects awaiting deletion), plus `storedBytes` (captures only, trash included). Never content, file names, object keys, private links or tokens. Each account also carries its own `quotaBytes`: the largest limit among the roles it holds ([limits by role](account-storage-quota.md#limits-by-role)). The response exposes a top-level `quotaBytes`, the base limit of the `user` role (its configured value, otherwise `ACCOUNT_STORAGE_BYTES`, 2 GiB by default), and `overview`: number of accounts, total bytes used, and accounts at 90% of their own limit or more, computed over all accounts regardless of filter and page.

Usage comes from `ACCOUNT_USAGE_SQL` (`apps/api/src/storage-quota.ts`), the same rule as `accountStorageSummary` and the quota check on upload: captures + upload reservations + pending deletions. A single aggregated query (`GROUP BY user_id`) is joined to the page, with no per-account loop; sorting by used space relies on that same join. Each account's limit comes from the same SQL expression as the upload check (`accountLimitSql` in `apps/api/src/role-storage.ts`), evaluated in the page and overview queries. The sort order is picked from a fixed table of clauses; nothing is interpolated from the request.

For each account, the interface shows a progress bar (`role="progressbar"`, `aria-valuenow`, full `aria-valuetext`) measured against that account's own limit, the “used / quota” text, the percentage, the exact byte count, a “Near quota” (≥ 90%) or “Quota reached” label, and the reserved/pending-deletion breakdown when non-zero: color is never the only signal. Sizes use decimal units (kB, MB, GB) written by `Intl.NumberFormat` for the current language (`src/lib/bytes.ts`), so 2 GiB displays as roughly 2.15 GB. On phones, the table becomes a list of cards. Promotion and demotion keep their flow (password, audit, last administrator protected); the dialog names the target account, and the list, metrics and log are reloaded after success. The header line shows the base quota per account. Quotas are changed per role, never per account, and no impersonation is offered.

## Storage by role

Below the account table, “Storage by role” lists each role of `storageRole` (`packages/api-contract/src/account-roles.ts`) with its holders (every account for `user`, the administrators for `admin`) and its limit: the configured value, “server default” when `user` has none, or “Not set” for another role, with the limit its holders actually get. “Change the limit” opens a dialog (modelled on the role dialog: native modal, labelled title, Escape closes unless saving) taking a size in decimal GB, decimals allowed (`0.5` or `0,5`), above 0 and up to 1000 GB; parsing lives in `src/lib/storage-limits.ts`. An invalid value is announced (`role="alert"`) and focus returns to the field; a server failure shows a generic message. “Reset to default” removes a configured limit. After a save the whole dashboard is reloaded, so the role table, every account's limit and the near-quota count change together.

`admin.storageRoles` returns `{ role, limitBytes, effectiveBytes, accounts, updatedAt }` per role. `effectiveBytes` is what an account holding `user` and that role gets: the larger of the base limit and the role's limit. `admin.setRoleStorage({ role, quotaBytes })` takes a positive integer of bytes up to 1e12, or `null` to remove the limit; both the contract and the server reject anything else (`BAD_REQUEST`), and the actor is stored in `updated_by`. Unlike role changes and account deletion, it asks for no password: it grants no access and deletes nothing. The operator MCP has the same two operations (`list_role_storage`, `set_role_storage`).

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
