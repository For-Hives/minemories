# Minemories logo

A pixel-art camera on a tripod, in flat colours with one soft glow around the side button.

## Files

| File | What it is |
| --- | --- |
| `minemories-logo.svg` | **The canonical logo.** Every other logo asset in the repository is generated from it. 584 × 938, one path per visible face, grouped by part. |
| `minemories-logo.vectorcraft` | The VectorCraft working file of the same drawing, to retouch it. Export it back to `minemories-logo.svg` after an edit. |
| `minemories-logo.png` | A preview of the canonical logo. |
| `source-camera.png` | The original picture the logo was drawn from. |
| `versions/v1-flat/` | First version: flat shapes drawn over the picture (SVG, VectorCraft file, PNG preview). |
| `versions/v2-trace/` | Second version: an automatic colour trace of the picture. |
| `versions/v3-cubes/` | Third version: the first box (voxel) model. |
| `model/` | The scripts that built the box model behind the canonical logo. |

Part names in the SVG and VectorCraft files: `Body`, `Grip`, `Viewfinder`, `Lens`, `Barrel` (the stepped lens tube), `Button`, `ButtonGlow`, `Neck`, `TripodRing`, `Hub`, `LegLeft`, `LegCenter`, `LegRight`. Version 1 uses material names instead (`Wood`, `Copper`, `Gold`, `GlassCyan`…).

## The box model (`model/`)

The canonical drawing is an oblique projection of boxes, so every face is a flat polygon.
Run from `model/` with Python 3, numpy, OpenCV (`cv2`), Shapely and Pillow:

1. `voxel.py` builds the boxes (body, grip, viewfinder, lens ring, tube, tripod) from `params.json`, keeps the visible part of each face and writes `vox_shapes.json`.
2. `recolor.py` samples each material's colour on `source-transparent.png` (the source picture with its background removed, not kept here) and writes `colormap.json`, the design colour → sampled colour map.
3. `vox_svg.py` writes `vox.svg` from the shapes; the canonical SVG is that drawing, with its parts named in VectorCraft.

The scripts read and write in their own folder; set `MINEMORIES_LOGO_WORKDIR` to use another one.

## Generated assets

`bun brand:icons` (`scripts/brand/build-icons.mjs`, needs ImageMagick 7 with librsvg) rebuilds, from `minemories-logo.svg`:

- `apps/web/public/brand/minemories-logo.svg`: the full logo, optimised (same rendering, pixel for pixel).
- `apps/web/public/brand/minemories-mark.svg` and `apps/web/public/favicon.svg`: the square mark, the camera head only, for small sizes.
- `apps/web/public/favicon.ico` (16, 32, 48), `apple-touch-icon.png` (180), `icon-192.png` and `icon-512.png` (mark on the site background `#14110e`, inside the maskable safe circle), `site.webmanifest`.
- `apps/web/public/brand/og-image.png`: the 1200 × 630 social image, logo and name in the game font.
- `mod/shared/brand/icon.png`: the 128 × 128 transparent mod icon.

The outputs are committed; rerun the command after changing the canonical SVG and check the small icons by eye.
