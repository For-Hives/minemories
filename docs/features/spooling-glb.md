# Progressive AFK captures and on-disk GLB writer

AFK captures now use `ProgressiveGameCapture` on the client and
`QueuedGlbCapture` in a worker. `SpoolingGlbScene`, in `:core`, writes the GLB
without keeping all of its geometry on the heap. The manual path keeps its
legacy writer: a manual request first stops the AFK work and asks to retry
once it has stopped, without exporting two scenes at the same time.

## Reading across frames and background preparation

The client progressively walks the surface, the cells and the entities. A
frame admits at most 4,096 operations and stops admitting new ones after
2 ms. Reading a model, a column or a GPU strip stays indivisible: the budget is
not an absolute freeze limit. Overruns and the maximum work time are written to
the local log at the end of the capture.

`CaptureElement` copies a block/renderer, with no references to the world, with
a conservative budget of 2 MiB and 8,192 attempted primitives. The pump keeps
this element until it is fully admitted; backpressure never loses geometry.
Sprites and renderer textures are copied on the client thread in strips of at
most 16,384 pixels. The temporary read framebuffer restores the framebuffer,
read buffer, texture and PACK/PBO settings, even on error.

The queue holds at most sixteen packets; a geometry packet holds at most
64 quads and 128 lights. The worker accepts 4,095 lights in total, plus one
mesh node, to stay within the shared validator's 4,096 nodes. Torch-heavy
scenes are therefore not limited to the legacy writer's 128 lights; the viewer
keeps its own cap on active lights. The worker only receives copied arrays and
immutable descriptors. It assembles/encodes one PNG at a time, keeps the
sources on disk and uses `SpoolingGlbScene`. Alpha, tints, secondary layers and
lights are preserved. No world, model or renderer is used by the worker. Dated
files are published only after preparation is complete.

The check runs while paused and in the background. The player's return
suspends reading; it resumes after the configured idle delay. Disabling,
changing settings/API/account, world/dimension/player or reloading resources
cancels the work. Chunks already read must keep their identity until the end;
an unload/replacement rejects the capture. There is never a queue of concurrent
captures. A complete capture already published is kept, even if its context
changes before the notification.

The "capturing / paused / stopping" status appears in both modes of the M menu.
After pairing, the AFK upload is sequential and limited to **512 KiB/s**, using
16 KiB HTTP reads, with no rate credit accumulated while waiting.
API/identity/settings and leaving the world are checked to stop this upload;
the local GLB and the resume state are kept. Manual upload is unchanged.

The `captureStartedAt`/`captureFinishedAt` metadata bracket the actual reading
and writing. Older captures remain compatible. This is a capture over a period
of time, not an atomic state of all blocks/entities: poses and animated atlases
can change between their reads.

`CaptureWorkspace` locks workspaces across processes. Before new work, the
worker cleans up abandoned spools whose names and identities it recognizes,
with a bounded inventory. Active work, a link, an unknown entry or a complete
GLB are preserved. A real process killed abruptly is exercised by the tests.
Reading an already published history does not block behind the preparation of
another GLB.

## Integration validation

On 14 and 15 October 2026, the `0.1.1-dev.1` JAR alone was loaded into
Minecraft 1.21.1 / NeoForge 21.1.248, on an isolated copy. SHA-256 of the final
JAR: `4d10773982896e19920fea0aa2b49bbe7406bbb3e12b76900eb1d95209fbe3bf`
(254,048 bytes). The test exercises pause, client focus lost, suspend/resume,
AFK setting disabled, a real resource reload, an unloaded chunk and
disconnection with history preserved. The PACK/PBO/framebuffer/read buffer
states are checked during capture; the simple/advanced screens are inspected.

Two scenes are measured on Mesa llvmpipe, with standard textures and entities:

| Scene | Synchronous export | Longest AFK step | Progressive capture |
| --- | --- | --- | --- |
| Radius 32, 77,744 quads, 74 textures | 765 ms | 3.83 ms (13 budget overruns) | 187.6 s with suspension and focus lost |
| Radius 8, 6,141 quads, 22 textures, before consolidation | 93 ms | 4.00 ms (2 overruns) | 26.3 s; about 3 s more for the upload |

These measurements predate the consolidation of the remote fixes. The
consolidated JAR re-exercises every scenario: 225 torches in the area,
12,194 quads, 23 textures and 225 lights preserved. The synchronous export
takes 105 ms, the longest AFK step 3.44 ms (5 overruns), for 83.3 s of capture
and about 4 s of upload. The shared validator and the real API accept this
2,288,976-byte file. The context check before notification is also exercised.
The steps only cover the capture, not a whole frame's time: software rendering,
FPS limiting, menus, GC and other mods remain visible in the total latencies.
These results do not guarantee the same performance on all hardware/modpacks.

The seven GLBs of the large scene, the six from the run with the context check
and the six from the consolidated 225-light run pass the shared API/viewer
validator. Blender imports the before/after renders: same geometry, same number
of materials and textures. On the large scene, the geometry accessors are
byte-for-byte identical; 73 images are identical after decoding, while the
animated block atlas changes during the capture period. The 1,329,204-byte GLB
and the consolidated 2,288,976-byte GLB are sent to a real loopback API through
a paired device, with an identical SHA-256 on the storage side and dates
preserved through oRPC. No diagnostics are collected without consent. This
local validation proves neither the production API deployment nor
compatibility with every modpack renderer.

The tests cover budgets/admission, texture-geometry ordering, backpressure,
cancellation, crash/cleanup, images, timestamps and refusal without
overwriting. An HTTP test measures the actually paced publisher and stopping
before finalization when its context changes. `bun run build` passes with the
coverage and SpotBugs thresholds. The published beta and the installed
CurseForge profiles are not replaced by this development JAR.

## Data ownership and publishing

The constructor creates a private temporary folder under the chosen parent. The
builder belongs to a single thread; it does not synchronize concurrent calls.
`addQuad` accepts the same primitive information as `GlbScene` and consumes the
arrays before returning. The caller can then reuse them. PNGs, positions,
normals, UVs and indices are written to spool files, without keeping the
provided arrays. Strings are immutable and their size is checked before
admission. No world, model, renderer or atlas object is accepted. These methods
perform I/O: the pipeline calls them in its worker, after the game data has
been copied on the client thread.

An LRU cache limits open streams; the final copy only opens the output and one
input at a time. The `peakOpenFiles` counter includes file creation and this
phase. A quad uses 152 bytes of binary data before textures and JSON. Buffers
are fixed: 152 bytes for encoding a quad, 64 KiB for copying, 8 KiB per spool
stream and 64 KiB for the final output. Descriptions, bounds and counters stay
in memory, bounded by the input and string limits. The builder keeps neither a
full BIN nor a full GLB. Memory for the incoming arrays and their production
must be bounded by the client pipeline; this builder does not limit an
allocation already made by the caller.

`write` closes the cache, checks the actual identities and sizes of the files,
prepares the JSON on disk, then copies the segments into a temporary file next
to the destination. The final replacement requests `ATOMIC_MOVE`; if that is
refused, it is an error, with no fallback that would delete the previous file.
The spool's file system must provide file identities. Links and replaced
folders or files are refused. Publishing does not `fsync` each file; it is not
a guarantee against a power cut.

An I/O error, an exceeded limit or an interruption invalidates the builder. It
can no longer accept or publish data. Recorded temporary files are deleted;
cleanup never recurses into an unknown folder, a link or a replaced folder.
Other deletions are attempted even if one deletion fails, and `close` allows
retrying the cleanup. Cleanup errors are reported to the caller. A file
published by a successful `write` is kept if a later cleanup fails. An abrupt
stop can leave a spool on disk: the coordinator cleans it up before the next
job, according to the identity and content checks described above.

## Limits and format

`Limits` lets you tune materials, textures, lights, UTF-8 bytes per string,
JSON bytes, spool bytes, final GLB bytes and open files separately. The
defaults are 4,096 materials, 1,024 textures, 128 lights, 4,096 bytes per
string, 4 MiB of JSON, 256 MiB of spool, 200 MiB of GLB and 8 open files. At
least two open files are required for the copy. The spool includes the
unpadded JSON size; the final file limit includes headers, alignment, geometry,
JSON and textures. Peak disk usage can reach spool + final file, plus the
compatibility copies made by the history. The file system cache also uses
memory outside the Java heap.

Shared PNGs are spooled only once. A new material that redefines an image with
different bytes is refused. As with `GlbScene`, a material's first descriptor
is kept for subsequent quads with the same key. Quads with non-finite
positions/UVs and invalid lights are ignored. An export without geometry is
refused. The caps never silently drop materials or lights: exceeding a limit
invalidates the whole capture.

Alpha MASK/BLEND, tint, opacity, emissive textures and `KHR_lights_punctual`
are preserved, and so is each material's side: block and fluid materials are
single-sided, renderer materials double-sided ([face culling](glb-face-culling.md)).
The subtractions in the normal computation happen in double
before the cross product: even extreme finite positions do not become NaN
normals through a float subtraction overflow.

## Verification and measurements

The tests compare bytes with `GlbScene` across several materials, shared
images, interleaved quads, indices, UVs, normals, alpha, tint, emissivity and
lights. The edge cases check the binary floats of the normals. They cover exact
limits, array mutation after admission, I/O, interruption, replaced
files/folders, partially refused cleanup, closing and refusal to publish
without geometry. A regression test starts a real Java process with
`-Xms16m -Xmx32m` and writes 600,000 quads, i.e. a 91,201,408-byte GLB.

To reproduce the measurement after `:core:testClasses`:

```sh
java -Xms16m -Xmx32m -cp core/build/classes/java/main:core/build/classes/java/test \
  dev.minemories.core.SpoolingGlbProbe /tmp/capture-spooled.glb 600000
```

Local measurement of 13 October 2026, JDK 21.0.12.1, files under `/tmp`: about
3.57 s for this fixture, maximum allowed heap 32 MiB, heap used as observed by
sampling 10,102,752 bytes and maximum process RSS 82,264 KiB. The RSS includes
the JVM, libraries and other native allocations; sampling does not measure the
heap peak exactly. The test uses a tiny texture and repeated geometry; it
measures neither the capture of Minecraft models nor client freezes. Adding
`legacy` as the last argument exercises the old builder with the same quads and
the same heap, to compare memory usage.

`SpoolingGlbFixture` produces a small terrain, leaves with alpha cutout,
transparent glass and a lamp. The legacy/spooled GLBs are byte-for-byte
identical. Blender 5.2.2 imports each file with one mesh, four materials, four
2 × 2 images and one light; both renders were inspected visually. This format
validation does not count as an in-game AFK validation.


## Detailed costs and metadata preparation

The follow-up to issue #79 adds cumulative measurements per client and worker
phase, without changing the 2 ms / 4,096 admissions budget or the 512 KiB/s
pacing. The corpus, the measured JAR and the interpretation limits are
described in [AFK capture measurements](afk-performance.md). Reading metadata
icons is bounded to 128 KiB and PNG headers ≤512×512, and refuses symbolic
links.

## Deliverable size

Indices in the final file now use 8/16/32 bits depending on the primitive, and
unused texels in renderer atlases can be made uniform without changing UVs,
dimensions or sampled pixels. The index spool stays 32-bit; the limits and
atomic publishing still apply. See [measurements, costs, boundaries and
before/after validations](glb-size.md).
