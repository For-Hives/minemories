# Preview, sharing and profile: fixes from 19 October 2026

- HDR bloom reduced from 0.24 to 0.12 (50%), without changing exposure.
- Artistic rain/snow selectable in the ambiences: 768 reused GPU particles around the player, stopped in Economy mode, reduced motion and dimensions without a sky. This is neither recorded weather data nor a collision simulation: particles can go through roofs and the ground. Leaves/grass stay still.
- Orbit centered on `minemoriesPlayerPosition`, pan disabled; switching between captures keeps the angle/distance around the new player. Leaving free movement restores the player framing. Older captures without explicit coordinates keep the surface framing.
- Sharing: readable/touch-friendly controls, a link that can be copied and opened, the same link recovered on reopening, explicit revocation and replacement. The server keeps the token encrypted with AES-GCM using a key derived from PAIRING_PEPPER, authenticated with the owner and the memory; only the owner API returns it. Additive SQLite migration. Old links without an encrypted copy keep working but must be replaced to become recoverable. Rotating the pepper invalidates existing links, as before. Tokens must not be logged.
- Publishing: button visible on the card; from the viewer's share panel, access to the matching publishing panel in the gallery, with focus/scrolling. Consent and moderation are still required; opening a panel publishes nothing.
- Profile: display name of 1 to 80 characters, server-side validation, session update without signing out. Email/password keep their confirmation and sign-out of sessions. For a social account without a local password, the interface points to the provider.

## Google and Discord

Configure `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and/or `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` on the API. Register the exact callback `${BETTER_AUTH_URL}/api/auth/callback/google` or `/discord` with the provider, then restart the API. The sign-in/sign-up buttons only appear for complete pairs; no secret is shipped to the browser. The return is restricted to a site URL. Automatic account linking by email is disabled. A signed-in user can explicitly link Google/Discord from their profile; providers already linked are no longer offered. Better Auth checks the session, the verified email and that it matches the account's address, with no implicit merge.

Enabling this and running a real OAuth flow require the owner's applications and credentials; no external account was created and no deployment is made by these changes.

## Validation

Non-regression tests: bloom, particles/stop/GPU release, preserved orbit target, link recovery/revocation, encryption and owner isolation, display name form and session reload, HTTP validation of the display name, provider discovery and simulated OAuth redirects/errors.

Existing follow-ups: #93 (viewer), #59 (interactions), #129 (sign-in). Aesthetic validation on real captures and production OAuth remain to be completed in their respective environments.

Local graphical check: a synthetic scene with terrain, a house, trees and an avatar generated/rendered in Blender, then loaded as a GLB in Chromium/SwiftShader. Framing and snow inspected on desktop and a 390 px mobile viewport; no JavaScript error or horizontal overflow. This check does not replace the aesthetic review on the developer's personal captures. The 46 targeted web tests and 20 targeted API tests pass. The suites run with a 30-second test timeout and a single worker because of 5-second overruns on this machine; coverage thresholds are unchanged.

Full web suite: **288 tests passed / 51 files**, utilities at **100%** (lines, branches, functions and statements). Web/API lint and typechecks pass. Full API suite: **327 passed, 6 skipped (conditional Garage), 2 failures**; overall coverage **99.77% lines / 98.98% functions**, new OAuth/encryption modules at 100%, complete LCOV inventory. The failures are the existing 450 MiB upload scenario (explicit 90 s timeout exceeded) and the SIGTERM exit of the startup fixture (143 instead of 0). The SIGTERM scenario passes when rerun in isolation. These two limits prevent declaring `bun check` / `bun run build` fully green; no repository threshold or test timeout was changed to hide them.

Production web build succeeds, with 19 public pages prerendered. Working files and check screenshots stay under `work/` (ignored by Git); no personal capture file was used.

A global Java check was attempted with the provided Gradle cache (`GRADLE_USER_HOME=/workspace/tooling/gradle`), then interrupted during the initial preparation/remapping of the Minecraft/Fabric dependencies; it is not declared successful. No Java code or GLB format was changed. The global build remains unvalidated; the separate web build succeeds.
