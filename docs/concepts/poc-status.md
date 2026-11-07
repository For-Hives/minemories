# Minecraft POC summary

Context document for the existing implementation, before extending the product.

## Goal

Validate that a client-side mod can take an area of a modded Minecraft world, collect the models and textures the game has already loaded and produce a GLB that can be explored outside the game.

## Environment

- Minecraft 1.21.1, NeoForge 21.1.248, Java 21.
- Game profile used: CurseForge `mc breval`.
- The export is client-side and writes `~/export/capture.glb`.
- The GLB embeds its own textures; it can be opened in Blender and in the repository's web viewer.

## Features exercised

- Selecting an area by two corners and exporting an area around the player.
- Baked block models and block entity data; rendering of many models from mods.
- Game textures, UVs, tints and transparency for the assets encountered.
- Standard fluids and geometry coming from some block entity renderers.
- The user confirmed that Create kinetic parts export in their setup.
- The GLB writer adds emissive factors and point lights for light sources.

These results are empirical and depend on the mods and the active render path. They do not mean universal compatibility with renderers or instanced pipelines.

## Last known issue

Blender had rejected an export with `Bad glTF: json contained NaN`. Inspecting the file located non-finite bounds on geometry associated with Create Sifter (dust and gravel). The core was changed to skip any quad with a non-finite position or UV and to filter invalid light positions. The fix compiled and the JAR was copied back into the profile; a new export still has to be generated and tried to confirm the fix in real conditions.

## Limits and upcoming work

- Some unusual modded models, or models rendered by custom pipelines, may be missing.
- Fluid sources and transparency need checking per mod.
- Emissive rendering and light intensity/range were tuned after user feedback, but still need visual validation in the new export.
- UI selection, performance, mesh reduction/optimization and the texture atlas still need improvement.
- Fabric, Quilt and Forge are not implemented.
- The web viewer was just created and needs to be used on representative exports.

## Mod commands

- `/minemories select first` / `second`: sets the targeted corners.
- `/minemories select status`: shows the selection.
- `/minemories select clear`: clears the selection.
- `/minemories export`: exports the selection.
- `/minemories export <radius>`: exports an area over the dimension's full height (horizontal radius 2–128 blocks, 128 by default, loaded chunks only).
