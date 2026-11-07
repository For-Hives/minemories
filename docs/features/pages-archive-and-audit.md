# The other site pages: archive, audit and path to the design system (30/10/2026)

For now, this file replaces every site page except the landing (`/`). It keeps their content, says what is useful or not, and proposes how each one becomes a page of the design system (`docs/features/brand-guidelines.md`).

The page code is not lost: it is in the `main` history, at commit `3894d58` (the last one before this change). A local tag `archive/pages-v1-2026-10-30` also points to it, but it is not pushed: use the hash.

```bash
git show 3894d58:apps/web/src/pages/GalleryPage.tsx
git diff 3894d58 HEAD --stat
```

## 1. What was removed, and what remains

Remaining: the landing `/` (film, steps, sharing, FAQ, footer), the minimal 404 page, loading, the design guidelines and the design system.

Removed: the 28 routes below, their code (`apps/web/src/pages`, components and libraries of the 3D viewer and the gallery), their tests and their stylesheets.

Consequences to know before going further:

- Mod pairing (6-digit code) is generated in the gallery, which no longer exists: without a web gallery, a player can no longer link their mod to their account, so captures can no longer be uploaded. The mod keeps exporting locally (`~/export/capture.glb`).
- Shared links (`/share/:token`, `/public/:id`) no longer open, while the API keeps generating them (`urlPath: /share/<token>`).
- The mod opens `https://<site>/gallery` ("gallery" button in its interface, `ClientSettings.DEFAULT_SITE_URL + "/gallery"`): it will land on the 404.
- The API's payment return (`return_url`, `success_url`) points to `/gallery`.
- Consent to web diagnostics (opt-in, off by default) was withdrawn from the `/privacy` page. `WebObservability` stays mounted: a visitor who had accepted keeps sending landing errors with no interface to withdraw consent. To handle (a checkbox in the accessibility options of the landing footer, or removing the component) before any release of this branch.
- The API (`apps/api`) and the contract (`packages/api-contract`) do not change: everything removed can be rebuilt without touching the server.
- The legal pages (`/privacy`, `/terms`, `/legal`) are removed: they must be restored before any public launch (see §5).
- Landing buttons that pointed to these pages (install, sign in, explore) were removed or replaced by landing anchors.

## 2. Inventory of removed routes

| Route | Role | Access | Lines of code (TSX) | Verdict |
|---|---|---|---|---|
| `/discover` | Hub of 4 paths (open source, nostalgia, sharing, ranking) | public | 382 (with the next 3) | Merge into the landing |
| `/open-source`, `/nostalgia`, `/sharing` | 3 pages on the same template: title, lead, 3 points, story, note | public | same | Delete, keep the texts |
| `/explore`, `/ranking` | Public (moderated) gallery or demo with fictional data, ranking by votes | public | 510 | Postpone: the public gallery is not open |
| `/concept` | Why (leftovers of a season, a child, a closed server) | public | 352 (with the next 2) | Merge into the landing |
| `/how-it-works` | 3 detailed steps, commands, M key | public | same | Merge with `/installation` |
| `/faq` | 16 questions | public | same | Keep 6 to 8 questions on the landing |
| `/installation` | Interactive 6-step guide, loader choice, first name, troubleshooting | public | 929 (page + steps) | Keep, to redo |
| `/versions`, `/changelog` | JAR downloads from GitHub Releases, release notes | public | 83 + 93 + 84 | Keep `/versions`, merge `/changelog` |
| `/blog`, `/blog/:slug` | A single post ("A first memory") | public | 123 | Suspend |
| `/pricing` | Budget calculator, payments not enabled | public | 223 | Suspend |
| `/privacy`, `/terms`, `/legal` | Legal texts (to complete) | public | same | Restore before launch |
| `/login`, `/register` | Sign in, sign up, social providers | public | 241 | Keep, to redo |
| `/account` | Name, email, password, linked providers | session | 242 | Keep, to simplify |
| `/gallery` | Private gallery: captures, storage, pairing, sharing, trash, publishing | session | 871 + 103 | The core of the product, to redo first |
| `/viewer` | 3D viewer (local file or capture) with studio (sky, weather, time) | public | 264 + 240 | The core of the product |
| `/share/:token`, `/public/:id` | Viewer for a shared capture | link | 183 | The core of sharing |
| `/admin`, `/admin/users`, `/admin/moderation`, `/admin/diagnostics` (`/moderation` redirects) | Operator tools: service figures, roles, mod diagnostics, moderation queue | operator | 302 + 256 + 105 | Outside the public site, keep separate |
| `*` | 404 page | public | in ContentPages | Kept (minimal) |

Total size removed: about 12,000 lines of TSX, 3,400 lines of page-specific CSS (excluding `theme.css`), 8 languages of text.

## 3. Page sheets: what each page contained

### Information path

**`/concept`**: "The builds remain, even when the season ends". Three blocks: the problem (a server that closes, modpacks you can no longer find), the promise (a 3D memory you open in a browser, without Minecraft), the limit (a snapshot you look at, not a backup). For whom: a server admin at the end of a season, a parent with their child, a casual player, a modpack creator. Full text in the appendix.

**`/how-it-works`**: three steps (install and open the world, choose a small area and capture it, find the file), plus the commands (`/minemories export 16`, two-corner selection), the M key, the limited underground depth, the closed "dirt/stone" faces. Largely duplicates `/installation`.

**`/faq`**: 16 questions. Backup or not, account and mod needed to view, vanilla builds, mod compatibility, server, sharing and children, automatic uploads (AFK), finding an old capture, closed server or ZIP, missing part, pairing failure, timelapse, 3D printing, subscription. The landing reuses 4.

**`/installation`**: interactive guide. Loader choice (NeoForge, Fabric, Forge), optional first name, "reduce animations" option, six checkable steps with a progress bar, five troubleshooting cases (NeoForge installer, mods folder, M key, crash at startup, empty capture), Windows screenshots. It is the most polished and most useful page of the site.

**`/versions` and `/changelog`**: list of JARs from the GitHub Releases API (cache, fallback when rate limited), SHA-256 checksum to verify, release notes, "Load older releases". Both routes show the same component, one focused on downloading, the other on the notes.

**`/discover`, `/open-source`, `/nostalgia`, `/sharing`, `/ranking`**: four "marketing" pages on the same template (color accent, three points, story, note) around illustrations: a slider showing three stages of a build, a demo of favorites and votes stored locally. Full texts in the appendix.

**`/blog`**: a single post, dated 14/10/2026, "A first memory, with a familiar path". Reproduced in the appendix.

**`/pricing`**: "Keep your worlds. Prepare for the future." Calculator (1 to 100 snapshots, 1 to 10 years, optional cloud): €2 per snapshot at creation, then cloud at €6, €5, €4 and then €3 per year. Estimate saved in the browser. No payment is active, as the page says.

**`/privacy`, `/terms`, `/legal`**: three short, honest texts, with caveats ("information to complete before the commercial launch"). Appendix.

### Product path

**`/login`, `/register`**: two-column screen (form, illustration of a village on an island with "The game ends. The story continues."), social sign-in, "visit without an account" option (open a local file or the public gallery).

**`/account`**: display name, email, password (12 characters minimum), linked providers, with precise error messages.

**`/gallery`**: the central page. Storage gauge (used, reserved, deletion in progress), list of captures with area renaming, grouping by world, opening in the viewer, link sharing (create, revoke), publishing to the public gallery (with moderation), 30-day trash, permanent deletion, mod pairing with a 6-digit code (5 minutes, single use), empty state "The first memory is still to come".

**`/viewer`**: full-screen Three.js viewer ("Drop your world here"). Studio: time of day, sky, clouds, weather, water, free camera. Timeline mode ("Your world through time"): dated captures of the same place with a slider.

**`/share/:token` and `/public/:id`**: the same viewer without the account interface, with the invitation "Keep your own worlds".

### Operator path

**`/admin`**: dashboard (cards to the allowed sections, counters of pending and reported publications for moderators, a section bar shared by every admin page). **`/admin/users`**: service figures (accounts, captures, volume, paired devices, archived objects), account search, granting and removing the administrator role, log of the last 50 changes.

**`/admin/diagnostics`**: mod diagnostics sent with consent, grouped by error, filters by mod and API version. Administrators only.

**`/admin/moderation`** (old URL `/moderation`, redirected): queue of publications and reports, decision with a reason, no deciding on one's own publication.

## 4. Audit: what is useful, what is not

### What is useful

1. **The viewer, the gallery and sharing**: this is the product. Nothing else on the site justifies the visit.
2. **Installation and versions**: the only reason to come the first time. Troubleshooting is a real asset.
3. **The FAQ, in a short version**: the answers on privacy (private by default, nothing sent before pairing, revocable link) are what reassures a parent or an admin.
4. **The legal texts**: mandatory as soon as the site is public.
5. **Administration and diagnostics**: useful to operators, but they are not site pages.

### What is not, or not yet

1. **Three information pages saying the same thing**: `/concept`, `/how-it-works`, `/installation` and the FAQ overlap on pairing, the M key, automatic uploads, depth and sharing. A visitor reads the same explanation three times.
2. **Four "discover" pages**: `/open-source`, `/nostalgia`, `/sharing`, `/ranking` share the same skeleton and have little content of their own. The strong lines ("Remember our first house?") work better on the landing, where the film backs them up.
3. **A one-post blog**: an empty blog does not signal seriousness, it signals something unfinished.
4. **A pricing page without payments**: a calculator that says "payments not enabled" creates an expectation without meeting it. Prices are not fixed either.
5. **A public gallery and a ranking with no content**: the demo with fictional data ("Our first house", 24 hearts) fakes a community.
6. **A separate changelog**: the information is already in each release.
7. **Operator tools on the same site**: no place in a public design system; they need another frame (tables, density), not a marketing page.

### The underlying problems

1. **Three visual systems side by side.** The landing follows the game's design system (pixel font, slate, copper, bevelled panels). The installation, account, admin and auth pages use the `mm-*` kit (`theme.css`, `album.css`, `auth.css`, 3,400 lines) with unrelated fonts and shadows. The information pages are raw Tailwind (`max-w-3xl`, `underline`). Going from one page to another feels like changing sites.
2. **The jump from landing to app is abrupt.** The visitor leaves a full-screen film and lands on a white app page, with another banner, another footer and another visual language.
3. **Routes that repeat the landing.** The language selector and the navigation existed twice (one version in the landing, one in `SiteLayout`).
4. **A promise bigger than the product.** The site talks about a public gallery, a ranking, timelapse, pricing and a blog, while the product delivers: capture, upload, view, share by link.
5. **Texts that admit work in progress** ("information to complete", "demo, fictional data", "in preparation"). Honest, but they pull the perception toward a draft when they are everywhere.
6. **Costly code**: 12,000 lines of pages to maintain under coverage thresholds, for pages few people visit.

## 5. Plan to bring everything into the design system

### Principle

A single visual voice, the design system's: the game font for titles and controls, a sans-serif reading voice for text (`--ds-rd-*` variables), slate and copper, bevelled panels, four durations and three motion curves. Each page is an assembly of existing components: `.mc-section`, `.mc-step`, `.mc-tip` (panel), `.mc-btn`, `.mc-faq`, `.mc-select`, plus a few components to create (list below).

### Proposed site map (from 27 routes to 8)

| Page | Takes over | Form |
|---|---|---|
| `/` | Landing + concept + short FAQ + "open source" and "nostalgia" sections as anchors | The film and its sections, already done |
| `/installer` | `/installation`, `/how-it-works`, `/versions`, `/changelog` | One page with anchors: choose your loader, download, six steps, troubleshooting, collapsible release notes |
| `/connexion` | `/login`, `/register` | A single centered panel with a toggle, over the film's scenery (still image) |
| `/galerie` | `/gallery`, `/account` (as a side panel), pairing, trash, storage | Grid of "Minecraft interface" cards; pairing as a welcome card |
| `/souvenir/:id` | `/viewer`, `/share/:token`, `/public/:id` | Full screen, a game toolbar, studio as a collapsible panel |
| `/aide` | full `/faq` | List of `.mc-faq` with search |
| `/mentions` | `/privacy`, `/terms`, `/legal` | One page, three anchors, reading voice |
| `/admin/*` | `/admin`, diagnostics, moderation | Outside the public design system: same slate and same tokens, table density, protected |

Suspended (to bring back only once they have real content): blog, pricing, public gallery and ranking.

### Components to create

1. Design system **form field**: label, bevelled input, error below the field, copper focus (sign-in, account, pairing).
2. **Memory card**: thumbnail, area name, date, actions (open, share, trash) with the game's confirmation window.
3. **Storage gauge**: an inventory bar (full and empty slots) rather than a web progress bar.
4. **Viewer toolbar**: a hotbar (9 slots) for camera modes, time, weather, sharing.
5. **Operator table**: dense rows, sticky header, for administration.
6. **Toast**: a short "game interface" message (already sketched in `.mm-toast`).

### Motion (already in place, to reuse)

FAQ disclosures, language selector and mobile menu (sections 9 and 10 of `charter.css`). To add for the product pages: staggered entrance of gallery cards, opening and closing of confirmation windows, an "uploading" state for the gauge, seamless transitions from the viewer to sharing.

### Rebuild order

1. `/installer`: the first useful page for a visitor, all the content already exists.
2. `/connexion`, then `/galerie` with pairing: without them, the mod can no longer upload its captures.
3. `/souvenir/:id` (viewer and sharing): the 3D engine is intact on the tag.
4. `/mentions`, before the public launch.
5. `/aide`, then administration.

### Decisions this document does not make

- Keep `/pricing` in reserve or delete it as long as payments do not exist.
- Whether the public gallery and the ranking open one day (moderation is already coded on the API side).
- Which default language for the site (French today, with 8 catalog languages).
- Route names: French (`/installation`) or English (`/install`).

## Appendix A: texts of the removed pages

The texts are given in English, the catalogs' source language (French is the default display language). They were extracted from the code; short fragments are pieces of sentences around `<code>` tags.

### Template pages (`content/discovery.ts`)

| Route | Label | Title | Lead |
|---|---|---|---|
| `/open-source` | Code we can share | A memory that does not depend on a black box. | A mod, a GLB file and a public repository. See how it works, suggest an idea and keep a copy at home. |
| `/nostalgia` | The places that matter | Remember our first house? | The crooked roof. The shared chest. That path we took every evening. Keep a place, and everything it brings back. |
| `/sharing` | A gallery to share | Invite people back, even if they no longer play. | No need to launch Minecraft to show a build. A 3D memory, a link you choose to share, and others can explore it. |
| `/ranking` | Builds to discover | Small worlds deserve their moment too. | A cabin can tell as much as a megabase. Discover voluntarily published memories and the places visitors love. |

Points and notes:

- `/open-source`: Source you can inspect, An open 3D format, Files that stay yours. Note: The ambition is open source. The repository is public, but a redistribution license still needs to be chosen; visibility alone does not grant those rights.
- `/nostalgia`: Revisit in your browser, Keep several moments, Pass on a memory. Note: A 3D memory keeps captured shapes and textures. It does not preserve the entire game or replace your Minecraft backup.
- `/sharing`: A gallery that starts private, A link accessible without an account, Sharing you can revoke. Note: The demo explorer uses illustrations. No private captures are published there. The community public gallery is in preparation.
- `/ranking`: Discover by theme, Favorite a place, Try the ranking. Note: Memories stay private without an explicit submission; publications and votes can be withdrawn.

Demo memories: "Our first house" (With friends, 24 hearts), "The riverside village" (Builds, 42), "The winding garden" (Exploration, 31).

### Blog: "A first memory, with a familiar path" (14/10/2026)

Minemories captures blocks in a loaded Minecraft area and creates a GLB containing its shapes and textures. Revisit the place in your browser. A capture does not replace a world backup and cannot resume your game.

The tested combination is Minecraft Java 1.21.1 and NeoForge 21.1.248. In a test world, wait for terrain to load and use /minemories export 16. A 16-block radius lets you check the result before capturing a large base.

By default, capture.glb is in the export folder of your user directory. Pair the mod with your account to send captures to your private gallery. AFK captures are enabled by default and upload automatically after pairing; you can disable them in the M menu.

### Legal texts

**Your memories, your choices (privacy).**
Preferences on this device: The tutorial stores your choices and optional name in your browser; you can clear them. Your language preference, demo favorites/votes and estimates you choose to save are also stored on this device.
Optional web diagnostics: Web diagnostics are off by default. If this deployment configures Sentry, you can allow them and withdraw consent on this page for this device. Only fixed error categories and public editorial page routes are transmitted, without raw messages, account details, captures, codes or private URLs. Sign-in, gallery, viewer and sharing pages are excluded. The receiving server sees the connection IP address; its region and retention must be documented before activating the service.
Account and gallery: Sign-in uses a session cookie. Uploaded captures and their metadata belong to your account; the gallery is private by default. Avatars may load from an external service. After pairing, AFK captures can upload automatically.
Links and deletion: A shared link can be forwarded and gives access without an account. Revocation stops future access, not copies already made. Trash retains captures for 30 days; permanent deletion frees space once processed.

**Using Minemories (terms).**
An experimental version: Keep your Minecraft backups and local files. Compatibility with every modpack, permanent availability and lifetime online storage are not guaranteed.
Capture and share: Respect server rules and the rights of people whose builds or information appear in your captures. Check the contents before creating a shared link.

**About this service (legal).**
Independent project: Minemories is an independent, unofficial project, not endorsed by Mojang or Microsoft. Source code and mod releases are available in the public For-Hives/minemories repository.
Information to complete: Publisher and hosting details and the personal-data contact still need to be completed before commercial launch.

### Pricing (`content/pricing.ts`)

Creation: €2 per snapshot. Cloud: €6 the first year, €5 the second, €4 the third, €3 after that, per snapshot per year. Calculator limited to 100 snapshots and 10 years.

### Information pages and install guide (text extracted from the code)

The following is extracted automatically from the files `InfoPages.tsx`, `InstallationPage.tsx` and `InstallationSteps.tsx`.

#### /concept

- A base built with friends, a castle with your child, a first village: these are memories too. When the server closes, finding the right versions and all the mods to revisit them can be difficult.
- Minemories turns an area of Minecraft into a 3D memory you can open in your browser. Once captured, you can revisit it without starting Minecraft or reinstalling the modpack.
- A memory to explore, a backup to keep
- The capture is a three-dimensional snapshot of a place at a moment in time. You can look around, but cannot resume the game, break blocks or recover your inventory. Keep a world backup too if you want to keep playing: the 3D memory does not replace it.
- For you and the people you play with
- At the end of a season, an admin can capture the group's places before closing the server. A parent can keep a build made with their child. An occasional player can revisit their house, and a modpack creator can keep a record of their modded builds.
- What you can do today
- Create my first memory, step by step

#### /how-it-works

- From Minecraft world to 3D memory
- 1. Install and open the world
- on your computer, then open your world or join your server using its usual compatible profile. The server must still be accessible to capture its builds.
- 2. Choose a small area and capture it
- For your first attempt, stand near the build and type
- By default, underground capture is limited to the depth visited in this area, with at least five blocks of margin below the visited position. Entering a cave extends future captures of that area. Tracking starts with this mod version and stays on your computer. Cavities above this limit may still appear. Advanced mode can capture the full height; an explicit selection keeps the height of its two corners.
- For a precise area, stand at the first corner and enter
- , then at the opposite corner with
- clears the selection.
- The M key opens the Minemories menu. In simple mode, enter your gallery code, then click “Capture and upload”. The button becomes available when your account is connected and a world is open. If M is already assigned, change its shortcut in Minecraft controls.
- The sides and bottom of the capture are closed with a dirt/stone appearance, like an extracted piece of world. These faces are added to the 3D memory: no blocks are changed in Minecraft.
- 3. Find the file on your computer
- The result is a file named
- under your user directory (
- ) by default, not in the world folder. In advanced mode, you can choose another folder and click “Export locally” without connecting an account. Here GLB means a 3D file containing shapes and textures. With the current mod version, every dated capture and its information are also kept in the subfolder
- points to the latest export. In the M menu, “Local captures” lets you choose and upload an older memory. Keep your own backups: the history takes up space on your computer.
- 4. Upload to your gallery, if you choose
- Create your account
- Generate a pairing code in the gallery. Pairing links this Minecraft installation to your Minemories account.
- In Minecraft chat, enter
- replacing CODE with the six digits. The code expires after five minutes and can only be used once. Never type your password in Minecraft.
- to upload the capture, then check that it appears in the gallery. The mod accepts files up to 450 MiB (about 472 MB). If the limit is exceeded, capture a smaller area.
- AFK captures are enabled by default: after 5 minutes of inactivity, at most once every 4 hours, even in the pause menu or while Minecraft is in the background. Without a connected account, they stay in your local folder. With a connected account, they also upload to your private gallery. You can disable them in simple mode; advanced mode lets you adjust the delays and capture radius (32 blocks by default). A previously saved disable preference is preserved.
- Use your own API (advanced)
- by default. In “Advanced mode”, you can enter the HTTPS address of a compatible self-hosted Minemories API and an absolute path for the local folder, then click “Save”. HTTP is accepted only for an API on localhost. Changing API disconnects the account: generate a new code in the gallery belonging to that API. The “Minemories API” button restores the official address; save to apply it.
- 5. Share only what you choose
- Before sharing, check the capture and its associated information: coordinates, server or world name, and single-player world seed may be recorded. Avoid places or text containing personal information and ask the other builders for permission.
- Is this a backup of my world?
- No. It is a static 3D model of an area loaded in the game. It cannot resume your game. Keep your Minecraft backup separately.
- Do I need an account or mod to view a memory?
- A shared link opens without an account or mod. You need a Minemories account to upload to your private gallery.
- Can I keep a vanilla build?
- Yes, if you can open a copy of the Java 1.21.1 world with NeoForge 21.1.248 and Minemories. Vanilla means without mods: the profile used for capturing must still load the mod. Bedrock and consoles are not supported.
- Is it compatible with every mod?
- This is not guaranteed. Validated Java 1.21.1 targets are detailed on the Mod versions page: NeoForge, Fabric, Forge and Quilt using the Fabric JAR. Blocks with custom rendering may be incomplete. Try a small capture and inspect it before capturing your whole base.
- Do I need to install anything on the server?
- Minemories is a client mod on the player's computer, not a server plugin. Ask the admin for permission, keep the profile expected by the server and capture only permitted, loaded areas.
- Who can see my child's memories?
- The gallery is private by default. A link created with Share gives access to anyone who has it, and they can forward it. Check the memory and its information with your child before sharing. Revoking the link stops future access through it, not copies already made.
- Does the mod upload everything automatically?
- AFK captures are enabled by default after 5 minutes of inactivity, at most once every 4 hours, even while paused or in the background. Without a linked account they stay local; with one they upload to your private gallery. Simple mode can disable them; advanced mode adjusts delay, frequency and radius (32 blocks by default). A saved disable preference is preserved. Disconnecting the account stops uploads but keeps local captures. Export locally does not upload anything.
- How can I find an older capture?
- Not directly today. You must be able to reopen the world in a compatible environment to capture it. ZIP world imports and automatic recovery of old modpacks are not available.
- Why is part of the build missing?
- The mod captures an area and the elements loaded by the client. Move closer, check your selection's corners and height, reduce the area and try again. Some modded rendering may not be reproduced.
- The code does not work or uploading fails: what should I do?
- Is there timelapse, 3D printing or a subscription?

#### /faq

- Frequently asked questions
- New here? Start with
- installation guide
- All the steps to capture, upload and share
- Minemories is an independent, unofficial project, neither approved by nor associated with Mojang or Microsoft.

#### /installation (steps and troubleshooting)

- Install NeoForge
- Download the mod
- Place the file
- Minecraft Launcher
- Another launcher
- ~/Library/Application Support/minecraft-minemories
- Select the text above to copy it.
- Minecraft Java Edition on a computer
- This guide covers NeoForge, which lets the game load the mod. Other validated versions are listed under
- To discover Minemories, start in a
- new test world
- I want to use my usual world or server
- Copy the world and profile before making changes. A profile (or instance) groups the game, its mods and settings. Keep all mods required by your world or server. Do not change its version or loader for this tutorial: if it does not already use Java 1.21.1 and NeoForge 21.1.248, ask its administrator for help.
- Minemories installs on your computer, not on the server. Check the server rules before capturing.
- In Minecraft Launcher, open
- Installations → New installation
- , choose version
- and launch it once. Close the game and launcher.
- Java 21 (Temurin, official site)
- if you do not have it. Choose your system, JDK 21 and your computer's architecture: x64 for Intel/AMD, aarch64 for Apple Silicon. The Java bundled with Minecraft is not always available to open an installer.
- the NeoForge 21.1.248 installer
- file with Java, select
- , then confirm. Wait for the success message.
- Reopen Minecraft Launcher. Under
- , enable display of
- versions if necessary. Edit the NeoForge installation created using
- … → Edit → More options
- Game Directory
- , choose a new folder dedicated to Minemories using
- Copy the suggested game folder
- Paste %APPDATA% into File Explorer's address bar, then create the .minecraft-minemories folder.
- The ~ symbol means your user directory. Create the suggested folder in your file manager, then select it in the launcher.
- this NeoForge installation
- once, then close Minecraft. This creates the folder
- Official Java and NeoForge guide
- In Prism Launcher, ATLauncher, GDLauncher or MultiMC, create a
- instance and add loader
- For an existing world, copy its compatible instance and keep its mods. If your launcher does not offer these exact versions, do not choose a random alternative: use the Minecraft Launcher walkthrough or ask for help.
- Launch this instance once, then close the game. This walkthrough still needs in-game validation.
- , choose Minecraft, then
- Create Custom Profile
- Name it Minemories, choose
- Launch the profile once, then close the game. If the copied profile is locked, allow editing in its options.
- and sign in to your Minecraft account.
- Create an instance running
- Launch this instance once, then close the game.
- This local-file walkthrough still needs in-game validation.
- Official Modrinth App help
- In Minecraft Launcher → Installations, find the NeoForge profile configured in step 2 and click its
- In CurseForge, open the
- menu of the Minemories profile, then
- In Modrinth App, open the Minemories instance folder using its
- In your launcher, open the
- instance folder
- of your chosen NeoForge 21.1.248 instance. Use that instance's folder button or menu.
- Close Minecraft completely
- before copying the file.
- Open the subfolder
- , copy the Minemories JAR into
- NeoForge profile folder
- The file stays a
- : do not extract it, run it or put it in
- Restart Minecraft from
- In the game menu, open
- Create a small test world, wait for terrain to load, then press
- Can you see the Minemories menu? The installation is recognized.
- The next step also checks that capturing works.
- If M opens something else, go to
- Options → Controls → Key Binds → Minemories
- and choose an unused key. You can also find the Minemories button in the pause menu or options.
- For your first attempt, approach a small build and wait for terrain to load. Open chat with
- , paste this command, then press Enter:
- /minemories export 16
- Copy the first capture command
- Wait for the export completion message. The number 16 means a radius of 16 blocks: this small capture lets you check the result before capturing a large area.
- Open the folder below
- by pasting this path into File Explorer's address bar
- using your file manager (~ means your user directory)
- Copy the first memory folder
- Find the memory in my private gallery
- Create your account
- Generate the six-digit pairing code. In Minecraft, press M, enter the code and connect your account. The code expires after five minutes: generate another if needed.
- Capture and upload
- in the M menu. Wait for confirmation, then check that the capture appears in the gallery.
- AFK captures are enabled by default after 5 minutes of inactivity, at most once every 4 hours. Once your account is linked, they upload automatically to your private gallery. You can disable them in M. Without a linked account, they stay on your computer.
- The export folder can be changed in the mod's advanced settings.
- Learn more about captures and sharing
- Your computer. Your journey.
- The steps adapt to your choices. You can change them at any time.
- You launch Minecraft with…
- Your first name (optional)
- For a guide that feels a little more yours
- Reduce animations
- If a step gets stuck
- The NeoForge installer will not open
- You need Java 21 to open the installer. On Windows, try right-click → Open with → Java. If it is missing, install Temurin 21 using the link in step 2. On macOS or Linux, follow
- the official NeoForge guide
- to run the installer. Do not change security settings at random.
- I cannot find the mods folder or the mod does not appear
- if it is missing. Check that the file ends in .jar, not .jar.zip, then fully close the game and restart the NeoForge 21.1.248 profile. Worlds belong in saves; the mod belongs in mods.
- M opens another menu, or the command is unknown
- Change the Minemories key in Options → Controls → Key Binds. An unknown command often means the mod is not loaded: check its entry in Mods, the versions and the profile folder.
- Minecraft crashes at startup
- Check Minecraft 1.21.1, NeoForge 21.1.248 and that Minemories is not duplicated. Remove the Minemories JAR to return to the previous profile. Ask for help with the error message and versions used; do not delete your world.
- The capture is empty, incomplete or uploading fails
- Wait for terrain to load, move closer to the build and try again with radius 16. Some modded blocks are not reproduced faithfully. If uploading fails, keep capture.glb and view it locally. Check your connection, generate another code if five minutes have passed and retry; the mod upload limit is 450 MiB.
- Your first memory starts here
- Install the Minemories mod
- One small file.
- A new way to keep your worlds.
- We will take this one step at a time. No coding required: choose your computer, follow the guide and keep your first memory in 3D.
- Start installing
- Minecraft Java 1.21.1 · NeoForge 21.1.248 · Experimental mod
- Just here to view a shared memory? Open its link: there is nothing to install.
- Step-by-step guide
- From download to first memory.
- / 6 steps checked
- Installation progress
- Installation steps
- My memory opens in 3D
- Check a step when you have completed it. You can also move freely between steps.
- Your first memory is here.
- If the capture opens correctly, you have completed this first trial. Keep a world backup too: a 3D memory cannot resume your game.
- Explore captures, the gallery and sharing →
- Your first name, choices and progress stay in this browser on this device. You can close this page and return.
- Start again and clear my choices
- install-caption install-final-note
- Manual Windows guide without JavaScript
- Download the mod from

