# Coolify deployment with Railpack

Create two Coolify applications connected to the same Git repository. For both, choose **Railpack** and set the **Base Directory** to `/` so Bun sees the workspace, `bun.lock` and `packages/api-contract`.

## API

- Railpack config file: `railpack.api.json` (build variable `RAILPACK_CONFIG_FILE=railpack.api.json`).
- Server application, static site disabled; expose internal port `3001`.
- Runtime variables: `NODE_ENV=production`, `API_PORT=3001`, `WEB_ORIGIN=https://<front-domain>`, `BETTER_AUTH_URL=https://<api-domain>`, `BETTER_AUTH_SECRET` and `PAIRING_PEPPER` (two distinct random secrets of at least 32 characters).
- Configure Garage or another S3 store with `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` and `S3_REGION`. The endpoint must be reachable from the API container; the local values from `.env.example` do not work on Coolify.
- `ACCOUNT_STORAGE_BYTES` is the server default, in bytes, for the `user` role's GLB quota (2 GiB when unset; when set it must be a positive integer). An administrator can override it and set other roles' limits from the admin panel, and each account gets the largest limit among its roles, so changing the variable has no effect once a `user` limit is configured. Trash, reservations and unacknowledged deletions still count. See [limits by role](account-storage-quota.md#limits-by-role) and [the quota and its migration](account-storage-quota.md).
- Add a persistent volume mounted at `/app/apps/api/data`. Set `DATABASE_PATH=/app/apps/api/data/minemories.sqlite` and `UPLOADS_PATH=/app/apps/api/data/uploads` to keep the database and pending uploads across redeploys. With `STORAGE_DRIVER=filesystem`, also set `LOCAL_OBJECTS_PATH=/app/apps/api/data/objects`.
- The health check is `GET /healthz`.
- If the API sits behind a reverse proxy, set `TRUSTED_PROXY_IPS` to the exact, comma-separated IPs of the proxies directly connected to Bun. The proxy must replace `X-Forwarded-For` or append the real client IP as the last entry; do not forward the client header unchanged. Restrict direct access to the API port. Without this configuration, the pairing limit applies to the proxy IP for all of its clients; untrusted IP headers are ignored. Do not add arbitrary public IPs or player IPs.

Railpack installs the workspace, type-checks the API, then starts `NODE_ENV=production bun run --filter @minemories/api start`. [Configuration validation](api-startup-configuration.md) rejects missing or invalid values before SQLite is opened. Keep secrets stable; removing an old pepper fallback requires re-pairing the mods.

## Front

- Railpack config file: `railpack.web.json` (build variable `RAILPACK_CONFIG_FILE=railpack.web.json`).
- Enable **Is it a static site?** and set the **Publish Directory** to `apps/web/dist`.
- Set `VITE_API_URL=https://<api-domain>` as a **build** variable, then rebuild the front after any change to this URL. Vite bakes it into the static files.

The web build installs only Bun and Node: TypeScript check, then Vite bundle. No JDK, Minecraft compilation, Gradle tests or release are needed to deploy the front. The Coolify/Nginx static server serves `apps/web/dist`.

The install page reads the Minemories API index (`/downloads/index.json`) and offers the JAR of the latest version for the chosen target, pre-releases included. An empty index or an API outage shows a retry; it does not fail the web deployment. The mod is built and published on the VPS with `bun mod release`.

## Deployment

In each application, add `RAILPACK_CONFIG_FILE` as a build variable to select the matching file. Do not put secrets in the Railpack files. Deploy the API first, then the front; the `WEB_ORIGIN`, `BETTER_AUTH_URL` and `VITE_API_URL` origins must match the public HTTPS domains configured in Coolify.

The front pre-renders its public pages, with no Node server at runtime. Set `VITE_SITE_URL` to the public domain and paste `deploy/nginx.web.conf` as the application's **Custom Nginx Configuration** (Coolify's default one serves the home page for every unknown URL): public pages in 200 at their slashless URL, relative 301s for trailing slashes, `index.html` and the old French slugs, private routes via `/app.html` with `X-Robots-Tag: noindex, nofollow`, unknown URLs as 404. Check it with `bun run web:smoke <base URL>`. Indexing is **blocked by default** (variable absent or `VITE_INDEXABLE=false`): noindex in the HTML, `robots.txt` Disallow and an empty sitemap. The Railpack command forces `VITE_INDEXABLE=false`, even if an old Coolify variable is set to `true`; the nginx configuration also blocks every public response through the `default` of its `map $uri $mm_robots` switch. Do not change either before the deliberate public launch, whose steps are in [web foundations](web-foundations.md#coolify-static-server).
