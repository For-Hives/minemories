# Web structure and audit

## Organization

- `app-context.tsx` holds only the session, the local file and notifications; pages no longer depend on `App.tsx`.
- `components/SiteLayout.tsx` carries the brand, the site's bar (`components/SiteNav.tsx`, shared with the landing: menus of every page, account menu, language picker, install button, phones' panel), GLB opening (development only), footer and skip link. Actions are keyboard accessible and every menu closes on page change.
- `components/ui.tsx` groups buttons and section titles; `components/Loading.tsx` provides page, gallery, viewer and account skeletons plus an orbital SVG.
- `App.tsx` loads every page family on demand, with Suspense and recovery from loading errors. Content pages do not import the Three.js module.
- `theme.css` carries colors, spacing, spring transitions, entrances, SVG floating and shimmer. Every animation respects `prefers-reduced-motion`.

## Languages and content

The shell, home page, authentication and feature labels use `i18n/I18n.tsx` (`useI18n`, `T`, `translate`). Source messages serve as keys; `i18n/messages.ts` holds their French translations. A missing message stays readable in its source language. The FR/EN preference stays in the browser. `translate` accepts named variables `{count}`, `{name}`; user data, paths and state identifiers are not translated.

The detailed guides (concept, how it works, FAQ and the screens of the installation guide), captions and alt text are translated through `i18n/guide-messages.ts`. Known API/engine errors become stable keys; unknown server messages are replaced by a translated contextual error. Relative dates, expiry times, sizes and metadata follow the selected language. The tutorial keeps its choices and progress when the language changes. Prerendered content stays in French and indexing is blocked by default; no indexable English URL or artificial `hreflang` is announced. See [the multilingual publication strategy](multilingual-web.md).

`content/site-content.ts` holds articles and legal sections typed as `Localized`. Adding an article feeds its page, the journal, prerendering and its Article schema. `content/discovery.ts` centralizes the four FR/EN editorial angles and the gallery examples. `useLocalizedCopy` selects pairs of editorial texts; the shared message catalog is still used for the common interface.

`content/pricing.ts` holds amounts in cents and the tested rules: €2 per snapshot, cloud €6 / 5 / 4 / 3 per year then a €3 floor, per kept snapshot. This scope is an explicit assumption awaiting business confirmation. The prices supplied on 14 October 2026 take priority over the older per-server billing vision in VISION.md. The projection assumes captures of the same age and continuous retention; it separates creation from renewals. No payment is enabled. Publisher/host/contact, taxes, quota, retention terms and the payment provider are still to be finalized.

To add a new page family: declare its route in `App.tsx`, its metadata in `route-metadata.ts` and its rendering in `prerender.tsx`. Reuse `ContentLayout`, the blocks and the shared components. Every new page must include both its content versions and metadata, then be added to the translation tests; publishing new URLs follows the documented multilingual strategy.

## Prerendering and crawling

`build-web.mjs` builds the Vite client, then a temporary React render entry in `work/web-ssr`. `prerender-web.mjs` writes seventeen complete public pages (HTML, titles, description, canonical, Open Graph, JSON-LD), `sitemap.xml`, `robots.txt`, a private `app.html` shell and a 404 page. The shell answers every private route, but only `/share/:token` and `/public/:id` links get pasted where a preview is drawn, so its head is their neutral card (`appShell` in `route-metadata.ts`, in French: title, description, `og:title`, `og:description`, the site logo image), with no canonical or `og:url` since one file serves many URLs. There is no per-link image: that would need a server-side render. `/installation`, `/downloads` and `/versions` hold their whole content in the static HTML, with no `noscript` block. Pages hydrate in the browser; saved progress is restored after hydration. On `/installation` the static HTML is the welcome screen, then every screen of the guide, then the help; after hydration the static screens give way to the stepper, so nothing above the fold moves.

The gallery, the local viewer, `/share/` links and authentication are not in the sitemap. They use `noindex,nofollow` and are excluded in robots.txt. A shared capture stays reachable for its recipient without becoming an indexed marketing page. No account or authenticated API call is used during prerendering.

Build variables:

- `VITE_SITE_URL`: public origin, default `https://minemories.net`; set it for another domain.
- `VITE_INDEXABLE`: only the exact value `true` allows indexing in the build. By default, including when the variable is absent: `noindex,nofollow` everywhere, an empty sitemap and `robots.txt` with `Disallow: /`. The source HTML and client-side route changes also stay noindex. The `railpack.web.json` command also forces `false` to neutralize an old Coolify variable set to `true`.
- `VITE_API_URL`: API origin, already used by Better Auth/oRPC.

## Coolify static server

Keep Railpack, `railpack.web.json`, base `/` and publish directory `apps/web/dist`. **No JDK or Gradle in the front end.** Prerendering uses only Node and React; no production Node server is needed. The JAR is fetched from GitHub Releases in the browser.

`deploy/nginx.web.conf` is the whole static server: paste it, unchanged, as the application's **Custom Nginx Configuration** in Coolify (Coolify writes it to `/etc/nginx/conf.d/default.conf` of the `nginx:alpine` runtime, root `/usr/share/nginx/html`), then redeploy. Coolify's default configuration (`try_files $uri $uri/ /index.html`) answers every unknown or private URL with the home page in 200 and redirects `/installation` to an absolute `http://…/installation/`; this file replaces it:

- Public prerendered pages answer 200 at their slashless URL (`try_files $uri $uri/index.html =404`, no directory redirect). `/concept/` and `/concept/index.html` 301 to `/concept`, `/index.html` to `/`, and every retired page or French slug of `apps/web/src/content/legacy-paths.ts` (`/discover`, `/decouvrir`, `/nostalgia`, `/open-source`, `/ranking`, `/changelog`, `/blog`, …) goes to its final page in a single hop; the query string is kept. `legacy-paths.test.ts` keeps that module, the nginx map and the smoke checks in step. Redirects are relative (`absolute_redirect off`), so they never fall back to `http`.
- Private routes (`/gallery`, `/account`, `/viewer`, `/share`, `/public`, `/moderation`, `/admin`, `/login`, `/register`) serve `/app.html` in 200. Unknown URLs, `/CONCEPT` and direct requests to `/app.html` or `/404.html` are real 404s with the `404.html` body.
- **One indexing switch**: the `map $uri $mm_robots` block at the top. Its `default` line decides `X-Robots-Tag` for every public response (pages, OG image, favicon, assets); private routes, `app.html` and `404.html` are always `noindex, nofollow`. The file has a single `add_header X-Robots-Tag` and a single `add_header Cache-Control` (from `map $uri $mm_cache`), at server level; no location may add a header, because one `add_header` in a location drops the server-level ones there.
- Cache: `/assets/` and hashed film captures immutable for one year; HTML (prerendered pages, the `app.html` shell), `robots.txt`, `sitemap.xml` and the `/hero/captures-opt/` manifest `no-cache` (ETag revalidation, so a page never outlives the hashed chunks a deploy replaces); `/hero/`, `/brand/`, `/textures/` and favicons one day plus `stale-while-revalidate`. Redirects inherit the rule of the folder they point to, which is harmless for permanent 301s. `site.webmanifest` is served as `application/manifest+json`.

Check a deployment with `bun run web:smoke <base URL>` (`scripts/smoke-web.mjs`, no dependency): statuses, same-host relative redirects, noindex on private routes and 404s, app shell body on every private route prefix, `no-cache` HTML and immutable cache on `/assets/`. Before launch every public response must also be noindex, `robots.txt` must contain `Disallow: /` and the home page `<meta name="robots" content="noindex…">`; after launch, add `--indexable` and all three must be open. A unit test (`scripts/smoke-web.test.mjs`) keeps the private route list identical in the nginx `location`, the `$mm_robots` map, the indexable `robots.txt` of `scripts/prerender-web.mjs` and the smoke checks. Pasting the configuration in Coolify is a manual step: run the smoke test after each change.

Launch, in this order and only deliberately: remove the `VITE_INDEXABLE=false` lock from the Railpack command and rebuild with `VITE_INDEXABLE=true`; set the `default` of `map $uri $mm_robots` to `""` in `deploy/nginx.web.conf` and paste it again in Coolify (an empty `add_header` value is not sent); redeploy; run `bun run web:smoke <base URL> --indexable`. The Vite preview reads the policy from the built HTML and emits the same block for non-indexable pages. The `data-route` guard prevents a hydration error if an older server still falls back to the home page, but it does not replace a correct HTTP configuration.

## Audit by flow

| Flow | Work done | Specific follow-up |
| --- | --- | --- |
| Home and guides | Shared shell, messages, navigation and prerendering; the `/` home page is the scroll film of [the home page](landing-film.md), with its own header and footer | Full translation of the guides and editorial review; replace Mojang assets before a wide launch |
| Installation | Hydration compatible with local resume, no-JS version, Windows sections preserved | Real screenshots, first GitHub release and Mae's in-game trial |
| Account | Deferred module, skeleton, localized forms and labels | Production sessions and a real account |
| Gallery | Deferred module, card skeleton, labels and pairing states preserved | States and polling extracted, interactions and cancellations covered (#59, #77) |
| Local/remote viewer | Deferred Three.js module, frame skeleton, labels and presets | Shader profiling; no change to the GLB engine |
| Sharing | Deferred module, download cancelled on exit, accessible state and mobile text without overflow | Revocation/incident test with the production API |
| Demo gallery/ranking | `/explore`, search, themes, sorting, favorites, local votes and preview by URL | Voluntary publication, moderation and real votes on the API side |
| Pricing/legal | Supplied prices, simulator, local estimate and factual texts | Polar payment, taxes, quota, retention contract and legal details |

Private accounts and captures never enter public render artifacts. Crawlability means the HTML is reachable by robots; it does not guarantee indexing by a search engine.


## Demos and preferences

`/sharing` shows the share demo with CTAs to the demo explorer and the real private gallery. The former `/discover`, `/open-source`, `/nostalgia` and `/ranking` pages and the `/blog` journal are retired (301s, see above). Demo images are illustrations, with no import of private captures and no Three.js engine.

`/explore?souvenir=premiere-maison` opens an example preview. Its link can be copied; if the clipboard is blocked, a selectable field allows manual copying. Search, filters, favorites and reversible votes work on the device. Initial scores are explicitly labelled examples. The `minemories-demo-v1` preferences are validated on load and can be cleared with "Reset demo". They are never sent to the API.

The `/pricing` simulator accepts 1–100 snapshots and 1–10 years; an invalid field prevents saving. "Save this estimate" writes only `minemories-quote-v1`, which is reread after hydration and ignored if invalid. A browser storage restriction does not block the flow. The current mod exports an area GLB memory: full Minecraft saves and their commercial archive are not advertised as already working.

## Gallery and remote viewer regressions

The interactions in `gallery-lifecycle.test.tsx` cover the capture → trash → restore → confirmed deletion cycle, declining the confirmation, outages and recovery, capture and area renames, and creating, copying, rotating and revoking a link. Area names stay local; a cancelled rename triggers no server mutation.

An old list response can no longer replace a recent refresh. Share, rename and trash responses that arrive after their component has closed no longer produce a notification on the next page or a useless refresh. Viewer tests check the abort signal, scene disposal and rejection of an old download when switching to another capture. Public/shared link tests complete this flow with opening and revoked access. These tests use the real components with a simulated API; they do not replace deployment validation or GPU profiling.

Gallery coordination is split into `gallery-data.ts` (lists, quota, actions and refresh), `gallery-pairing.ts` (code creation and checking) and `GalleryPairingCard.tsx` (presentation). Gallery polling resumes twelve seconds after the previous cycle ends: a slow response does not pile up automatic requests. A manual refresh stays available and keeps the protection against stale responses. Pairing checks keep their 1.1 then 1.6 second delays and stop when the page is left, including while the code is still being created. Folders stay open after a round trip through the trash. The two historical complexity exceptions in `GalleryPage` were removed after the interactions were added.

Optional diagnostics on public pages are described in [web-observability.md](web-observability.md): an empty configuration and absent consent prevent the provider from loading, and private routes stay excluded.
