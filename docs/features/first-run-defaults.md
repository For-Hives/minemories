# Zero-configuration install

Once installed, the mod must work **without any action** from the player, including a 12-year-old with no technical knowledge. Settings are therefore exceptions the player can turn off (opt-out), not steps to complete. This page lists every key in `config/minemories.properties`, its value when absent and the reason for that choice. An absent key is never confused with a value the player explicitly disabled: a refused setting stays refused.

## Defaults

| Key | If absent | Notes |
| --- | --- | --- |
| `afkSnapshots` | `true` | Automatic captures after 5 minutes idle, at most every 4 hours, including while paused or unfocused. An explicit `false` is preserved. |
| `afkIdleMinutes`, `afkIntervalMinutes`, `captureRadius` | 5, 240, 32 | Advanced settings; an invalid value falls back to these defaults. |
| `captureFullHeight` | `false` | Captures around the player keep the depth actually visited plus five blocks, and go down through builds connected to that cut ([details](exploration-depth-validation.md#builds-under-the-cut)). |
| `exportDirectory` | `~/export` | Folder for local memories. |
| `apiUrl` | `https://api.minemories.net` | Official service; changing the API unlinks the account. |
| `deviceToken`, `deviceId` | absent | **The only required action: link the account** (6-digit code). Until the player is linked, a clickable chat message reminds them each time they join a world and opens the settings. Captures stay local until linking; after linking they upload automatically. |
| `diagnosticsConsent` | on | Sanitized technical diagnostics, never sent before pairing. An explicit `false` is preserved across pairing, unlinking or an API change. Details: [diagnostics](consented-diagnostics.md). |
| `pairingReminder` | `true` | Linking reminder in chat; `false` turns it off. |
| `remoteWorld.<fingerprint>` | absent | On a remote server, one series per connection; the world identifier is an advanced setting. |

Exploration history and suggested areas are always on, local and bounded. Nothing else is sent before pairing.

## Linking reminder

- Once per world join (not on every dimension change), about five seconds after arrival, only if the player is not linked and `pairingReminder` is not disabled.
- The message exists only on the client: it is never sent to the Minecraft server.
- Clicking the message runs `/minemories settings`, which opens the Minemories menu on the next tick. Opening is deferred: a screen opened while the chat is closing would be replaced immediately.

## Not yet validated

The logic (default consent, preserving an explicit refusal, reminder cadence) is unit tested. Rendering, clicking in chat on NeoForge, Fabric and Forge (single player and remote server) and comprehension by real players (#87) still need in-game validation.

## Tabbed advanced settings

The "Settings" button on the simple screen opens the advanced screen, organized in four tabs: **Account** (API address, storage, unlinking), **Captures** (local folder, exports, AFK, history), **World** (remote world identity, suggested areas) and **Privacy** (diagnostics). The Save button stays visible on every tab. Layout not validated in game.
