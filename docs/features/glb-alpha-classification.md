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
- Viewer: for captures already uploaded, `lib/glb-alpha.ts` applies the same rule to the texels of a `BLEND` material's
  map; a cutout is drawn with `alphaTest 0.5`, `transparent=false` and depth writes (`cutOutBinaryBlend` in
  `viewer-scene.ts`).

## Validation

Unit tests (`RenderedTextureTest`, `glb-alpha.test.ts`). Not validated in game or visually in the viewer.
