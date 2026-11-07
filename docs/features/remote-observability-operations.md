# Enabling remote observability for the mod

How it works and which fields are sent is described in [Private, consented diagnostics](consented-diagnostics.md). The functional follow-up is tracked in [#108](https://github.com/For-Hives/minemories/issues/108); deployment and its evidence remain [#82](https://github.com/For-Hives/minemories/issues/82).

## API configuration in Coolify

First deploy the API that contains the `crash` contract, the group migration and the operator oRPC routes, then the web app and the JAR. The release workflow stays independent from the web deployment. The new API still accepts reports from older mod versions. A new mod keeps and retries crashes rejected by an older API, within the limits of its queue.

API runtime variables:

```dotenv
DIAGNOSTICS_ENABLED=true
DIAGNOSTICS_RETENTION_DAYS=14
DIAGNOSTICS_PER_HOUR=5
DIAGNOSTICS_MAX_PER_DEVICE=1000
DIAGNOSTICS_MAX_REPORTS=10000
```

Console access is restricted to administrators (`user_roles` role, promoted from `/admin/users`): there is no ID list to configure. Ingestion is on by default but collects nothing without consent and a paired device.

Keep `DATABASE_PATH` on a private persistent volume. The API's system account must own the SQLite, WAL/SHM and backup files; restrict access to operators. Never put the database or any `bun api:diagnostics` output in the public web folder. Deletions do not automatically shrink the SQLite file or past backups: apply a retention period to backups as well. Check these permissions in the production container before opening the trials.

Web side: build with `VITE_API_URL` pointing at the deployed API and keep `VITE_INDEXABLE=false`. Apply the updated `deploy/nginx.web.conf` so that `/admin/diagnostics` serves `app.html` with `noindex`. Configure session/CORS origins as for the gallery; the console uses the same Better Auth session, so no new admin secret has to reach the browser.

## Production trial with a control device

1. Sign in to the site with the operator account. `/admin/diagnostics` must open; a regular account and an unauthorized gallery moderator must be refused. Check `Cache-Control: private, no-store` and `noindex`.
2. Pair a control installation, then open **M → Diagnostics**. Check that it is OFF by default; the profile owner turns it ON themselves after reading. Never turn consent on in place of Mae or any other player.
3. On a backed-up test profile, trigger a controlled export error (for example an export folder that cannot be created). In the console, check the capture phase, JAR version, date, frames and correlation. A normal selection/area refusal is not a technical exception.
4. Simulate a network outage, then restore access; the queue must stay bounded and the report must arrive with the same UUID. A delay and the hourly limits can postpone ingestion.
5. On a throwaway control profile, trigger a real Minecraft Java crash, then relaunch. Check the crash phase and the available steps. Force-killing the process guarantees no trace.
6. Move an error to in progress, then resolved; trigger an equivalent occurrence to check that it reopens. Refresh before editing when an occurrence arrives while you are viewing it.
7. Turn consent OFF in the mod: local queue cleared, permit revoked and this device's reports deleted. Groups with no other occurrence disappear. Then trigger a new failure to confirm nothing is collected. Without API access, or after the token is revoked, immediate server-side deletion cannot be confirmed; retention and cleanup of revoked devices take over.
8. Record the API/web revision, JAR version/fingerprint, control operator account, results, and volume/backup permissions in the private deployment log. Close #82 only after this evidence.

## Operations

Start with the “Open” groups, filter by crashes or the relevant version, then open an occurrence. The technical cause and the frames lead back to the release; free-form messages, world names and full Minecraft logs are deliberately absent. The latest decision is kept with its date and operator ID. Cleanup also bounds the groups and removes revoked devices.

The private CLI is still available in the API container:

```sh
bun api:diagnostics --limit 100
bun api:diagnostics --reports --device <UUID> --limit 20
```

The code provides neither Coolify access nor a production operator account. The documented local Minecraft/API/web trials do not prove that the revision was deployed. Keep this distinction in announcements to testers.
