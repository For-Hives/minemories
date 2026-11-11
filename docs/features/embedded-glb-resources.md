# Embedded resources in GLB memories

A memory must carry its geometry and textures with it. References to
neighboring files, an HTTP URL, a local path or a blob created elsewhere
are rejected by both uploads and by the viewer before its Three.js parser.
This also applies to older downloaded memories and shared links:
they go through the same scene loading as files opened locally.

The shared validation lives in `@minemories/api-contract/glb`:

- GLB 2, exact length, a valid UTF-8 JSON first chunk and `asset.version=2.0`.
- At most 4 MiB of JSON, then at most 64 additional chunks. Extensions
  with unknown chunk types stay ignorable; a second JSON chunk is rejected because it
  could replace the checked content in the parser. The BIN chunk is unique and,
  if present, immediately follows the JSON.
- Only the first buffer may use that BIN without a URI. Its declared length is
  positive, an integer and compatible with the BIN size, with at most three bytes of
  padding. Any other buffer must provide its own data through a base64
  `data:application/octet-stream` or `data:application/gltf-buffer` URI.
  Its declared length must match the embedded bytes, with or without
  base64 padding; a short URI cannot announce a larger buffer.
- Each image provides a `bufferView` reference with a MIME type, or an embedded
  raster `data:` URI. Accepted types are PNG, JPEG, WebP, AVIF and KTX2.
  Extension-based formats remain subject to the loader's capabilities; this check
  does not claim to add new decoders to the viewer. SVG is rejected.
- Metadata URIs in `extras` are not loader resources and are
  not treated as textures or geometry.

These rules follow the structure and embedded resources of the
[glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html),
with a Minemories policy that requires the file to be self-contained.

Binary caps remain 100 MiB for the legacy upload and 450 MiB for the
resumable upload in 4 MiB chunks. Validation of the latter reads the JSON, the
texture headers and the accessor windows, then computes the checksum as a
stream; it does not load the whole BIN. Rejected files create neither a
memory nor a storage object. A
rejected resumable session can be cancelled; otherwise its private staging expires
through the existing mechanism.

In the viewer, the file is checked before any texture or buffer is loaded.
On rejection, loading stops and a message asks to re-export with
embedded textures and geometry. Older non-self-contained files are
neither modified nor deleted automatically. The mod's current export keeps
its format and its embedded PNG textures.

Validation: external/relative/local/blob URIs on both HTTP uploads,
no storage and no publication after rejection, replacement JSON, duplicated
or missing BIN, padding, JSON and chunk bounds, invalid UTF-8,
accepted data URIs, the real Three.js parser for a self-contained scene, and rejection
before the texture loader. Local viewer and gallery interactions
check the message and that the loading indicator goes away. The real Minecraft capture
of 10,488,752 bytes passes both validations; its Blender import and render
were inspected, with one mesh and 55 embedded PNG images. No private file is
added to the repository or sent to production for these tests.

## Format 2 (issue #173)

GLBs produced since format 2 contain one node and one mesh per category (`terrain`, `decor`, `fluids`,
`block_entities`, `entities`) and `extras` (`asset.extras.minemories`, `minemoriesChunks` per primitive). No
new accessor type or extension: the validators have not changed and older files (a single mesh) are still
accepted. See `docs/features/glb-size.md`.

Since phase 3, attributes are quantized (`KHR_mesh_quantization`, already accepted by the validator): POSITION as non-normalized
int16 with a node scale, NORMAL as normalized int8, TEXCOORD_0 as normalized uint16, all with `byteStride`.

## Layout and geometry budgets

The same shared check verifies the JSON layout before storage and before
the Three.js loader is called. Each view references an existing buffer and stays within
its length. Offsets and strides are integers, aligned and compatible with
the component types; matrices account for column padding.
The full range of an accessor, including its last element, must fit in
the view. References and ranges of sparse substitutions are checked too.

Primitives reference existing accessors, with matching vertex
counts, types suited to the attributes and finite POSITION bounds.
Indices use an unsigned integer scalar and a consistent topology.
The check distinguishes texture, vertex and index views; several
vertex accessors sharing a view require an explicit stride. Morph
targets, skin attributes, declared quantized types and GPU instancing
go through these layout checks. Meshopt and Draco are rejected: the viewer
does not have their decoders configured, and their compressed layouts cannot
bypass the budgets.

| Shared API / viewer budget | Cap |
| --- | --- |
| Entries per checked list | 16,384 |
| Total accessor elements, indices included | 32,000,000 |
| Estimated decompressed geometry as float32 | 256 MiB |
| Total primitives | 4,096 |
| Elements to draw, repetitions and instances included | 32,000,000 |
| Nodes | 4,096 |
| Hierarchy depth | 128 |

These budgets are Minemories limits, on top of the glTF structure. They apply
to the full lists, including data not used in the initial
scene. Implicit-zero accessors and sparse data are counted
before allocation; the GLB size alone would not bound their expansion.
Nodes reference existing meshes, with finite transforms.
Cycles, multiple parents and inconsistent scene roots are
rejected without recursively walking the graph.

The legacy and resumable HTTP uploads reject the inconsistent-geometry fixtures
before publication or object storage. The viewer rejects the same
layouts before invoking the loader; a valid triangle scene also passes
the real Three.js parser. The Minecraft captures of 10,488,752 and
13,628,224 bytes pass the viewer's in-memory check and the resumable
file check, which reads only the JSON and headers before its streamed checksum.
The Blender render of the recent capture was inspected: the village, textures
and terrain volume remain visible. `bun run build`, including `bun check`,
passes with 93 API tests and 64 web tests; the functions and lines of the shared
check are 100% covered. The eight real Garage scenarios pass as well,
including the resumable upload, the outage and the cleanup in a new process.

## Binary accessor values

The 11 October check also examines the bytes of every accessor, including
those not used by the initial scene. The legacy and
resumable uploads and the viewer apply the same rules before storage or
calling the loader:

- Float components must be finite: NaN and both infinities are
  rejected in base values and sparse substitutions.
- Declared bounds must match the actual extrema. JSON numbers
  are rounded to float32 with `Math.fround` before comparison; normalized integer
  types keep their raw bounds, as the format specifies.
- Every primitive index references an existing vertex for all the
  primitives that use it. The reserved maximum values of uint8/16/32
  are rejected as indices.
- Sparse indices are strictly increasing, unique and lower than the
  accessor's element count. Bounds are computed after substitution,
  with the remaining implicit zeros. An accessor with neither a base nor sparse data may keep
  descriptive bounds without data, as glTF allows.
- Strides and matrix column padding are respected;
  padding bytes do not become components.

Each read stays limited to **64 KiB**, for the base, the sparse indices and
their values. Windows are walked without building the full accessor
or keeping a table of all substitutions. Base64 URIs are decoded
within the 4 MiB JSON limit. The check regularly yields to the
event loop so that loading stays visible. The final resumable
checksum keeps its streamed pass.

These rules follow the Accessor Bounds, Sparse Accessors and Topology
and Connectivity sections of the
[glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).

The tests cover non-finite values, wrong bounds, the three index
types, the four normalized integer types, padded matrices,
strides, substitutions across several windows, short reads
and inline buffers. Both uploads reject malformed files without
creating an object or publishing a memory. The real Three.js parser also accepts
valid sparse geometry and is not called for rejected fixtures.

The real captures of **10,488,752** and **13,628,224** bytes pass the in-memory
check and the resumable file validation with SHA-256. The Blender render
of the second one was re-checked: village, textures and 65 × 65 × 118 terrain
remain visible. No change to the exported file or the Minecraft code.

These checks are not an exhaustive validation of the other glTF constraints
and extensions.

## Texture dimensions and budgets

Image headers are examined before the browser's decoder and before
publication by both uploads. A small compressed file therefore cannot
announce an arbitrarily large texture. Unused images count
too. Each texture entry consumes the cost of its sources, including
extension fallback sources; repeating a source in several textures
does not bypass the total.

| Shared API / viewer budget | Cap |
| --- | --- |
| Width or height of an image | 16,384 pixels |
| Pixels per image, planes and frames counted | 16,777,216 |
| Total pixels, repeated sources included | 67,108,864 |
| Estimated decompressed size per image | 128 MiB |
| Total estimated decompressed size | 512 MiB |
| Images / textures | 4,096 / 4,096 |
| Bytes read for headers, across all images | 8 MiB |
| Chunk headers, markers, boxes and extents walked | 16,384 |
| Image read window | 4 KiB |

The estimate uses eight bytes per pixel; for KTX2, it takes the maximum of
that cost and the sum of the decompressed sizes declared by the levels.
Mipmaps, layers, cube faces and depth are examined; depth is
limited to 16,384 and layers to 1,024. Ranges and sizes of
supercompressed levels are checked before the encoded data is read.

PNG checks the IHDR and APNG frame dimensions. JPEG reads markers
up to the first scan and checks the SOF. WebP checks the VP8X canvas,
the VP8/VP8L dimensions and every animated frame. For APNG and animated WebP, the budget
counts one canvas per frame, plus one compositing canvas.

For AVIF, the check follows the AV1 and alpha items down to their extents, without
concatenating the whole image. It reads the maximum dimensions from the actual
AV1 Sequence Header OBUs: `ispe` display properties alone do not bound
intermediate images. Grids count their output and, to be safe,
every coded plane for each cell, so that reused alpha planes are covered
too. This calculation may reject a grid that an optimized decoder would hold
in less memory. External references, unchecked construction
methods, unknown derivations and animated AVIF tracks are rejected. Static
items, alpha and grids remain subject to the shared budget.

The checked layouts are described by the
[PNG/APNG](https://www.w3.org/TR/png-3/),
[JPEG](https://www.w3.org/Graphics/JPEG/itu-t81.pdf),
[WebP](https://developers.google.com/speed/webp/docs/riff_container),
[KTX2](https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html) and
[AVIF](https://aomediacodec.github.io/av1-avif/) specifications, along with the
[AV1 Sequence Header](https://github.com/AOMediaCodec/av1-spec/blob/master/06.bitstream.syntax.md) syntax.
The case of alpha shared across cells is described in the
[libavif decoder](https://github.com/AOMediaCodec/libavif/blob/main/src/read.c).

These header checks do not decode pixels, do not verify PNG CRCs
or the full codec syntax, and do not guarantee the total memory of the
process or the GPU. Decoder errors stay visible. No KTX2 decoder
is added to the viewer; validating its budget does not make this format displayable
on a configuration that did not support it.

Validation of 11 October: raster fixtures produced for the tests (PNG/APNG,
JPEG, static/animated WebP and AVIF with alpha), synthetic KTX2 and AV1 headers,
excessive dimensions, repeated references, cumulative KTX2 budget, AVIF grids,
metadata floods, inline data, contradictory MIME types and truncated reads.
The legacy and resumable uploads reject these files before storage and
publication. The viewer rejects the same budgets before calling Three.js.

The real Minecraft captures of **10,488,752** and **13,628,224** bytes still pass
the in-memory and on-file validations with SHA-256. The Blender
5.2.2 render of the second one was inspected: village, foliage, textures and 65 × 65 × 118
terrain volume remain visible. The exported format and the mod code
do not change. The synthetic fixtures test the header check; they
are not presented as decodable images.
