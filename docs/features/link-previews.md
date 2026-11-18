# Link previews of shared builds

A shared link (`/share/<token>`) or a public memory (`/public/<id>`) pasted on Discord, X, WhatsApp, Slack, Telegram,
Facebook, LinkedIn, Reddit, Mastodon or Bluesky previews the build itself: its picture and the name its owner gave it.
Before, every such link showed the same card (the logo and "A Minecraft place in 3D, shared with you"), because the
site is static and its shell (`app.html`) cannot know which build a link points to.

## How it works

1. **nginx** (`deploy/nginx.web.conf`, maps `$mm_link_robot` and `$mm_link_card`) recognises the link-preview robots
   by their user agent and answers them, on `/share/<token>` and `/public/<uuid>` (with or without a language prefix),
   with a **302** to the API's card. People, search engines and every other path are unchanged. A redirect needs no
   upstream, so nginx never resolves the API host and can always start. The API host is written in the map
   (`https://api.minemories.net`).
2. **The API** (`apps/api/src/link-cards.ts`, mounted at `/api/cards`) answers:
   - `GET /api/cards/shared/<token>?lang=<prefix>` and `GET /api/cards/public/<id>?lang=<prefix>`: a small HTML page
     with Open Graph and Twitter tags (`summary_large_image`), `og:url` on the site's own link;
   - `GET /api/cards/shared/<token>/image` and `GET /api/cards/public/<id>/image`: the stored picture (the 400 x 250
     JPEG thumbnail, decoded from its data URL). It never reads the GLB or cold storage.
3. The API's `robots.txt` allows `/api/cards/` (X reads it before a card) and still disallows everything else. Every API
   response keeps `X-Robots-Tag: noindex, nofollow`.

## What a card shows

| Link | Title | Description | Picture |
|---|---|---|---|
| Shared memory or world | The name the owner gave the place in the gallery, else the neutral title | The neutral description | The memory's thumbnail; a world link takes the newest of its last 12 snapshots that has one |
| Public memory (approved) | The publication title | The publication description | The publication thumbnail |
| Stopped, unknown or not approved (404) | Neutral title | Neutral description | `/brand/og-image.png` |

Never shown: the file name, coordinates, seed, biome, dimension, world or server name from the game, the owner.
Pending, rejected and revoked publications never preview (only `discovery.get`, which reads approved ones). A card or
picture request is not counted as an opening of the link (`share_links.open_count`), nor of the capture.

The neutral text is the web's own message, translated from the web catalogs (`apps/web/src/i18n/locales`) for the
link's language prefix. Titles are cut at 120 characters and descriptions at 300, between words; everything is HTML
escaped.

## Cache and stopping a link

Cards and pictures are `Cache-Control: private, no-store`, and nginx answers robots with a 302 (not a 301), so a stopped
or replaced link stops previewing at the next fetch. The platforms keep their own copy of a preview already posted for
a while (Discord re-fetches after some hours); that is outside our control.

## Deploying

The API part ships with the API. The nginx part is the application's **Custom Nginx Configuration** in Coolify (the
whole file, see the head of `deploy/nginx.web.conf`): paste it again after merging, then check with a robot's user agent:

```bash
curl -sI -A Discordbot https://minemories.net/share/<a real token> | grep -i location
curl -s -A Discordbot -L https://minemories.net/share/<a real token> | grep og:image
```

Then paste a real link in a private Discord channel. Discord's preview is the only proof that matters.

## Limits

- The picture is the gallery thumbnail, 400 x 250. Platforms show it large but not sharp. A capture without a
  thumbnail yet (never opened in the viewer) previews with the logo.
- Robots that are not in the user-agent list get the neutral card of `app.html`, as before.
