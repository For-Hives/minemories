# View links

A share link (`/share/:token`) or a public page (`/public/:id`) can reopen a precise view of the capture: where the
camera stands and looks, the hour, the weather, the lighting, the hidden layers and, for a world link, which
snapshot.

## Format

Readable query parameters, all optional:

| Key | Value | Example |
|---|---|---|
| `cam` | camera position, `x,y,z` | `cam=-42.16,-130.37,101.29` |
| `at` | the point it looks at (orbit pivot), `x,y,z` | `at=28.32,-109.84,18.38` |
| `time` | time of day, `HH:MM` | `time=17:15` |
| `weather` | `clear`, `mist`, `overcast`, `rain`, `snow` | `weather=mist` |
| `light` | `realistic`, `faithful` | `light=faithful` |
| `hide` | hidden layers, comma separated: `terrain`, `decor`, `fluids`, `block_entities`, `entities` | `hide=entities` |
| `snap` | snapshot of a world link (a memory id) | `snap=3f2a…` |

`lib/view-link.ts` reads and writes them. The query is untrusted input: a camera needs both `cam` and `at`; numbers
must be finite and below 1e8; the hour must be a real one; enums and layers are whitelisted; `snap` is
`[A-Za-z0-9_-]{1,128}`. Anything invalid is dropped, never an error. Coordinates are rounded to the centimetre.

Coordinates are in the **shown capture's own space**: `ViewerScene.currentView()` removes a world layer's offset,
so the same view opens on the same spot in the composed world and on that capture loaded alone.

## Where links come from

- **Owner, viewer Share panel** (`SharePanel` with `view`): "Include this view" is on by default. The link is read
  again when copied, so a camera moved since the panel opened is caught. A world link also gets `snap` (the
  snapshot on screen). The gallery's side sheet has no view and shares plain links.
- **Visitor of a shared or public page**: "Copy a link to this view" copies the page address with the current view
  (and the snapshot shown, on a world link).

## Applying a view

`SharePage` reads the view once. On a capture link, hidden layers are applied before the first load, so they never
flash in; after it, the hour replaces the capture's own and the camera replaces the default framing
(`ViewerScene.applyView`). On a world link, which opens the composed world (see `world-evolution.md`), `snap` picks
the capture the world opens on when the viewer loads it; once that capture is drawn and framed, the hidden layers,
the hour and the camera apply, and moving to another capture keeps the usual glide. Weather and lighting start the
studio; a link's lighting applies to that visit only and does not overwrite the visitor's remembered choice. Owner
pages (`/viewer`) do not read view parameters yet.
