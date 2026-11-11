# GLB materials: single-sided block faces (issue #279)

Up to and including mod 0.37.0-beta.1, every material was written with `"doubleSided": true`. Minecraft draws chunk geometry
(terrain, block models, fluids) with back-face culling, and the exported faces already have the game's
winding. The double-sided flag therefore showed faces the game never shows:

- back-to-back coplanar faces z-fought: both faces of a pair were visible from each side. On the
  Lalaland captures (Fabric 1.20.1, Create 0.5.1), zone 3 has 32,708 such quad pairs in `decor`, 8,382
  in `fluids` and 595 in `terrain`. Zone 1 has 17,695, 593 and 1,080. In `decor` they are mostly leaves
  (the shared face of two leaf blocks is drawn by both), cross plants (grass, flowers), rail tracks and
  Create's blaze burner brazier; in `fluids`, the water surface and its backward face;
- cut-out leaves and other open models showed their mirrored back face;
- translucent water was blended twice where the game emits a face and its backward copy. At 0.72
  opacity, the water read darker and more opaque than in game.

## What is single-sided

The decision is made at capture time, by the path the quad comes from. It is stored on the material.

| Source | Category | glTF material | Why |
| --- | --- | --- | --- |
| Baked block models, including capture cut faces | `terrain`, `decor` | single-sided | Chunk render types cull back faces. Faces meant to be seen from both sides (cross plants, panes) are already modelled twice, once per winding. A cut face that seals an empty cell (cave air, an underground fluid) is also written reversed, see below. |
| Fluids (`LiquidBlockRenderer`) | `fluids` | single-sided | The game emits the reversed top face when the block above is not a fluid (`shouldRenderBackwardUpFace`), and a reversed copy of each side unless the side uses the water overlay sprite. The bottom face is one-sided in game too. Checked with `javap` on the 1.20.1 renderer. The translucent layer culls. |
| Block entity and entity renderers (`RenderedModelCapture`) | `block_entities`, `entities` | double-sided | Some render types disable culling (`entityCutoutNoCull`, banners, signs...). The cull state is not read, because that would need access entries on every loader and version, and from 1.21.5 it lives in render pipelines. Closed models lose nothing. Only open renderer models with explicit back faces can still z-fight (zone 3: 31 quad pairs in `block_entities`, such as Storage Drawers fronts, and 85 in `entities`). |

`doubleSided` is written only when true; glTF's default is single-sided. Both writers produce the same
bytes (`MaterialSidednessTest`).

## How it is carried

- `CaptureSink.addQuad` is the baked block and fluid path, and is single-sided. `addRenderedQuad` is the
  renderer path, and is double-sided. `CaptureElement.Material` keeps the flag for the progressive
  worker (`QueuedGlbCapture`).
- `GlbScene.addQuad` and `SpoolingGlbScene.addQuad` take a `doubleSided` argument. The overloads without
  it keep the former double-sided output. The flag is part of the material key, as is the category. A
  culled use and a no-cull use of the same texture, tint and alpha are therefore two materials. They never
  share the descriptor of whichever came first.

## Checks

- Front faces are the game's visible side. On zone 1 and zone 3, 16,718 and 30,452 `*_top` terrain
  triangles face +Y. The only exceptions are log ends, whose `_top` sprite is used on both ends. All
  143,000 cut-face triangles face out of the capture. Every non-degenerate triangle's winding agrees with
  its stored normal.
- Coplanar pair audit: back-to-back quad pairs (same corners, opposite normals) where at least one
  material is double-sided. Quads are compared by corner set, not by triangle, because a reversed face
  can use the other diagonal (vanilla cross models do). On a GLB written by the core pipeline with two
  cross-plant pairs (one per diagonal), a water top with its backward face and a renderer pair, `decor`
  and `fluids` count 0 and the renderer pair counts 1. The memory and spooled files are byte-identical.
  On zone 3, rewritten as the new code writes it, `terrain`, `decor` and `fluids` go from 595, 32,708
  and 8,382 z-fighting pairs to 0. The renderer pairs (31 and 85) remain.
- The viewer applies the GLB's flag through `GLTFLoader` and does not force a side.
- Seals of empty cells. Solid blocks on the capture's sides and bottom keep their own faces: they
  already close the model, whatever they are (a trunk, a wall, ore). Only a cell of air or fluid on that
  shell gets a seal, and only when the terrain encloses it there (see below). Such a seal is also the
  floor or wall of the cave seen from inside, so `ClientRuntime.addQuad` writes it a second time with its
  corners reversed (`CutBoundary.reverse`): same material, texture in place, opposite normal.
  Single-sided outward seals showed the sky through every cave or pool cut by the capture's bottom or
  sides (reported on a cave floor of black sandstone that looked white in the viewer). The in-game test
  scene digs an air pocket on its +x edge and `GlbReport` requires a cut face on that plane pointing back
  in: it fails without the reversed seal.

### Which cut cells are sealed

`CutBoundary.OpenAir` floods the capture volume through every cell that is not an opaque full cube. A
cell is open when it connects to the sky (the top layer of the capture, or any cell above its column's
world-surface height) or, for an around-player capture, to the player's own cells at capture time. A
cut cell of air or fluid that is not open is sealed. There is no notion of "terrain height" in the
decision: a heightmap counts a canopy's logs, a roof or an overhang as ground, and used to wall off all
the open air below them.

| Cut cell | Open? | Result |
| --- | --- | --- |
| Air beside a trunk, under leaves, a roof or a ledge | yes, reaches the sky around it | open |
| Underside and bottom plane of a floating island, skyblock | yes | open: no bottom seal |
| Ocean or lake open to the sky | yes | open (keeps its water surface) |
| Cavern or Nether space the player stands in | yes, through the player's cell | open, reads as a diorama |
| Room with a door or window to the outside inside the volume | yes | open |
| Cave, pool or pocket cut off from the sky and the player | no | sealed |

An explicit selection (the player may be outside it) uses the sky only, so a closed selection of caves
seals their cuts. A room with no opening in the volume is a pocket and is sealed.

Cost: cells above a column's surface are open by definition and never visited, so the fill only walks
the air below the surface (caves, the air inside trees, a Nether cavern) and reads the blocks next to it.
It is capped at 6,000,000 visited cells; past the cap nothing is sealed, which is never a wall too many.
The progressive capture runs it in slices of 20,000 cells before the first block, and treats chunks it
has not received as solid.

### Where the seals live in the GLB

Seals are invented geometry, so they are kept apart from the world (`GlbCategory.CUT`):

- their own node and mesh named `minemories:cut`, with `extras.minemories.virtual = true` on the node
  (`categories["minemories:cut"]` in the asset metadata counts its quads);
- their primitives are never shared with a real block's, even for the same texture, tint and alpha:
  the category is part of the part key of both writers (`GlbScene`, `SpoolingGlbScene`);
- their materials keep the `minemories:cut / <sprite>` name prefix;
- they are not counted in the chunk statistics (`ChunkStats`), so they cannot move a chunk's score or
  fingerprint.

A reader can hide, restyle or drop that node without touching a real block. The viewer's layer toggles
only know the five world categories (`apps/web/src/lib/glb-categories.ts`), so the node is rendered
like any other and has no toggle yet; bounds, face counts and the derivative pipeline read geometry
generically and are unaffected.

The seal looks like the nearest opaque cube in the cell's column (`CutBoundary.nearestSolid`: the cave
floor first, then the ceiling), so it is sand in a desert, netherrack in the Nether, end stone in the End.
A column without any opaque cube falls back to the dimension's rock (`CutBoundary.fallback`: netherrack,
end stone, deepslate under y = 0, else stone).

## In-game validation

To be done with the development JAR. Compare a capture with the game:

- Create blaze burner: the brazier no longer flickers.
- Leaves and plants: the back face is no longer mirrored.
- Water: seen from above, from underneath, and against glass, where the game shows one side only. Also
  waterfall sides and lava.
- Chests, signs and banners are still visible from both sides.
- Capture cut walls are still visible from outside, and from inside a cave or a pool the capture cuts.
- The terrain's shadows (three.js puts back faces of single-sided materials in the shadow map).
