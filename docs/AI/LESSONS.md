# Lessons learned

## Comments

### Issue
Too many comments, multi-line comment blocks for everything.

### Solution
Prefer self-explanatory code; only add a one-line comment when the context really needs it.

## Validating the mod in game

When the developer reports that a fix changes nothing, check the JAR actually installed in their CurseForge profile before changing the code again. Compare fingerprints and, if needed, the bytecode. Deliver the fix into the instance they use, with a backup, and say that a full Minecraft restart is required; a build in the repository alone does not update the game.

## Product information before design

For Minemories information pages, the developer first wants concrete content grounded in VISION.md, written for several audiences (admin, parent, young adult, teenager, casual vanilla player, pro modder). Favor understandable steps and check each persona's questions before working on the look.

## Build commands and local Java

`bun build` calls the native bundler, not the repository's build script: use `bun run build`, in CI too. The local JDK 21 is in `/home/lightin/.local/tools/jdk-21.0.12.1+1`; set JAVA_HOME and add its bin to PATH for Gradle checks.

- AFK captures are part of the expected simplified experience: on by default, even when paused or in the background; do not require an advanced opt-in. Timing and size stay advanced settings.

- The developer expects concrete follow-up on their feedback: make the viewer's real loading visible and keep precise tasks for visited depth and capture borders.

- To welcome a non-technical person, deliver a concrete installation path up to the first memory, with the JAR downloaded from the site, personalization and light illustrations; check the file actually served in production, not just the button in the code.

- The web deployment must stay independent from the Minecraft/Java build: distribute the mod from public GitHub releases and keep Gradle for the mod's CI. For the web, prepare content and i18n without inventing commercial offers, and prerender public pages for crawlers.

- Prepare web features with genuinely interactive demos and several marketing angles (public code, nostalgia, sharing, leaderboard). Indexing must now stay blocked until launch; the new prices that were explicitly given replace the old requirement, without inventing a payment flow that is already connected.

- The mod's GitHub releases must become automatic after merging to main: package and Gradle versions synchronized, a matrix of the loaders actually available, and a generated changelog. Avoid a second release PR to merge; keep the distinction between a CI beta and in-game validation of the exact JAR.

- Before having Mae test the flow, the developer prioritizes remote observability: export errors and crashes must be reported to the API and usable in a private admin page, with groups, details and handling status. Diagnostics must survive outages and a relaunch, without turning on a player's consent on their behalf.

- For the viewer, the developer expects an autonomous, creative redesign of the whole flow, with a pleasant memory-like atmosphere inspired by Minecraft shaders. Smoothness, moods and sharing are part of the premium feel; validate on real captures and do not stop at adding graphics settings.

- A “real redesign” of the viewer must be immediately visible in the page composition, not only in its graphics settings. After technical validation, actually integrate it on main and say where to see the result; test Firefox on a real capture, including the post-processing modes, before asking the developer to try again.

- The viewer must favor the position the player actually experienced and interior walkthroughs: a mathematical framing of the volume, even if rendered correctly, is not enough. Do not confuse old capture coordinates (sometimes the volume's center) with an actually recorded player position.

- For viewer continuity, the user gives free rein on the art direction of the rest of the site and asks for a proposal. Make it concrete and navigable on the real pages, with a coherent identity, so they can judge layout, typography and interactions together.

- After “do better” on a UX improvement, do not stack micro-adjustments: rethink the flow's hierarchy and actions. For sign-in, the form must be immediately useful on mobile, and access without an account must offer the public gallery, not a discreet note.

- Loading a local GLB in the web viewer is only for development testing. Remove it from the production build and public flows; keep mod captures, the gallery and shared links as the product flows.

- A world's viewer is the normal view, made of all its captures: do not label it “evolving world” or create a separate mode in the interface. The UI of this view will be redone; prioritize the engine and the strategy.

- For a world's viewer, the developer prefers a visual, low-text interface: a filmstrip of thumbnails rather than a transport bar, smooth camera and time-of-day transitions between captures, a locatable camera pivot (ground shadow). Server names must be overridable from the gallery.

- The developer allows pushing directly to main when tests, lint, format and checks pass: no need to wait for confirmation in that case.

- For web screens, the developer wants the taste-skill skill (https://github.com/Leonxlnx/taste-skill): gallery and viewer in app-screen mode, true-black-flat style while keeping the brand palette and typography; measure before/after with its inspector.
