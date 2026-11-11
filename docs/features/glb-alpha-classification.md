# GLB alpha classification: cutouts must not be `BLEND`

A glTF `BLEND` material is sorted per mesh and writes no depth. Applied to a cutout texture (every texel fully opaque
or fully transparent) it makes a model's far faces draw over its near ones: the "wrong z-index" seen on entities such
as the creeper's head.

## Root cause

The mod classified a texture as translucent (`alphaMode` 2 → `BLEND`) as soon as **one** texel had partial alpha
(`RenderedTexture.Rows` and `ClientRuntime.SpriteAsset`). Vanilla `entity/creeper/creeper.png` has exactly one such
texel among 865 visible ones, so the whole creeper was exported as `BLEND`. Vanilla leaves (cherry included) have
binary alpha and were already `MASK`; their earlier artefact was the double-sided flag, see `glb-face-culling.md`.
Other hypotheses checked: coplanar entity layers are already separated by `RenderedLayer.separate`; double-sided
quads only exist for cut-boundary seals.

## Fix

- Mod: `RenderedTexture.alphaMode` returns `BLEND` only when partial texels exceed 1/32 of the visible ones; a stray
  antialiased texel stays `MASK` (cutoff 0.5, as the game's cutout render types do). Stained glass, water and slime
  remain `BLEND`.
- Viewer (`lib/glb-alpha.ts`, `fixBlendedMaterial` in `viewer-scene.ts`), which also covers captures already uploaded:
  - a `BLEND` material whose map is a cutout by the same rule is drawn with `alphaTest 0.5`, `transparent=false`
    and depth writes;
  - genuinely translucent content (water, stained glass, ice, slime) keeps blending but now **writes depth** with
    `alphaTest 0.01` (so fully transparent glass texels write nothing), as Minecraft does. three's glTF default
    (`depthWrite=false`, per-mesh sort) let the far faces of one merged mesh paint over its near faces. A depth
    pre-pass per mesh was rejected: it has the same inter-mesh ordering limits with more draw calls. These materials
    still do not cast shadows (`hasOpaqueSurface` ignores the 0.01 test).

## What real captures contain

`~/export/capture.glb` (mod 0.37.0-beta.1, format 2) has 108 `BLEND` materials: water (opacity 0.72, fully partial
alpha), stained glass, portal, jars and gem cases (hundreds of partial texels), lava (all opaque: now a cutout),
and `oak_leaves_waterlogged` (binary alpha: now a cutout). Every material of that file is `doubleSided`
(format 2 predates `glb-face-culling.md`), so old captures still show back faces of open models; the viewer cannot
tell a deliberate `doubleSided` from the old blanket flag. Modded leaves with soft alpha above 1/32 of the visible
texels stay blended by design.

## Depth precision (not a material issue)

The camera uses near 0.02 on a 24-bit depth buffer: faces one block apart (leaf interiors, entity overlay layers 1/16
apart) swap at long distances for opaque and `MASK` content alike. That is handled by the camera near plane, not here.

## Validation

Unit tests (`RenderedTextureTest`, `glb-alpha.test.ts`). Viewer checked in headless Chromium (SwiftShader) with the
real capture and a synthetic leaves cluster; not validated in game.
