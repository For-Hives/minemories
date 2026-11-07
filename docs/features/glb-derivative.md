# Meshopt transport variant (issue #173, phase 4)

The stored, downloadable `capture.glb` remains the quantized glTF 2.0 that Blender can read (see
`docs/features/glb-size.md` and `glb-v2-decisions.md`: Blender 5.2.2 does not decode `EXT_meshopt_compression`). For the
viewer, the API can produce a **transport variant** compressed with `EXT_meshopt_compression`.

## Principle

- `GET /api/memories/:id/file`, `/api/shared/:token/file` and `/api/public/:id/file` accept `?variant=meshopt`.
  Any other value, a file that is too large, a full queue or a compression failure return **the original
  unchanged**: the variant is always optional. The API announces the variant with the `X-Minemories-Variant:
  meshopt` header (exposed through CORS); the existing transport gzip applies on top.
- The codec lives in `packages/api-contract/src/glb-meshopt.ts`, without WebAssembly (the `meshoptimizer` encoder/decoder
  are injected):
  - `compressGlb` compresses each vertex view as `ATTRIBUTES` and each index view as `TRIANGLES` (8-bit indices
    widened to 16 bits, as the specification requires), **without reordering** triangles: the per-chunk ranges in
    `extras` stay valid. Other views (images) are copied. The fallback buffer is declared without data and
    `EXT_meshopt_compression` is in `extensionsRequired`. A view shared by several accessors, or an accessor
    with an offset or `sparse`, is not compressed.
  - `expandGlb` does the reverse and returns an **ordinary** GLB. It refuses (null, never an exception) any malformed
    file: fallback buffer with a `uri`, ranges outside the binary chunk, `count × byteStride` different from the declared
    size, unknown mode, more than 256 MiB decoded, corrupt stream rejected by the decoder.
- **Validator compatibility**: the viewer does not accept the compressed format in `validateSelfContainedGlb` (which
  still rejects these views, see `glb-layout.ts`). `downloadCapture` decodes the variant into an ordinary GLB **before**
  the usual validation (budgets, accessor bounds, values): the validator, the upload API and older GLBs are
  unchanged. The WebAssembly decoder (`meshoptimizer/decoder`) is only loaded when the first variant arrives.

## Storage, quota and lifetime

Nothing is durable: the variant is **computed on demand** from the stored object and kept in an **in-memory** cache
(`capture-variants.ts`): at most 128 MiB, 10-minute lifetime, key = SHA-256 of the original (so a replaced or deleted
capture is never served again after expiry), a single encode at a time with two waiting (beyond that the original is
served), and originals over 64 MiB are not compressed. Consequences:

- no extra S3 object or file: no quota to charge (`account-storage-quota.md`), no durable deletion to propagate
  (`durable-deletions.md`, `trash-retention.md`), no cold-storage lifecycle (`cold-storage-costs.md`); an archived
  capture goes through the restore path (HTTP 202) before any variant;
- the cost is on-demand CPU: 46 ms for the 10.6 MiB capture measured below.

## Measurements (quantized writer + atlas repack, outside the game; gzip level 4 like the API, brotli 9)

| Capture | Original raw | Variant raw | gzip original → variant | brotli original → variant |
| --- | ---: | ---: | ---: | ---: |
| AFK radius 32 | 1,082,984 | 458,148 | 269,344 → 94,826 (−65%) | 108,496 → 72,265 |
| AFK radius 8 | 180,516 | 162,296 | 35,493 → 27,237 | 22,346 → 20,450 |
| Full height | 243,820 | 133,972 | 60,321 → 28,944 | 34,098 → 22,879 |
| Models, alpha and lights | 302,216 | 251,492 | 62,843 → 50,923 | 42,281 → 40,542 |
| Real capture (modpack) | 10,614,852 | 2,975,836 | 2,430,289 → 743,867 (−69%) | 1,212,331 → 601,470 |

Small captures dominated by PNGs and JSON gain little; the "tower and surface" capture (49 KiB) is not
compressible (the variant would not be smaller). Compared with the pre-#173 export (real capture: 20.3 MiB
raw, 2.60 MiB gzipped), the transfer drops to 0.74 MiB.

Timings (Bun for encoding, Chromium for decoding, median of 5): encoding 46 ms on the real capture, 13 ms on
radius 32; decoding and reshaping in the browser 24.5 ms (real capture), 4.6 ms (radius 32), 14.7 ms
(models). Full load time with a real GPU is not measured (SwiftShader only); decoding remains negligible
compared with the transfer and scene preparation.

## Validation

- API tests: bit-exact round trip of the views, 8/16/32-bit indices, hostile inputs, cache (expiry, eviction,
  queue, size), shared route `?variant=meshopt`; the decoded GLB passes `validateSelfContainedGlb`.
- Viewer tests: `downloadCapture` requests the variant, decodes it, rejects a corrupt variant and honours cancellation.
- The five replayed GLBs and the real capture are compressed then decoded without a single byte of difference from the
  original; the six decoded GLBs pass the validator; the viewer (headless Chromium, SwiftShader) renders the decoded files.

## Limits

- The world view (`fetchTemporalFile`) also requests the variant: it no longer checks the exact size but bounds the stream by the original's declared size (a variant is never larger).
- The cache is per process: several API instances each recompute.
- No in-game validation (this phase does not change the mod).
