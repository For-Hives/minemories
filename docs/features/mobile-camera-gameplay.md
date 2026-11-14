# Mobile camera and gameplay: analysis and plan

How someone holding a phone or a tablet should move through a capture, after the Minecraft-style flight of
[viewer-flight-controls.md](viewer-flight-controls.md). Written 15 November 2026 from the code, measurements in the
viewer and screenshots of a 390×844 phone viewport. Nothing here is validated on a real device yet.

## Who is on a phone, and what they came for

| Who | Arrives from | Wants, in order |
|---|---|---|
| A friend of the player | a share link in Discord or a message | see the build, quickly and nicely; find "the house", "the farm"; send it on |
| The player, away from the PC | the gallery | check the last capture, show it to someone next to them, take a postcard |
| A parent, a curious visitor | a public link, the site | understand what it is without learning controls |

None of them came to play. A phone visit is short and starts with no intent to learn anything. The first ten seconds
must look good with zero input, the first gesture must do something sensible, and flying is for those who want it.

## What the viewer does on a phone today

- **Orbit** (default): one finger turns around the build, two fingers pinch to zoom and drag to pan, a double tap
  recentres. The tour ("Take a moment") turns slowly by itself.
- **Flight** (First person): the stick on the left (sprint at its edge), climb and descend buttons on the right, the
  other thumb looks. Same speeds as Minecraft's spectator mode.

## Problems found

Measured or seen on the 390×844 viewport (`tour-r128/zone-4.glb`):

1. **The portrait view is a telescope.** The camera keeps a 45° vertical field of view on every screen, so the
   horizontal one depends on the shape of the screen:

   | Screen | Horizontal field of view |
   |---|---|
   | Laptop 1280×800 | 67° |
   | Phone in landscape 844×390 | 84° |
   | Tablet in portrait 820×1180 | 32° |
   | **Phone in portrait 390×844** | **22°** |

   At 22° a small thumb movement swings the whole picture, a wall fills the screen, and flying is hard to read and
   tiring. Minecraft on phones only runs in landscape partly for this reason.
2. **Flight can start inside a wall.** The flight starts above the capture's focus (the player's position). In
   `zone-4` that is inside a tower: the first picture is a stone wall seen from inside.
3. **The flight card takes a fifth of the screen** (title, two lines of help, Controls), right where the view is,
   for as long as the flight lasts.
4. **Overlays compete with the thumbs.** The site's language banner covered the descend button. The toolbar sits
   above the climb button, and the Immerse button below it.
5. **Two-thumb flight is a gamer's skill.** Someone who does not play twin-stick games will push the stick, look at
   the floor, lose the building and leave. Orbit is the right default, but flight has no middle ground today.
6. **Looking around is linear.** Each pixel turns the same amount, so either fine aiming is jumpy or a half turn
   takes several swipes.
7. **No way to say "take me there".** To reach a window seen in the distance you must fly to it.

## Principles

- **The camera never surprises.** No jump, no spin, a level horizon, speeds that ease in (the flight already coasts
  like the game's). Respect `prefers-reduced-motion`.
- **Orbit first, flight on purpose.** The default view frames the build. Flight is one tap away and one tap back
  ("Recenter" always works).
- **One hand is enough to look, two to fly.** Portrait, one thumb: look, tap to go somewhere, pinch. Landscape, two
  thumbs: fly.
- **Thumbs own the bottom corners.** Nothing else goes there while flying; touch targets are at least 44 px (the
  flight buttons are 64), and safe areas are respected.
- **Speeds stay Minecraft's,** so the player's muscle memory works on the phone too.

## Plan

Effort: S (hours), M (a day or two), L (more).

### P0: make the phone view comfortable

| # | Change | Why | Effort |
|---|---|---|---|
| 1 | **Keep a minimum horizontal field of view** in flight: raise the vertical one until the horizontal reaches 50°, capped at 90° vertical (a portrait phone goes from 22° to about 49° wide). **Done for flight.** Still to do: the same rule, more gently, for orbit in portrait. | Problem 1, the largest one | S |
| 2 | **Start the flight from the orbit camera** when the focus is inside blocks, or lift the start until it is in the air, using the ground index the pivot already has (`viewer-ground.ts`). | Problem 2 | S–M |
| 3 | **Fold the flight card on touch** after the first gesture: only Controls and Show help stay. **Done**, with the touch controls moved clear of the toolbar and the Immerse button, and a phone on its side no longer scrolling. Still to do: hide the language banner while flying. | Problems 3, 4 | S |
| 4 | **Touch look curve**: slow for small moves, faster for long swipes (an exponent of about 1.3 on the swipe speed, as most mobile games do), with the sensitivity setting on top. | Problem 6 | S |

### P1: a middle ground between orbit and flight

| # | Change | Why | Effort |
|---|---|---|---|
| 5 | **Tap to glide**: in orbit, a tap on a block glides the camera to look at it from a few blocks away (the orbit pivot moves there), as map apps do. A double tap keeps recentring. | Problems 5, 7: going somewhere with one finger, no skill needed | M |
| 6 | **Floating stick**: the stick appears under the thumb anywhere in the left third, instead of a fixed square. | Fewer misses; the thumb rests where it likes | S |
| 7 | **Landscape suggestion**: in flight on a portrait phone, a dismissible hint "Turn your phone for more room". No forced rotation. | Problem 1, the user's choice | S |
| 8 | **Smooth camera** option (Minecraft's "cinematic camera", F8): the look follows the finger or mouse with smoothing. Good for filming and postcards on every device. | Smoother videos and postcards | S |

### P2: more ways to move

| # | Change | Why | Effort |
|---|---|---|---|
| 9 | **Gamepad**: left stick flies, right stick looks, A up, B down, stick click sprints. A phone with a controller, an iPad, a PC. | Same flight with no keyboard | S–M |
| 10 | **Gyroscope look** (opt-in): tilting the phone turns the view, as some mobile shooters allow. iOS needs a permission prompt from a tap. | One-handed look in flight | M |
| 11 | **Stay above ground** option for beginners: the flight cannot go below the surface or inside walls, using the ground index. Spectator flight stays the default. | Less "I'm lost in a wall" | M |
| 12 | **Points of interest**: the player marks spots in game (or the viewer suggests them from lights and block entities); a tap flies there. Gives the tour a path. | Share links that tell where to look | L |

## What to measure

The web app measures nothing today. If a privacy-respecting count is added one day (no personal data, no
cookies), these are the questions worth answering:

- time to the first gesture, and which one (orbit, tap, flight);
- share of phone visits that open the flight, and how long they stay in it;
- postcards and view links per visit, phone against desktop;
- visits that leave within ten seconds, phone against desktop.

## Device checks still to do

- iPhone (Safari) and an Android phone (Chrome), portrait and landscape: two thumbs at once, no zoom on a double tap,
  safe areas, battery and heat over five minutes of flight.
- An iPad with and without a keyboard (the keys and the touch controls both work; the last input used decides
  which controls show).
- A low-end Android phone: frame rate while flying over a large capture.
