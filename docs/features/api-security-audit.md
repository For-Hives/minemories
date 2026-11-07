# Initial API audit: 10 October 2026

## Scope

Review of the Bun/Hono code, the oRPC/zod contracts, authentication, pairing,
uploads and storage. Local HTTP/oRPC tests and a scan of `bun.lock` with
`bun audit`. No intrusive testing of production and no audit of the Coolify
infrastructure, the reverse proxy or the production bucket.

The product stays private by default: pairing authorizes uploads from the mod;
sharing requires an action by the owner. The review does not change this flow.

## Fixes made

- Shared GLBs and their metadata carry `Cache-Control: private, no-store`.
  The HTTP tests check opening, then revoking, the file and the metadata.
- Pairing attempts are counted per Bun socket IP. The `X-Forwarded-For` and
  `CF-Connecting-IP` headers of a direct client no longer reset its quota. A
  proxy is only trusted if its exact IP is in `TRUSTED_PROXY_IPS`; only the
  last valid IP entry of `X-Forwarded-For` is used. The proxy must add or
  replace that last address, and access to it must be controlled.
- The limiter keeps at most 4096 addresses, cleaned up periodically. A full
  table refuses new addresses without evicting clients already being limited.
  Each address gets eight attempts per minute; the overflow response is 429.
  The limit is local to the process; it does not protect several replicas
  together.
- Pairing JSON is limited to 2048 bytes before parsing. Reading is stopped and
  aborted when exceeded, even without `Content-Length` or with a false value.
  The expected name and code fit within this limit; uploads are unchanged.
- `source-map-js` goes from 1.2.1 to 1.2.2 in the lockfile, a version
  compatible with the existing ranges, to fix
  [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

## Checks exercised

- Real sessions and oRPC requests: anonymous access refused, isolation between
  accounts, explicit sharing, revocation, trash and deletion.
- Pairing: code expiring after five minutes, transactional single use and
  HMAC-hashed tokens; nine network requests from the same socket stay limited
  despite different IP headers.
- Storage: filesystem key checks against path traversal, owner access,
  streamed download, generic 503 response on outage.
- Upload: sizes of 100 MiB legacy / 450 MiB resumable, 4 MiB chunks, SHA-256,
  per-device isolation, replay, offsets, expiry and staging quotas. An SQL
  failure after legacy storage removes the provisional object and publishes no
  memory.
- Coverage is still enforced per file at 90% of lines and 80% of functions,
  with an inventory of covered sources. Thresholds are not lowered.

Validation: `bun run build` (including `bun check`) passes; 44 API tests pass
with the per-file thresholds. `bun run api:garage` passes the six real
scenarios, including storage outage and API restart. The fixture and its
volumes are deleted after the test. No change to the GLB format or Minecraft
behavior.

## Alerts and autonomous follow-ups

The post-fix scan of 10 October still showed four moderate alerts in the
transitive dependencies of `minio@8.0.7`:

| Dependency | Alert | Follow-up |
| --- | --- | --- |
| `decode-uri-component@0.2.2` via `query-string@7.1.3` | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | Compatible SDK update or maintained fix. |
| `stream-json@1.9.1` | [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x), [GHSA-hqr4-qq8f-hg3x](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x), [GHSA-mjw6-4jj6-33hc](https://github.com/advisories/GHSA-mjw6-4jj6-33hc) | Check compatibility before migrating to the fixed version. |

Fix of 11 October: the MinIO client is replaced by `@aws-sdk/client-s3` and
`@aws-sdk/lib-storage` at exact version `3.1149.0`. This migration removes both
vulnerable chains from the lockfile, without an incompatible override or audit
exclusion. `bun audit` returns an empty report with this lockfile; CI now runs
this check as well.

S3 variables and object keys stay compatible. Captures are streamed in 8 MiB
parts with a single concurrent upload; durable jobs abort incomplete uploads,
including those listed across several pages. The tests cover part bytes and
signatures, pagination, refusals and regions. The eight real Garage scenarios
pass, including outage and recovery after restart. See
[the S3 migration](storage-s3.md).

Observations and follow-ups: the application-level protections below are
implemented; production reconciliation remains in
[issue #65](https://github.com/For-Hives/minemories/issues/65) and the
infrastructure audit in
[issue #66](https://github.com/For-Hives/minemories/issues/66).

- Fix of 11 October: deletion and purge now record the objects to erase in a
  transactional SQLite queue, with retries and recovery after restart. See
  [durable deletions](durable-deletions.md). Historical reconciliation is
  still tracked. The legacy path now also records an intent before writing;
  its cleanup after a crash and an outage was exercised with real Garage. See
  [the quota and this validation](account-storage-quota.md).
- Fix of 11 October: GLB resources are checked by shared code in both uploads
  and in the viewer before the Three.js parser. External URIs, buffers without
  data and replacement JSON are refused. See
  [the rules and validations](embedded-glb-resources.md). Accessor layout and
  binary values are also verified before storage and loading. Texture
  dimensions, cumulative pixels and estimated cost are also bounded before
  publishing and loading; see
  [the budgets and their validation](embedded-glb-resources.md#texture-dimensions-and-budgets).
- Fix of 11 October: a per-account GLB quota of 2 GiB, configurable,
  including the trash, reserved uploads and objects awaiting deletion.
  Transactional reservations between legacy and resumable; release after a
  successful cleanup. See [the scope and the migration](account-storage-quota.md).
- Fix of 11 October: auth bodies are limited to 16 KiB, RPC and upload
  initialization to 256 KiB before parsing, with real byte counting. The two
  maximum thumbnails are still accepted and the binary caps are unchanged. See
  [the limits and validations](api-json-limits.md).
- Fix of 11 October: explicitly distinct secrets, removal of the pepper
  fallback and a check of the production configuration before opening SQLite.
  See [the variables and the migration](api-startup-configuration.md). The
  audit of the real infrastructure is tracked separately.

## Operations

Configure proxies according to [the Coolify guide](coolify-railpack.md).
Without a declared proxy IP, players behind it share its pairing limit.
Captures from an already paired mod do not go through this limiter.

Rerun `bun audit` regularly: the report describes the state of the lockfile
when it was written, not a permanent guarantee. Deployment checks, backups,
secret rotation and edge protections still need to be verified on the real
infrastructure.
