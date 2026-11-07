# Configuration checked at API startup

In production, the API checks its configuration before opening SQLite, migrating tables or
listening for requests. Railpack starts it explicitly with `NODE_ENV=production`.
In development, use `bun api:dev` with the variables from `.env.example`
replaced by your own secrets.

In every environment, `BETTER_AUTH_SECRET` and `PAIRING_PEPPER` are
required, distinct, and at least thirty-two characters long after trimming
leading and trailing whitespace.
The example's `replace-with-…` values are rejected. No secret is generated
or replaced at startup; errors name the variable without echoing its
value. `PAIRING_PEPPER` no longer falls back to the authentication secret.

In production, the additional checks are:

- `BETTER_AUTH_URL` and every origin in `WEB_ORIGIN` are explicit HTTPS URLs,
  without credentials, query or fragment. Origins contain no path.
  They are normalized for CORS and Better Auth, including case, the default
  HTTPS port and the trailing slash. No implicit wildcard is added.
- `API_PORT` is an integer from 1 to 65535, defaulting to 3001.
- `DATABASE_PATH` and `UPLOADS_PATH` are explicit and absolute. The operator must
  mount their persistent volumes: checking a path does not prove that the
  host keeps its content after a redeploy.
- The driver is `s3` by default, or explicitly `filesystem`. With S3, the
  HTTP/HTTPS endpoint without a path, both credentials, the bucket and the region are
  required; the local Garage fixture credentials are rejected.
  HTTP is still accepted for Garage on the deployment's internal network.
  With filesystem, `LOCAL_OBJECTS_PATH` must be explicit, absolute and persistent.
- Addresses in `TRUSTED_PROXY_IPS`, if present, are exact IPv4/IPv6 addresses.
  This does not remotely verify that the proxy is configured correctly.

Before redeploying, set these variables following
[the Coolify guide](coolify-railpack.md). Keep existing secrets when they
pass the checks: changing them invalidates sessions or paired
devices. If an older installation relied on the pepper falling back to the
authentication secret, setting a distinct pepper requires pairing the mods
again. Local captures and already stored memories are kept.

Configured startup and the rejection of invalid configurations are exercised
in real Bun processes, with a temporary database and no access to production data
or secrets. The health check is `GET /healthz`. On SIGINT/SIGTERM the process
also closes its maintenance timers, waits for the server to stop, then closes
SQLite; the test checks that it exits normally.

These validations are not an audit of the production infrastructure.
Direct access to the API port, bucket permissions, backups, persistent
mounts and secret rotation are still tracked in [issue #66](https://github.com/For-Hives/minemories/issues/66).
