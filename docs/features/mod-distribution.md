# Mod settings and distribution

## Player flow

The target is still Minecraft Java 1.21.1. The release matrix contains NeoForge 21.1.248, Fabric Loader 0.19.5 with Fabric API 0.116.17+1.21.1, and Forge 52.1.19. Quilt 0.30.1 uses the Fabric JAR; see the [trials and their limits](loader-support.md). The mod is installed on the client only.

**Simple mode (default)**: open with M, get the six-digit code from the gallery, connect the account, then use “Capture and send”. This button requires a linked account and an open world. The service in use is shown: Minemories or a custom API. “Disconnect this account” removes the local credentials and stops automatic uploads; local AFK captures stay on, and online memories are not deleted.

**Advanced mode**: enter a compatible API address and a local folder, save, then export locally around the player or on a selection already defined with commands. A local export triggers no upload. The radius of menu captures follows the advanced setting (32 blocks by default); use `/minemories export 16` for a smaller trial. Timestamped captures and their metadata stay in the `history` subfolder of the configured folder. `capture.glb` and `capture.json` remain copies of the latest export. **Local captures**, available in both modes, lets you pick and upload an earlier capture. See [the local history](local-capture-history.md).

The “Minemories API” button fills in the official address, but it only changes after “Save”. Unsaved changes are discarded when leaving advanced mode. Switching API removes the token and the account ID, then requires a new code from that API's gallery. Never share `config/minemories.properties`.

**Suggested areas**, in simple mode or via `/minemories suggestions`, ranks
64 × 64-block areas by local active time. The list stays separate from the
selection and from uploads; see [the score and its limits](visited-zones.md).

On a new installation, AFK is on: 5 minutes of inactivity, at most one capture every 4 hours, 32-block radius. An existing explicit opt-out is kept. Simple mode can turn it on or off. The advanced “AFK settings” sub-screen sets inactivity (1–1440 min), interval (1–10080 min) and radius (2–128 blocks), persisted in the properties. Captures stay local without an account, then are uploaded to the linked account's gallery. The check uses real time from each adapter's frame hooks, which keeps running when paused and in the background; no menu blocks it. The player's keys, clicks and movements reset inactivity. AFK captures are prepared progressively between frames, then written on a worker and uploaded at a limited rate; see [the flow, its limits and measurements](spooling-glb.md). The player's return suspends reading; context changes cancel an incomplete capture.

## Local configuration

`config/minemories.properties` in the profile folder holds the persistent settings:

| Key | Default value / rule |
| --- | --- |
| `afkSnapshots` | `true` by default; a saved opt-out is still respected. |
| `captureFullHeight` | `false`; advanced mode can capture the full height of the dimension. |
| `afkIdleMinutes` / `afkIntervalMinutes` / `captureRadius` | `5` / `240` / `32`; advanced settings for AFK captures and the radius of menu captures. |
| `apiUrl` | `https://api.minemories.net`; an existing value is kept. Without a saved value, `MINEMORIES_API_URL` remains usable for development. HTTPS required; HTTP only accepted for localhost, 127.0.0.1 or ::1. No credentials, query or fragment in the URL. |
| `exportDirectory` | `~/export`; absolute path or `~/` expansion, normalized before saving. The folder is created on export. |
| `deviceToken`, `deviceId` | Created on pairing; removed on disconnect or when switching API. |

The official URL answered `{"status":"ok"}` to `GET /healthz` on 10 October 2026. This check does not validate authenticated pairing or an upload to the production service.

## Download from the site

The front end does not compile Java and contains no JAR. The `/installation` page picks a Minecraft version, then a loader among the enabled targets, reads the API's public index (`/downloads/index.json`) and offers the JAR of the latest version for that target, served by `/downloads/<target>/latest` with its SHA-256. No ZIP is needed: the player drops the JAR into `mods`, without extracting or double-clicking anything. The JAR is still experimental (`-beta.N` prereleases).

JARs are built on the VPS by `bun mod release`, stored in S3 storage (3 versions per target) and then served by the API; details are in [the release flow](automatic-releases.md). The web deployment uses `railpack.web.json` without Java.

## CI and publishing

The **Quality gates** workflow only checks that the mod compiles and passes its checks (1.21.1 root and one cell per enabled target); it produces, keeps and publishes no JAR. Modrinth and CurseForge publishing is done by `bun mod publish` (or by the end of `bun mod release`) with `mod/catalogs.json` and the VPS's `MODRINTH_TOKEN` / `CURSEFORGE_TOKEN` tokens, without rebuilding the stored archives. It stays disabled until the projects are created; the procedure is in [automatic-releases.md](automatic-releases.md).

Before publishing to a catalog:

1. Create the official pages on Modrinth and CurseForge and prepare descriptions, license and artwork.
2. Fill in `projectId` and `enabled` in `mod/catalogs.json`, then the tokens in the VPS environment.
3. Validate the JAR of each selected target in game, then try `bun mod publish --dry-run`.

## Other launchers

Modrinth and CurseForge are the chosen publishing destinations. Prism Launcher, ATLauncher and GDLauncher offer downloads from these catalogs; there is no need to send them a second JAR. A compatible instance in another launcher can use the manual JAR. This does not amount to in-game validation of each launcher, and no universal publication on every manager is announced.

Official sources consulted on 10 October 2026: [Modrinth Create a version](https://docs.modrinth.com/api/operations/createversion/), [CurseForge Upload API](https://support.curseforge.com/support/solutions/articles/9000197321-curseforge-upload-api), [Prism](https://prismlauncher.org/wiki/getting-started/download-mods/), [ATLauncher](https://wiki.atlauncher.com/getting-started/downloading-content/), [GDLauncher](https://gdlauncher.com/).

## Validation

Settings tests: official default and overrides, rejection of dangerous URLs, credentials invalidated when switching API, account kept when changing folder, validation without partial mutation, local paths, AFK default, and private permissions/atomic writes.

Storage and `bun mod` tool tests: `node --test scripts/mod/*.test.mjs scripts/mod/*/*.test.mjs`. React tests: download and fingerprint, network/manifest errors, no broken link, and cancellation on page change.

In-game verification must cover simple/advanced modes at different GUI scales, folder persistence, a real local export, switching API and re-pairing, connection errors, uploading to the gallery and returning to the previous screen. Test on a throwaway world and keep a copy of the profile before installing.

Local validation of 10 October 2026: the NeoForge 21.1.248 development client started after the `:core` sources were declared in `neoForge.mods.minemories`. The initial `NoClassDefFoundError: dev/minemories/core/GlbScene` crash is fixed. The logs show a real export completed from the test world (7,369,322 blocks, 291 materials). The user validated in game the readability of both modes and folder persistence after closing/reopening. An AFK test temporarily set to 1 min / 1 min / radius 8 produced several captures with `paused=true`, then successful uploads to the production API. The user confirms the test; the local settings were reset to 5 / 240 / 32. The validation covers the development client; the published JAR still has to be tested separately. Both workflows pass `actionlint` 1.7.12.


## Capture depth

By default, captures around the player, manual or AFK, cut the underground five blocks below the lowest depth visited in the chunks concerned. On the first capture, the surface terrain also serves as a reference to avoid an empty capture if the player is flying. Trips underground then extend the captures of that area. Tracking also works when AFK captures are off.

This history is local, separated by world/server, dimension and player. It is saved in `config/minemories/exploration/` every ten seconds, before a capture and when changing world. It keeps at most 100,000 chunks per history; the oldest can be evicted. Visits from before this version are not recovered. The threshold is shared across the captured area: unvisited cavities above that depth can still appear. This is not a reconstruction of only the blocks the player saw.

The full comparative validation (surface/cave/return/other area, dimensions,
restart and another player) is documented in
[Visited depth validation](exploration-depth-validation.md).

The **Depth** button in the advanced settings switches back to the full height of the dimension. An explicit selection always keeps its two corners. Tracking modifies no block in the world and loads no missing chunk. The sides and bottom of the cut get a cosmetic cross-section: dirt in the three blocks below the surface, then stone. Cave openings that meet the edge are closed at that plane, without filling the cave inside. Fluids above a lake bed keep their surface and transparent cut faces, even if the water continues outside the capture; underground fluids may meet the stone cross-section. Transparent and non-cube blocks keep their model. No wall is added above the terrain and no block in the world is modified.

## Version history

The `/versions` page shows the history of stored JARs (three versions per target), reachable from the tutorial. See [the sources, states and limits](release-history.md). The default download is still NeoForge 1.21.1; the other downloads use the targets enabled in `mod/targets.json`: see the [loader matrix](loader-support.md) and its validations.
