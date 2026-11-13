# Frozen entities and animated models in captures

The memory contains the animals, mobs and players **already loaded by the client**
whose reference position lies within the selected area. Their whole model is
kept, even if a leg or arm sticks slightly past the edge. Removed or invisible
entities are excluded. The pose, equipment and visible variants match the
client's last tick, including when the game is paused. The GLB remains a frozen
3D image: it contains no AI, no inventory and no playable animation.

Beds, chests and other blocks with a block entity renderer go through their
Minecraft renderer. `ENTITYBLOCK_ANIMATED` blocks no longer receive the block
manager's placeholder model. A block combining a baked model and a renderer
keeps both parts.

## Geometry and textures

The collector receives the positions transformed by the renderer and its UVs. It
reads the texture actually selected by each render pass, rather than trying to
guess a sprite from the block atlas. Bed/chest atlases, skins and animal
textures are embedded as PNG in the GLB. Layer colours (wool, collar…), their
transparency and the usual light passes are kept. The viewer does not need the
original modpack.

For atlases above the per-image pixel limit, the collector looks up the sprite
containing all of the primitive's UVs in the loaded atlas index. It copies only
that GPU region and remaps the UVs onto the extracted image; it does not copy
the whole atlas. A primitive spanning several sprites is explicitly refused.
Texture and pixel limits still apply.

Vertex colours keep the low byte of what the renderer passes, as Minecraft's own
buffers do (`(byte) value`), rather than being clamped to 0–255. Create's
`SuperByteBuffer` (Create 0.5.1 on Fabric 1.20.1) passes its colours as signed
bytes, so opaque white arrives as `-1`: clamping turned Create parts black with
an opacity of 0, which made them invisible (mechanical crafter, spout, blaze
heater, track station, rotation speed controller, saw, the train hat).
Translucent parts keep their real alpha.

Renderers also bake Minecraft's directional face shade into the vertex colour
(0.5 on the bottom face, 0.6 east/west, 0.8 north/south, 1.0 on top; Create uses
Flywheel's formula on the rotated normal, and in the Nether 0.9 for top and
bottom). The viewer lights the scene itself, so a quad whose averaged colour is
a grey equal to that shade for its world normal (within 2/255) is exported
white. The capture pose only translates, so the quad's geometric normal is the
one the renderer shaded with. Any other tint, including a grey that does not
match the face's direction, is kept. A renderer that shades in model space
before rotating its model is therefore left shaded. On 26.3 only the Overworld
rule applies until its `CardinalLighting` is ported.

Transparent secondary layers get a very small offset along the normal (2 mm for
the first, 16 mm at most). This prevents a collar lying exactly on the body from
making that body disappear in a ray-tracing engine such as Blender. Shape and
UVs are kept; the main layer and opaque passes are not moved.

Quads as well as triangles, strips and fans are collected with their winding.
Only one primitive is pending per pass: the collector does not keep a second
full list of the renderer's vertices. The AFK capture now uses the progressive
traversal and the on-disk writer described in the capture flow.

The Create/Flywheel CPU path (Flywheel 1.0 with Create 6, Flywheel 0.6 with
Create 0.5.1) is re-enabled only while the model is collected;
the game backend returns to its initial state afterwards. The versions,
before/after evidence and validations still needed are tracked in
[modpack renderer validation](modpack-renderer-validation.md).

Name tags above entities and sign text are not exported. Text passes without
normals, lines/leads, ground shadows, hitboxes, flames added by the dispatcher,
glint and effects using special shaders are not part of this capture.
Procedural renderers with no accessible texture and mod-specific GPU pipelines
are not claimed as supported. A pass whose texture cannot be identified (drawn
by a shader, or bound outside the render type, as FaunaEngine 1.1 does on
1.21.1) is dropped for that model with one warning in the log, and the capture
goes on: the entity is exported without that pass, or not at all when it has no
other. A texture that is identified but fails to copy still makes the capture
fail before saving; the last complete memory remains available.

Pikachu's secondary layer in Cobblemon 1.7.3 is copied with its texture, but its
specific self-illumination remains a known limit: it gets no glTF emissive
factor. A texture named "emissive" is not enough to conclude that its glow was
preserved. The standard Minecraft `eyes` and `entity_translucent_emissive`
passes are still recognized; the native check of Enderman eyes confirms the
emissive factor and texture in the GLB.

## Limits

Per capture: 2,048 entities (beyond that, the capture asks to reduce the area and nothing is
saved), then, for renderers (`RenderedBudget`): 512 distinct textures, 64 MiB of PNG for those
textures, 128 render passes per model and 500,000 primitives. A texture is at most
4,194,304 pixels and 16 MiB of PNG. These limits come on top of the selection, GLB and
upload limits.

**A renderer limit no longer makes the capture fail** (modpacks with hundreds of distinct entity
textures, Cobblemon for example): the refused texture, pass or primitive is skipped, the terrain
and other entities are kept, and the local log shows a line
`Entity renderers over capture limits: skippedTextures=…, skippedPasses=…, skippedQuads=…`
(counts only, no identifier, name or path). A refused texture is refused once for the whole
capture. Manual and AFK captures go through the same code.

Why 512: the AFK spooled writer accepted 1,024 textures in total when this cap was set (4,096 since 11/11/2026), shared with the terrain and
block entities; a real modpack capture has 83 (38 KiB of PNG in total, after atlas cropping),
67 for the largest native capture. 512 entity textures therefore leave at least 512 slots for the
rest, and the 64 MiB PNG budget, which remains the real memory cap, is not reached by 512
textures of 256 × 256 (a few tens of KiB each).

In-game validation (NeoForge 21.1.248, 14 creature types, 31 entities, native trial of the manual
path with reduced limits injected by the QA driver): without a limit, 17 textures; with 3
textures, 14 refused and 3 kept; with 1 pass, 7 passes skipped; with 2,000 bytes of PNG,
15 textures refused; with 50 primitives, 1,569 skipped. No capture fails, the five GLBs pass the
viewer and API validator and import into Blender 5.2.2 (kept entities render). A real modpack
was not exercised.

Remaining limit: the spooled writer still fails if the **total** number of textures exceeds 4,096
(terrain and block entities included). It was 1,024 until 11/11/2026, when a 300-mod Fabric 1.20.1
capture reached 1,229 distinct block sprites.

Reading models and textures stays on the game thread, with the OpenGL read state
restored. No change to blocks, entity poses or world saves is needed for the
export. A skin already used by the client is copied from its loaded texture;
Minemories does not start a separate skin download.

## Validation

Unit tests cover selection limits, non-finite positions, the last primitive,
attributes, colours (signed-byte colours from Create staying opaque, real
translucency kept), baked face shade removal per direction, in the Nether and on
rotated parts, triangle winding and processing a 40,000-vertex model
without reusing its published arrays. PNG tests check channels, alpha, row order
and limits before allocation. Validation of 14 October 2026: Minecraft 1.21.1 /
NeoForge 21.1.248 loaded the `0.1.0-beta` JAR alone, together with a separate
test mod, in a throwaway profile. Hash:
`249fa27d83b00a78beef6bca300a94b60a8e1297c2948ffde6e645c61cd70b20`
(181,754 bytes). The exported scene includes a sitting tamed wolf with a collar,
a sitting cat, a magenta sheep, a helmeted zombie, a skeleton with a bow, a
chicken, an equipped armor stand and a player, a full bed and single/double
chests. The closed/open exports and the wolf-only, bed-only and chest-only
exports were imported and rendered in Blender 5.2.2; the wolf's body and collar
are both visible after the layers are separated. The custom name is not in the
GLB; the invisible entity and the out-of-area entity are excluded.

A test move to a missing chunk does not turn the local player into a fake
memory: the capture fails and keeps the last file. The same JAR also completed a
local AFK capture with the real pause menu open (timers sped up to one minute
for this trial). The six GLBs pass the shared API/viewer validator. `bun check`,
included in `bun run build`, passes with 172 API, 98 web, 24 core and 98
NeoForge tests, and the coverage thresholds.

This fixture does not claim compatibility with every renderer of every mod.
Procedural and modpack-specific GPU pipelines must be exercised separately. This
test did not trigger any upload to the production API, as there was no pairing.

The scenario also exercises a texture unloaded just before the export and a
non-standard OpenGL read state (packing and pixel-pack buffer). The copy resets
the read state, then restores binding, offsets, alignment and buffer; the
in-game assertions check these six values after each export.
