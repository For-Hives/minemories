# Legal notice and privacy policy

The site's legal pages follow the same model as Andy Cinquin's other hosted product (ForVoyez): a French legal notice naming the publisher and the host, and a privacy policy that lists every service provider.

## Where things live

| Page | Source | What it says |
|---|---|---|
| `/legal` | `apps/web/src/pages/LegalNotice.tsx`, then the `legal` sections of `content/site-content.ts` | Publisher (name, SIRET, address, phone, website, publication director), host (Contabo GmbH and its registration), contact, link to `/privacy`, independent project |
| `/privacy` | `privacy` sections of `content/site-content.ts`, rendered by `PrivacyPanels` in `pages/ContentPages.tsx` | What stays on the device, diagnostics, account and gallery, links, downloads, who is responsible, service providers, no tracking, rights, third-party sites, last update |
| `/terms` | `terms` sections of `content/site-content.ts` | Beta caveats and capture etiquette |

Names, registration numbers and addresses are written as registered and never translated; only their labels go through the catalogs. `/legal` is indexable since it names the publisher and the host.

## Facts and how they were checked (13 November 2026)

- Publisher: Andy Cinquin, the same details as the ForVoyez legal pages.
- Host: the Coolify server `xenos` (site, API, SQLite database, Garage storage of captures and mod JARs) answers on `38.242.251.119`, in Contabo GmbH's network (AS51167). Contabo's registration details are the ones ForVoyez lists for its database server.
- `minemories.net`: registrar and DNS at Cloudflare; its records point straight to the server, without Cloudflare's proxy.
- No email is sent by the API, no audience measurement or advertising runs on the site, and the only cookies are Better Auth's session cookies.
- Google and Discord sign-in exist in code (`apps/api/src/oauth-config.ts`) but are off in production (`GET /api/auth-providers` returns `[]`); the policy mentions them conditionally.
- The Minecraft head avatar comes from `head.sttr.io`, which receives only the Minecraft username.
- Account deletion (administrator, on request) removes captures, connected games and links, and keeps an audit row with the account name and date (`apps/api/src/admin-accounts.ts`).

## Keeping it true

When a provider is added or removed (storage moved to R2, an email service, analytics, a social sign-in turned on), update the `Service providers` items in `site-content.ts`, translate the change in every catalog, and move `privacyUpdated` in `pages/ContentPages.tsx` and the `/privacy` `updated` date in `route-metadata.ts`.
