# Visit statistics (Umami)

The site counts visits with a self-hosted [Umami](https://docs.umami.is/docs) (3.5+, `umami.wadefade.fr`, website `b54859d4-0ee2-4556-b6b5-985c86707a22`). It is separate from the [optional web diagnostics](web-observability.md) (Sentry, off by default) and from the mod's [diagnostics](consented-diagnostics.md).

## How it flows

```
minemories.net (browser)
  └─ https://api.minemories.net/api/insight/script.js   ── GET, cached 1 h ──►  umami /script.js
  └─ https://api.minemories.net/api/insight/api/send    ── POST, relayed ────►  umami /api/send
```

- **Proxy** — `apps/api/src/insight-proxy.ts`, mounted in `index.ts` after CORS. Blockers refuse third-party analytics hosts; a first-party API host gets through ([bypass ad blockers](https://docs.umami.is/docs/bypass-ad-blockers)). It only relays the website ids in `INSIGHT_WEBSITE_IDS` (not an open relay), caps bodies at 64 KiB, forwards the User-Agent and Umami's `x-umami-*` headers, never a cookie, and sets the visitor's IP in `True-Client-IP` (the first header Umami reads; its own reverse proxy rewrites `X-Forwarded-For`). The IP comes from Traefik's single-value `X-Forwarded-For`, or the last entry behind `TRUSTED_PROXY_IPS`.
- **Loader** — `apps/web/src/observability/insight.ts`, started from `main.tsx`. It sets `window.umamiConfig` and injects the script. Nothing loads in a dev build without `VITE_INSIGHT_WEBSITE_ID`, when the browser sends Global Privacy Control or Do Not Track, or after the visitor turned it off on `/privacy` (Umami's own `umami.disabled` key). `domains` limits counting to the `VITE_SITE_URL` host.
- **Cleaning** — every payload goes through `cleanPayload` (`apps/web/src/lib/insight.ts`, Umami's `beforeSend`): `/share/<token>` → `/share/:token`, `/public/<id>` → `/public/:id`, query reduced to `utm_*`, `ref` and ad click ids, fragment dropped, private pages (`share`, `public`, `viewer`, `gallery`, `account`) lose their title, `/admin` and `/moderation` are never sent. Errors get the same path cleaning; Umami already strips emails and tokens from messages.

## Configuration

| Where | Variable | Default | Effect |
| --- | --- | --- | --- |
| API runtime | `INSIGHT_UPSTREAM` | `https://umami.wadefade.fr` | Umami origin; `off` removes the routes (404) |
| API runtime | `INSIGHT_WEBSITE_IDS` | the production id | Comma-separated ids the proxy relays |
| Web build | `VITE_INSIGHT_WEBSITE_ID` | production id in a production build | `off` disables; set it in dev to test |
| Web build | `SOURCE_COMMIT` / `VITE_RELEASE` | `dev` | Release attached to error reports (Coolify: enable "Include Source Commit in Build") |

Locally: run the API (`bun api:dev`), then `VITE_INSIGHT_WEBSITE_ID=<a test website> VITE_SITE_URL=http://localhost:5173 bun web:dev`.

## What Umami receives, by feature

| Umami feature | What feeds it |
| --- | --- |
| Pageviews, UTM, Attribution, Compare | Automatic pageviews (SPA history included), `utm_*` and ad click ids kept in the URL |
| Performance | `performance: true` (LCP, INP, CLS, FCP, TTFB) |
| Error tracking | `errors: true`, `release`, `environment` |
| Sessions, Retention, Cohorts | `identify(distinctId, { locale, signedIn, joined })`, then `captures` (range) and `paired` |
| Goals, Funnel, Journey | The custom events below |
| Revenue | Not wired yet: pricing is off. When checkout ships, send `purchase` with `{ revenue, currency }` server-side from the Polar `order.paid` webhook, with the account's Distinct ID as `payload.id` |
| Links, Pixels | Created in Umami's UI (Discord, ads, emails); nothing in the site |

The Distinct ID is `u` + the first 31 hex digits of `SHA-256("minemories:" + userId)`: the operator can recompute it for one account to answer a data request; Umami alone cannot go back to the account. `joined` is the account's creation month (`2026-11`), the cohort key. `captures` is a range (`0`, `1`, `2-5`, `6-20`, `21-100`, `100+`).

## Events

Names are goals and funnel steps in Umami: renaming one breaks the reports built on it. The typed list is `InsightEvents` in `apps/web/src/lib/insight.ts`.

| Event | Data | When |
| --- | --- | --- |
| `auth-start` | `provider`, `mode` (`login`/`register`/`link`) | Google or Discord button |
| `signup` | `method` | First signed-in page of an account less than 10 minutes old, once per device |
| `login` | `method` | First signed-in page after a sign-in started on this tab |
| `signout` | | Sign out |
| `mod-download` | `target`, `version`, `page` | Any link to the API's `/downloads/<target>/<version>` |
| `outbound` | `host`, `page` | Any link to another site (CurseForge, Modrinth, Discord, GitHub…); `data-insight="off"` opts a link out |
| `pairing-code` | | The gallery issued a 6-digit code |
| `pairing-done` | | The game used it |
| `viewer-open` | `source` (`gallery`/`share`/`public`) | A capture is on screen |
| `share-create` / `share-revoke` | `scope` | Share link created or stopped |
| `public-publish` / `public-revoke` | | Explore submission sent or withdrawn |
| `glb-download` | | Owner downloaded a `.glb` |
| `capture-trash` / `capture-restore` / `capture-delete` / `trash-empty` | | Gallery lifecycle |
| `explore-vote` / `explore-report` | | Explore page |
| `language-change` | `from`, `to` | Language picker |

Suggested reports: funnel `/` → `/installation` → `mod-download` → `/register` → `signup` → `pairing-done` → `viewer-open`; goals `mod-download`, `signup`, `pairing-done`; journey from `/share/:token`; retention and cohorts on `joined` and `paired`.

## Privacy

The privacy page's "Visit statistics" section describes this and carries the switch (`InsightPreference`); the Contabo line of its providers list includes the statistics, since `umami.wadefade.fr` runs at Contabo in Germany. No cookie is set; the tracker stores nothing unless the visitor opts out. Legal basis and the processor (the Umami host) belong in the privacy policy with the publisher's details (#89).

## Validation

`apps/web/src/lib/insight.test.ts` (100%), `apps/web/src/observability/insight.test.tsx` (loader, queue, opt-out, links, identity, switch), `apps/api/src/insight-proxy.test.ts` (100%) and `insight-http.test.ts` (mounting and CORS preflight on the real app).
