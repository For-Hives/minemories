# Viewer flight controls

First person in the viewer flies like Minecraft Java's spectator mode: same speeds, same acceleration and
coasting, same mouse feel, through walls and floors. It works with a keyboard and mouse, a touch screen, or both.

## Physics (`apps/web/src/lib/flight.ts`)

The flight runs in game ticks, 20 per second, and the camera is drawn between the last two ticks, as the game does.
Every constant was read from the Minecraft **1.21.1** client (`javap` on the mapped jar):

| What | Value | Source |
|---|---|---|
| Flying speed | 0.05 per tick, doubled while sprinting | `Abilities.flyingSpeed`, `Player.getFlyingSpeed` |
| Input | ×0.98, normalized only past length 1, so diagonals are not faster | `LivingEntity`, `Entity.getInputVector` |
| Horizontal coasting | keeps 0.91 of its speed each tick | `LivingEntity.travel` |
| Up and down | ±(flying speed × 3) per tick, the plain speed even while sprinting; up and down together cancel | `LocalPlayer.aiStep` |
| Vertical coasting | keeps 0.6 of the vertical speed each tick | `Player.travel` |
| Sprint | a second forward press within 7 ticks, or the sprint key with forward held; ends when forward is released; descending clears a pending double tap | `LocalPlayer.aiStep` |
| Field of view | ×1.1 flying, ×1.15 more sprinting, halfway there each tick | `AbstractClientPlayer.getFieldOfViewModifier` |
| Mouse | (sensitivity × 0.6 + 0.2)³ × 8 × 0.15 degrees per pixel, 0.15 at the default 50% | `MouseHandler.turnPlayer`, `Entity.turn` |
| Wheel | flying speed ±0.005 per notch, up to 0.2 | `MouseHandler` (spectator) |

Resulting speeds, pinned by tests: **10.9 blocks/s** flying, **21.8** sprinting, **7.5** up or down.

Forward follows the view's yaw only: looking up does not climb, as in the game.

Where the viewer differs from the game:

- In 1.21.1 a double tap starts a sprint only on the ground. The viewer always flies, so it accepts a double tap in
  the air.
- The viewer's own field of view (45° vertical) is the flying one: entering flight does not widen it; only
  sprinting does (×1.15). Turned off with "Wider view when flying fast" or `prefers-reduced-motion`.
- A narrow screen gets a wider view while flying (`comfortableFov`): the vertical field of view rises until the view
  is 50° across, up to 90° vertical. A phone held upright goes from 22° across to about 49°; a laptop keeps 45°
  vertical (67° across). It follows resizes and rotations. A postcard always uses the camera's own 45°.
- The wheel never goes below 0.005 (10%), so the flight cannot stop. A trackpad's stream of small deltas adds up to
  whole notches (100 pixels each) instead of jumping to the top speed.

## Keyboard and mouse (`apps/web/src/viewer-navigation.ts`)

- A click on the scene locks the mouse, as the game does; Esc frees it (the browser handles that key). The mouse
  then turns the view with the game's sensitivity curve. Chrome reports the jump to the lock point as a movement,
  sometimes before the lock event: the first move after a lock request is ignored, and so is any single move over
  400 pixels, so the view never spins on its own.
- When the browser refuses the lock (just released, iframe, not allowed), dragging looks around instead.
- Keys are read by physical position (`KeyboardEvent.code`). The key under the left middle finger moves forward
  on QWERTY (W), AZERTY (Z) and QWERTZ (W) with the same binding.
- While flying, a key bound to flight never also triggers the viewer's shortcuts (R recentres, T starts the tour).
- Ctrl+W, Ctrl+T and Ctrl+N cannot be stopped by a page outside fullscreen with Keyboard Lock, so no default uses
  Ctrl. Browser shortcuts (Ctrl+F…) pass through, unless a bound modifier is the one held: with Ctrl bound to
  sprint, W pressed with Ctrl down still flies (the tab may still close on Ctrl+W outside fullscreen, hence the
  warning).

## Key sets and settings (`apps/web/src/lib/flight-controls.ts`, `components/FlightControls.tsx`)

| Action | Viewer set (default) | Minecraft Java set |
|---|---|---|
| Forward, back, left, right | W A S D (Z Q S D on AZERTY) and the arrows | W A S D |
| Up | Space, E | Space |
| Down | C, Q | Left Shift |
| Sprint | Left and Right Shift (and a double forward) | R (and a double forward) |

The viewer set keeps Shift as "faster", as the viewer always did. The Minecraft set puts Shift on descend, as in
the game, and sprint on R because the game's Left Ctrl would close the tab with Ctrl+W.

The **Controls** panel (button on the flight card) has:

- the two key sets, the active one marked;
- the keyboard layout: Automatic (guessed from the browser language: French, Belgian French and Belgian Dutch give
  AZERTY; German, Swiss French, Czech, Slovak, Hungarian, Slovenian and Croatian give QWERTZ; anything else QWERTY),
  QWERTY, AZERTY or QWERTZ. It changes labels only. Automatic uses the browser's own layout map where there is one
  (Chromium);
- two keys per action: click a key, then press the new one. Escape cancels, Backspace or Delete empties the slot,
  Tab cannot be bound. A key bound to an action leaves the action it drove before. Ctrl, Alt and Cmd can be bound,
  with a warning;
- mouse and touch sensitivity (Minecraft's scale, 50% by default), inverted vertical look, the sprint's wider view;
- Reset controls.

Settings stay in this browser (`localStorage`, `minemories:viewer-controls`), read defensively: anything missing or
invalid takes its default.

## Touch

The thumb controls show when a finger is used (a coarse pointer to start with, then whatever was used last, so a
laptop with a touch screen switches both ways):

- a stick on the left: forward and strafe in proportion to the push; pushed forward to its edge (92%), it sprints;
- climb and descend buttons on the right, held;
- the other thumb drags on the scene to look, turning twice as far per pixel as a mouse at the same sensitivity;
- each finger keeps its role (stick, button or look), so two thumbs work together.

While flying on touch, the hour strip and the caption make way for the controls, which sit left of the toolbar's
column and above the Immerse button. The flight card folds at the first gesture outside it, down to its Controls
and Show help buttons. iOS's double-tap and pinch zoom are blocked on the controls (`touch-action: none` and
`gesturestart`). Safe areas are respected.

A phone on its side (under 520 px tall, coarse pointer) no longer gets the viewer's 520 px minimum height, which made
the page scroll and pushed the controls off screen; the toolbar then sits under the header and scrolls if needed.

## Where the flight starts

Above the capture's focus (the player's position), at eye height plus one block (2.62), so the view does not start
inside the captured player (#273). A camera moved by the viewer while flying (a new capture, a recentre) is followed:
the flight continues from there, at rest.

## Validation

- Unit tests: `lib/flight.test.ts` and `lib/flight-controls.test.ts` (100% coverage), `viewer-navigation.test.ts`,
  `components/flight-controls.test.tsx` (rebinding, layouts, presets, settings, touch stick with two fingers,
  shortcuts while flying, speed notice).
- In a real Chromium with WebGL (Playwright, GPU, 15 November 2026), on `tour-r128/zone-4.glb`: AZERTY guessed from
  `fr-FR` (the card reads "Z Q S D fly"), flying forward and up, the wheel at 130%, the Controls panel, a click that
  leaves the view still (Chrome sent a -660/-400 px "move" when locking: now ignored); with touch, the stick and
  buttons with two thumbs at once (CDP touch events), the card folding, and no overlap on a phone upright
  (390×844), a phone on its side (844×390) and a tablet (1180×820), measured from the elements' boxes. On
  `capture-20261109-1340.glb`, looking down from where the flight starts shows the captured player's head below the
  camera (#273).
- Not checked: real phones and tablets (iOS Safari, Android Chrome); looking around with a granted mouse lock
  (headless Chromium reports made-up movements while locked, so that path rests on unit tests); gamepads.
