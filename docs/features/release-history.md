# Mod versions and changelog

Issue [#61](https://github.com/For-Hives/minemories/issues/61) adds two public pages:

- `/versions`: history of compatible JARs, with the latest release highlighted, mod version, Minecraft, loader, localized UTC date, pre-release status, size and direct download.
- `/changelog`: the same releases, with a link to the built commit for each version. A `/changelog#v<version>` link goes to the requested version.

The `/installation` tutorial and the footer link to this history. To update or go back to an earlier version, close Minecraft and keep a single Minemories JAR in the `mods` folder of the compatible profile.

## Source and compatibility

`mod-releases.ts` shares its selection with the tutorial download. The browser reads the public index of the Minemories API (`/downloads/index.json`, see [the release flow](automatic-releases.md)), without a token and without building Java during the web deployment. No changelog is written or invented on the site side: the index follows the stored versions, so the page reflects the VPS's latest release the next time it is opened.

For each target (Minecraft x loader), the index contains the **3 most recent versions** (storage retention). Each version lists its build date, commit, size, SHA-256 and download link `/downloads/<target>/<version>`. Older versions can no longer be downloaded, so the site does not offer them. The "latest version" badge marks a recent release, without promising in-game validation of that exact JAR.

## States and integrity

- Skeleton while loading, an empty state distinct from an outage.
- Network error or invalid response: a message and a retry; a link to `index.json` that works without JavaScript.
- 15-second timeout, cancellation on unmount and rejection of late responses.
- The index's SHA-256 is shown with each download; displaying a checksum does not claim to verify the local file automatically.
- The link to the version's commit points to the public repository.

## Accessibility and languages

Pages load on demand, with hierarchical headings, `<time>` dates, per-version anchors and downloads named with their version. FR/EN interface and localized date/size formats. SVG animations, buttons and skeletons reuse the site's components and their reduced-motion preference.

Both routes are prerendered with titles, navigation and access to `index.json` without JavaScript. The up-to-date history is loaded in the browser: no network access is needed during the build. The pre-launch policy remains `noindex,nofollow`, a disallowing `robots.txt` and an empty sitemap by default; Railpack always forces `VITE_INDEXABLE=false`.

## Validation

Interaction tests cover sorting, compatibility, downloads/checksums, the commit link, empty or invalid index, outage/recovery, timeout and stale response, FR/EN. Prerender and metadata tests cover the new routes and that `noindex` is kept. No change to mod behavior or to the GLB format.

Check of 15 October 2026: Chromium on the production build, widths 1440/390/650/800/1024 px, three real public releases, the old beta's anchor, FR/EN switching, reduced motion, the link from the tutorial, and a simulated HTTP 429 error followed by recovery on the public data. In the cloud environment, the browser's GitHub responses were routed through `curl` with the inherited proxy; no token or invented dataset. No horizontal overflow or JavaScript error observed. Real download of the `0.2.1-beta.1` JAR: 300,220 bytes, SHA-256 `113ddeb9956a15b871e4f5eb6536dfe71765b3e3bf493c69e02ced6f99c3eb3d`, identical to the GitHub digest. Preview routes return 200 with `X-Robots-Tag: noindex,nofollow` and `robots.txt` keeps `Disallow: /`.
