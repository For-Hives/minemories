# Information for players

## Sources and scope

The `/concept`, `/how-it-works`, `/installation` and `/faq` pages build on the need described in `VISION.md`, sections 2 and 3: keep the places built together, reduce the friction of coming back, and make memories viewable. The ambitions of the initial document are not shipped features. Current facts are cross-checked against `README.md`, `docs/features/loader-support.md`, the mod commands and the gallery/sharing panels.

The content was written in French and reuses the English labels of the existing buttons. The installation page now has an interactive guide: system and launcher, optional first name, steps remembered locally, free navigation and an animated SVG illustration that honours reduced motion. The guides are public and reachable from every page, including on mobile.

## Working personas and clarity review

These personas are design hypotheses, not user interviews. The review below checks that each question is answered by the content; it does not replace a test with real people.

| Audience / persona | Situation and need | Comprehension question | Answer to find / path |
| --- | --- | --- | --- |
| Server admin — Léo, 22 | Ending a season with six friends; wants to keep the places before shutting down | Do I need to change the server? Is this a backup? | Client-side installation, server rules, loaded areas; Concept explains to keep the save; How it works leads to revocable sharing |
| Parent — Camille, 40 | Wants to keep the castle built with their child without making it public | Who sees the file? When is it uploaded? | How it works and FAQ distinguish local, private gallery and forwardable link; they spell out AFK after pairing and the associated information |
| Young adult — Sarah, 19 | Wants to revisit her friends' base after the season, without reinstalling the pack | Do I need the mod or an account to visit? | Concept and FAQ: an existing capture can be viewed through a link without an account or the mod; a closed server cannot be recovered directly |
| Teen — Alex, 15 | Wants to capture his build and show it to his friends | Which file do I copy? Where? What do I type? | Installation defines JAR/profile/loader, numbered steps; How it works gives exact commands and explains CODE; sharing and personal data are explicit |
| Casual vanilla — Jules, 30 | Has never installed a mod; wants to keep his solo house | Java or Bedrock? Will I modify my world? | Installation states the versions, recommends a copy, defines the terms; FAQ explains why a NeoForge profile is required even for a vanilla world |
| Pro modder — Morgan, 27 | Uses several instances; wants to check how faithful a pack is | Which loader/build? What are the rendering and export limits? | Installation gives the versions and the profile folder; FAQ lists renders that are not guaranteed; How it works specifies selection bounds, local history and size limit |

## Editorial check performed

- Each path has an entry point, an action and an expected result (mod visible, file exported, capture present in the gallery).
- The words launcher, profile/instance, loader, JAR, GLB and pairing are explained on first use in the relevant guides.
- Current features are kept apart from timelapse, ZIP import, other loaders, printing and old pricing scenarios.
- Viewing without installing is distinguished from creating, which requires a compatible Minecraft.
- No promise of universal compatibility or permanent hosting; privacy and automatic AFK uploads are explicit.
- The button downloads the JAR included in the website build; it stays hidden if the manifest is missing or does not match the target. Catalog releases are in preparation.

## External sources checked on 10 October 2026

- [CurseForge — Getting Started](https://support.curseforge.com/support/solutions/articles/9000218572-getting-started): profiles and loaders, application.
- [Modrinth App — official help](https://support.modrinth.com/en/collections/7804910-modrinth-app): instances, folders, loader versions.
- [NeoForge — user guide](https://docs.neoforged.net/user/docs/): Java 21 and client installation.

The Modrinth and manual paths are documented instructions, not an in-game validation of Minemories. Only the CurseForge profile documented in `docs/features/loader-support.md` has been exercised.

## User validation still to do

Have someone representative of each audience read the pages and complete their path without verbal explanation. Check that they can say: "a capture does not replace a backup", "the link can be forwarded", "AFK captures are on by default, and are only uploaded automatically after the account is connected", and that they can find the exported file. Note hesitations and fix the text. Test the three installation paths separately with an officially distributed JAR.

## Checks on this change

- `bun format` and `git diff --check`: passed.
- Web part of `bun check`: typecheck and 40 tests passed, 100% utility coverage; interaction test added for navigation between the four guides and the installation anchors.
- API part of `bun check`: typecheck and 35 tests passed.
- `bun web:build`: passed.
- Full validation after setting up the local JDK 21 and fixing the Java test dependencies: `bun run build` passed (includes `bun check`, the web bundle and the mod JAR). The real Garage test is still skipped without a dedicated environment; no additional in-game validation was done.

## Interactive installation guide (14 October 2026)

The default path uses the Minecraft Launcher and the official NeoForge 21.1.248 installer. Windows, macOS and Linux have tailored paths; CurseForge, Modrinth App and other launchers use the same local JAR, without claiming a catalog release. The first trial exports a small area with `/minemories export 16`, then opens the GLB without an account. Linking a gallery stays optional and explains AFK uploads after pairing. The mod menu labels were cross-checked against `MinemoriesScreen.java`.

Progress is self-declared: clicking "Done" does not attest to the game's state. The choices, optional first name and steps are kept only in localStorage, can be cleared and are never sent to the server. The path stays usable when storage or the clipboard is blocked. Animations honour `prefers-reduced-motion` and the choice made in the guide. Step changes move focus to their heading for keyboard navigation.

On 14 October, the public manifest URL returned HTTP 200 with the SPA's HTML. The button being in the repository therefore did not prove the mod was available. The front end now queries GitHub's public releases and downloads the latest compatible JAR directly; no Java build or local JAR is needed to deploy it. The selection excludes drafts and incompatible assets; GitHub errors have a maximum timeout and a retry button. Deploying the front end and checking the public URLs are still required.

The Windows / Minecraft Launcher path reserved ten captioned screenshots (game version, Java 21, NeoForge installer, profile folder, downloaded JAR, mods folder, Mods list, M menu, local export and viewer). None was ever supplied; the slots and their README were removed on 10 November 2026 with the step-by-step guide (see below).

## Gallery form drafts (9 November 2026)

What the owner types in a gallery form and has not saved yet is kept in this browser's localStorage under one key, `minemories-form-drafts`: area names, snapshot names, the server name and the public publication form (title, description, category). Each draft is scoped to the signed-in account and the item, expires after 30 days, and the store keeps at most 40 drafts of at most 4,000 characters each. A draft is never sent to the server; it only becomes data there when the owner saves or submits it. "Discard draft" removes one draft, a successful save removes it too, and signing out removes every draft in this browser so a shared computer keeps no unsaved private text. Saved server and area names stay browser-only, as before (`apps/web/src/lib/stack-names.ts`), except that renaming a one-capture area also renames that capture on the server. The draft store is `apps/web/src/lib/form-drafts.ts`.

## Sign-in and sign-up: guided input

The password field offers Show/Hide, keeps the value and hides it again when focus leaves its group. The creation rule (12 characters minimum) stays visible; Caps Lock is flagged. Server errors receive focus and the form announces when it is waiting. Switching between sign-in and sign-up keeps the original destination.

This improvement addresses the six personas' hypotheses: Camille and Jules get persistent help to check their input; Alex gets touch targets of at least 48 px and 16 px fields; Léo and Morgan keep autocomplete attributes and the keyboard path; Sarah can still reach shared memories without an account. The additional text exists in French and English. This interface stores no password.

Validation: React tests for visibility, value preservation, hiding on blur, Caps Lock, input attributes, error focus and destination after a mode change. Browser check in Chromium and Firefox with the keyboard and at 390 px, with inspection of desktop/mobile screenshots. This technical check is neither a user interview nor a trial on a physical phone.

### Dedicated entry after the flow review

The sign-in/sign-up routes now use a dedicated layout: brand, help and language at the top, navigation between the two modes, the form, access to the public gallery, then legal links. The large footer and the decorative panel before the form are removed from these routes. On mobile, the illustration is hidden and the sign-in button appears on the first screen at 390 × 844 px.

- Camille/Jules: privacy by default next to the action, help available, a readable form with no decorative introduction to get past.
- Alex: mobile-friendly input and the email kept when switching mode; the password is not passed in the navigation state.
- Léo/Morgan: autocomplete and keyboard preserved, double submission blocked while waiting, destination honoured.
- Sarah: public gallery and share links reachable without an account. Opening a local GLB is a development tool, absent from production.

The existing SVG illustration is reused, with no 3D scene download or background animation. The form interactions and the help/language/legal links are tested. Chromium/Firefox were checked at 1440 px and at 360/390/768 px widths; preserving the email was exercised on a real route change. Checking in the built-in tab was refused by its URL policy; the checks were done in test browsers before that refusal.


### Local opening reserved for development

The GLB pickers and drag and drop are gated by `import.meta.env.DEV`. The production build offers no local file loading in the header, authentication, gallery or viewer. Visiting `/viewer` directly without an identifier leads to `/explore`. Remote captures (`/viewer?memory=…`), timelapses and share links keep their existing loading. The guides and public content point to pairing and uploading from Minecraft.

The tests run both modes: local import in development; in production, no controls, redirect without an identifier and rejection of a drop, with remote loading still working. The mod's local exports and backup downloads are not removed.

## Installation guide: simplified questions and real game screenshots (7 November 2026)

- **Questions**: the Minecraft version and the loader now show only their name (no more loader list, loader version or badge). The loader question is always asked and ends with "I have no mod loader yet".
- **Install the loader** only appears for that last choice. The guide then installs NeoForge on 1.21.1 (the validated Windows path, with its screenshot slots), otherwise Fabric when it is published, otherwise the version's first loader. A visitor who already has a loader goes straight to the download.
- **Place the file** gives the default `mods` folder of the official Minecraft Launcher (or that of the dedicated profile created by the guide), with the way to open it for each system (Windows + R, Go to Folder, Ctrl + L).
- **Launch the game** (formerly "Check in game"): launch the profile, open a world, press Esc; the Minemories button is at the top right of the pause menu (another corner if a mod already uses it). The Mods screen is no longer mentioned: it does not exist under Fabric without Mod Menu.
- **Create a memory** presents both ways: the "Take a memory" button of the M menu (radius 32), or `/minemories export 16` with the meaning of each part (`export`, radius 2–128, `selection`).
- The pause menu, M menu and command screenshots are real captures taken by the Fabric 1.21.11 client test, with a frame drawn by the page around the button to click. Update procedure: `apps/web/src/assets/tutorial/game/README.md` (rule restated in `AGENTS.md`).

## Installation, downloads and versions as readable pages (10 November 2026)

`/installation`, `/downloads` and `/versions` are now complete in the prerendered HTML; none of them has a `<noscript>` block any more.

- **`/installation`** is one page read top to bottom instead of a step-by-step wizard: before you start, the CurseForge app (it installs Fabric API itself: `mod/catalogs.json` declares it as a required dependency), the version, then the loader, the install, **connecting the game before the first memory** (pairing does not send memories taken earlier: those go through M → My memories → Send this memory), the first memory, a folded "without an account" note with the `export` folder, then the three FAQ answers of "If something goes wrong" (`pageQuestions.installation`). No version is chosen in advance (D9); a version with a single loader selects it. The version and loader cards only pick the download button (the API's newest JAR for that pair) and the loader notes (Fabric API, Quilt on 1.21.1, "playing without mods?", which installs Fabric where the version has it). A table lists every version and its loaders, "most tested" on 1.21.1 and "experimental" on 26.3, experimental versions last. A link from `/downloads` (`?minecraft=…&loader=…`) picks both and keeps its query string. The choice is kept in this browser only (`minemories-installation-v4`). The system detection, the Minecraft Launcher walkthrough and the export command left the page; the Blender guide will teach the command.
- **Where the Minemories button is**: the mod no longer adds it to the pause menu (`ClientRuntime.addPauseMenuButton` is a no-op); it is an icon in Options, beside "Credits & Attribution" when that button exists. The guide says "press M, it is also in Options". The `guide-pause-menu` and `guide-export-command` images stay in `apps/web/src/assets/tutorial/game/` but are no longer shown; the pause-menu shot is to be retaken on the Options screen (plan PR F2).
- **`/downloads`** adds a Java column (21, 17 or 25, from `mod/targets.json`) and links every published pair to `/downloads/<target>/latest` in the static HTML; the index adds the exact version, size and SHA-256 once loaded, and a cell only says "Not published yet" when the index says so.
- **`/versions`** reads the curated notes of `mod/release-notes/` at build time (`apps/web/src/lib/release-notes.ts`, the third reader of that format): the latest version with its first three notes and a Download button to `/downloads`, then each earlier version with its first note. Dates come from the downloads index when it still keeps the version. Notes are written in English; the ones shown are translated in the catalogues, keyed by their text, and a new or edited note is shown in English (marked `lang="en"`) until it is translated.

## Server closing, safety and the Blender guide (10 November 2026)

Three pages from the site plan, written in the catalogues like every other page (decision D14 on content modules is still open), all in `apps/web/src/pages/GuidePages.tsx`, prerendered, indexable and dated in `route-metadata.ts`:

- **`/server-closing`**: three honest options (ask the admin for the world, a playable copy with WorldTools and the admin's consent, a 3D memory), `#aternos` (Aternos's own help says a server unused for several months is deleted; no exact delay is written) and `#admin` (nothing to install on the server; the mod reads what the player's game already shows). The announcement to copy is one catalogue key rendered in the visitor's language and in French or English next to it, with `new URL('/installation?src=server', siteOrigin)`; the French text addresses each player with "tu", as the catalogue check requires. The install button carries `?src=server-closing`.
- **`/safety`**: five lines for parents, `#verifier` (this site or the CurseForge page, then a folded SHA-256 command per system), a table of what goes online before and after connecting the game (the metadata the mod really sends: date, position, dimension, biome, weather, world name and seed in single player or the server name or address and its icon; diagnostics as the mod describes them), what a link shows (the full list `/api/shared` returns today, decision D1), and deletion with the interim "contact address is coming soon" (D3).
- **`/guides/minecraft-blender`**: `/minemories export` (128 blocks, the command's default), `/minemories export <2-128>`, `select first|second` on the looked-at blocks then `export selection`, the `export` folder (`capture.glb` plus `history`), then Blender's glTF 2.0 import, one object per category and the scale to apply (see [GLB size](../features/glb-size.md)). It is an Article with a BreadcrumbList. There is no Blender screenshot yet, and no comparison table: only a sentence on tools that read the world save.

The header gains "Server closing"; its links now stay on one row and wait in the menu up to 1240 px (1440 px when signed in, with the account name from 1600 px), the language selector up to 1440 px, and the landing bar's links up to 1320 px.

## Copy pass in players' words (10 November 2026)

Owner direction for every public page, French and English first, the other languages in the same spirit: relaxed, direct and natural, the way players talk; nothing that reads as written by a machine or rushed.

- **Menu and footer links are the player's own question or a short spoken phrase**: "What is Minemories?", "How do I share a link?" (fr « Comment on partage un lien ? »), "See other players’ builds", "What if my server shuts down?" (fr « Et si mon serveur ferme ? »), "Open my build in Blender", "Is it safe?", "What’s new", "What’s coming next", "Found a bug? Tell us on GitHub". Page headings (H1) and route titles keep their search keyword.
- **Landing**: "Show your base to your friends" (fr « Fais visiter ta base à tes potes »); the server-closing line is the owner's « Garde le souvenir de ta base en réserve avant de la perdre à tout jamais. »; the server question answers « Non, c’est côté client : ça s’installe uniquement chez le joueur. »
- **English** uses contractions and plain verbs; no "unlock", "seamless", triple adjectives or poster slogans ("The game ends. The story continues." became "The server closes. Your base stays."). **French** keeps « tu », spoken turns (« ta base », « tes potes ») and a no-break space before `? ! : ;` and inside `« »` across both French catalogues.
- In-game labels quoted on the site (M → Take a memory, Auto memories, Connect, Settings → Privacy) still match the mod's `lang` files word for word.
