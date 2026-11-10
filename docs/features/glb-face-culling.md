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
- Seals of empty cells. A cut face on a solid block replaces that block's own outer face, so it faces out
  of the capture only. A cut face on an air or fluid cell is also the floor or wall of the cave seen from
  inside, so `ClientRuntime.addQuad` writes it a second time with its corners reversed
  (`CutBoundary.reverse`): same material, texture in place, opposite normal. Single-sided outward seals
  showed the sky through every cave or pool cut by the capture's bottom or sides (reported on a cave
  floor of black sandstone that looked white in the viewer). The in-game test scene digs an air pocket
  on its +x edge and `GlbReport` requires a cut face on that plane pointing back in: it fails without
  the reversed seal.

## In-game validation

To be done with the development JAR. Compare a capture with the game:

- Create blaze burner: the brazier no longer flickers.
- Leaves and plants: the back face is no longer mirrored.
- Water: seen from above, from underneath, and against glass, where the game shows one side only. Also
  waterfall sides and lava.
- Chests, signs and banners are still visible from both sides.
- Capture cut walls are still visible from outside, and from inside a cave or a pool the capture cuts.
- The terrain's shadows (three.js puts back faces of single-sided materials in the shadow map).
