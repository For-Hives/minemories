# Minemories logo

A pixel-art camera on a tripod, in flat colours with one soft glow around the side button.

## Files

| File | What it is |
| --- | --- |
| `minemories-logo.svg` | **The canonical logo.** Every other logo asset in the repository is generated from it. 568 × 864, one path per visible face, grouped by part. |
| `minemories-logo.vectorcraft` | Outdated: the VectorCraft file of the first box model, from before the Blockbench rework. |
| `minemories-logo.png` | A preview of the canonical logo. |
| `minemories-logo.vox` | The box model rasterised to voxels (MagicaVoxel / Goxel), to retouch it by hand. Regenerate with `python3 model/export_vox.py`. |
| `minemories-logo.bbmodel` | **The source model**, edited in Blockbench (cubes grouped by part, colours from its palette texture). Rebuild the SVG with `python3 model/blockbench_svg.py`, then `bun brand:icons`. |
| `source-camera.png` | The original picture the logo was drawn from. |
| `versions/v1-flat/` | First version: flat shapes drawn over the picture (SVG, VectorCraft file, PNG preview). |
| `versions/v2-trace/` | Second version: an automatic colour trace of the picture. |
| `versions/v3-cubes/` | Third version: the first box (voxel) model. |
| `model/` | The scripts that built the box model behind the canonical logo. |

Part names in the SVG and VectorCraft files: `Body`, `Grip`, `Viewfinder`, `Lens`, `Barrel` (the stepped lens tube), `Button`, `ButtonGlow`, `Neck`, `TripodRing`, `Hub`, `LegLeft`, `LegBack`, `LegRight`. Version 1 uses material names instead (`Wood`, `Copper`, `Gold`, `GlassCyan`…).

## The box model (`model/`)

The canonical drawing is an oblique projection of boxes, so every face is a flat polygon.
Run from `model/` with Python 3, numpy, OpenCV (`cv2`), Shapely and Pillow:

1. `voxel.py` builds the boxes (body, grip, viewfinder, lens ring, tube, tripod) from `params.json`, keeps the visible part of each face and writes `vox_shapes.json`.
2. `recolor.py` samples each material's colour on `source-transparent.png` (the source picture with its background removed, not kept here) and writes `colormap.json`, the design colour → sampled colour map.
3. `vox_svg.py` writes `vox.svg` from the shapes; the canonical SVG is that drawing, with its parts named in VectorCraft.

`export_vox.py` (numpy only) rasterises the same boxes and prisms into `../minemories-logo.vox` (4 voxels per model unit, 54 × 34 × 100). It uses one flat colour per material, since the editor does the shading, and the sampled colours of `colormap.json`.

The scripts read and write in their own folder; set `MINEMORIES_LOGO_WORKDIR` to use another one.

## Generated assets

The SVG is rendered from the Blockbench model by `model/blockbench_svg.py`, which also applies the groups' own rotations (the tripod legs are turned around the vertical axis). Camera options: `--yaw` (50), `--pitch` (30), `--fov` (20; 0 = orthographic, 30 = Blockbench's default perspective), `--scale`, `--margin`. Set up once with `python3 -m venv .venv && .venv/bin/pip install -r model/requirements.txt` (from `design/logo/`), then:

```sh
.venv/bin/python model/blockbench_svg.py --yaw 35 --pitch 20 --fov 20 && bun brand:icons
```

Careful: the logo size changes with the angle, and `scripts/brand/logo.test.mjs` checks the `viewBox` of the canonical SVG, so update it there too.

`bun brand:icons` (`scripts/brand/build-icons.mjs`, needs ImageMagick 7 with librsvg) rebuilds, from `minemories-logo.svg`:

- `apps/web/public/brand/minemories-logo.svg`: the full logo, optimised (same rendering, pixel for pixel).
- `apps/web/public/brand/minemories-mark.svg`: the square mark, the camera head only (footer, mod icon).
- `apps/web/public/favicon.svg`: the whole logo, tripod included, centred in a square.
- `apps/web/public/favicon.ico` (16, 32, 48), `apple-touch-icon.png` (180), `icon-192.png` and `icon-512.png` (the whole logo on the site background `#14110e`, inside the maskable safe circle), `site.webmanifest`.
- `apps/web/public/brand/og-image.png`: the 1200 × 630 social image, the whole logo alone on the site background.
- `mod/shared/brand/icon.png`: the 128 × 128 transparent mod icon.

The outputs are committed; rerun the command after changing the canonical SVG and check the small icons by eye.
