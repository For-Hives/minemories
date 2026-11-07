# Landing film asset pipeline

The film on the `/` page ([landing-film.md](landing-film.md)) reads six GLB captures (`S0` to `S4`, `characters`) of 1.3 MB each. This pipeline turns them **losslessly** into optimized, hashed assets with a manifest, and checks on every run that nothing the engine sees has changed. The output is a folder of static files and a `manifest.json`: it depends on no framework (the website stack can change; the browser only needs the manifest and `lib/capture-delta.ts`).

Design and baseline measurements: the `three-diet` track of the stack benchmark (28 October 2026, outside the repository). Everything described here as "kept" has been **proven identical** (decoded data and canvas pixels); anything that changed a pixel was discarded.

## Commands

| Command | Effect |
|---|---|
| `bun run hero:assets` | Reads `apps/web/public/hero/captures/*.glb`, rebuilds, proves, writes `apps/web/public/hero/captures-opt/` (hashed files, `.br`, `.gz`, `manifest.json`, `report.json`). ~20 s. Fails if the byte budget is exceeded. |
| `bun run hero:assets --check` | Same computations in memory, **writes nothing**. Fails if the generated folder exists and differs from what the sources produce (the `.br` and `.gz` files are compared by their decompressed content), or if the budget is exceeded. Run after `hero:assets` in the `build` scripts. |
| `bun run hero:assets --inventory` | JSON inventory of the raw captures (geometry and texture bytes, vertices, primitives, images, images shared between files). |
| `bun run hero:assets --update-budget` | Rewrites the reference values in `scripts/hero-assets/budget.json` (a deliberate act, to be reviewed in the PR). |
| `bun run hero:check` | Pipeline tests then `--check`; part of `bun check`. |

`bun run hero:assets` then `hero:assets --check` are also run by the `build` script of `@minemories/web` (hence by Railpack) and by `bun run build` before the bundle. In development (`bun web:dev`), the generated folder does not exist until the command has been run: the film then downloads the raw GLBs, as before.

Development dependencies added at the root (exact versions, no binary downloaded): `meshoptimizer` (already in `bun.lock` through `@types/three`), `@jsquash/oxipng` (oxipng as WASM, + `wasm-feature-detect`) and `pngjs` (PNG decoder for the proof); `wasm-feature-detect` is not declared: it is oxipng's own dependency (oxipng imports it), hence required. `bun.lock` was completed by hand for these three entries (the local Bun 1.3.14 cannot read this lockfile format): CI's `bun install --frozen-lockfile` is what validates it.

## What the pipeline does

Code: `scripts/hero-assets/` (Node, ESM). Configuration: `config.json` (capture list, role, priority, base), `budget.json`.

1. **Inventory** (`inventory.mjs`).
2. **Rebuild** (`rebuild.mjs`), at the GLB container level, without Blender or a round trip through a scene graph: each meshopt vertex stream is decoded then re-encoded with the current `meshoptimizer` codec (stream version 1, smaller); each PNG goes through oxipng level 6 (`optimiseAlpha: false`, interlacing disabled); index streams, the JSON (materials, nodes, lights, samplers, primitive order) and the view layout are untouched. Stream version 1 is only legal under the name `KHR_meshopt_compression`: the extension is renamed (JSON text only); three's `GLTFLoader` registers it under both names.
3. **Proof** (`equivalence.mjs`), by a decoder **independent** of the one that rebuilt (three's own meshopt decoder): the JSON is equal (apart from offsets and the rename), each compressed stream (positions, normals, UVs, indices: all of them) decodes to identical bytes, each image is either the same bytes or the same RGBA pixels with the same colorimetry chunks (`gAMA`, `cHRM`, `sRGB`, `iCCP`, `cICP`: identical presence **and content**). A single difference makes the command fail; tests inject a moved vertex, a tinted texture, a renamed material.
4. **Stage deltas** (`delta.mjs`): `S1` to `S4` and `characters` are encoded as a sequence of "copy from `S0` / add bytes" against the rebuilt `S0`. A delta starts with a version byte (`DELTA_VERSION`, 1): a future format is refused by old clients, which fall back to the full GLB. Each delta is replayed with **the applier that ships to production** (`apps/web/src/lib/capture-delta.ts`, imported as is by Node) and compared byte for byte.
5. **Delivery compression**: brotli level 11 (16 MB window) and gzip 9, one `.br` and one `.gz` file next to each asset.
6. **Hashing and manifest**: files are named `<name>.<first 10 hex of SHA-256>.glb|patch`; `manifest.json` gives, per logical name, the file, `kind` (`base` or `delta`), `base`, `size` and `sha256` of the rebuilt GLB, and `priority`. `report.json` (inventory, raw/gzip/brotli bytes, source hashes, proof) serves CI and this page. Same sources, same bytes: checked by a unit test and by `--check`, which regenerates and compares, on a single machine (Linux, Node 24.15, `meshoptimizer` 1.1.1, `@jsquash/oxipng` 2.3.0); nothing proves that brotli or oxipng produce the same bytes on another version or platform, which is why `--check` compares the `.br`/`.gz` copies with what they decompress to rather than with their bytes.

### Where the generated files go

`apps/web/public/hero/captures-opt/`, **ignored by git and generated at build time**. Rationale: the raw captures remain the versioned source (`public/hero/captures/`, the film's fallback); also committing 700 KB of derived binaries would bloat the history on every regeneration (the output changes as soon as a capture or tool changes) and would prove nothing that `--check` does not prove better. The cost is a build ~20 s longer and the build depending on the locked tool packages. To reverse that decision (version the output), remove the line from `.gitignore`: `--check` then compares the committed folder with the sources.

## Browser side

`apps/web/src/lib/capture-delta.ts` (pure module, 100% line, branch and function coverage):

- `loadCaptureManifest`: downloads and validates the manifest; any anomaly yields `null`.
- `createGlbFetcher`: downloads the base only once, rebuilds each stage from its delta (`applyDelta`), checks the size then the SHA-256 (if `crypto.subtle` exists: secure origins), and **falls back to the full GLB** (`/hero/captures/<name>.glb`) on any error: missing or invalid manifest, delta missing, truncated, with the wrong size or wrong hash, base unavailable. A server answering an HTML page with 200 for a missing file therefore has no effect (the size does not match).
- Deltas are requested with `fetch(…, { priority: 'low' })`.
- Bounded inputs: `applyDelta` refuses an unknown version, an impossible operation count, an empty operation other than the last, a copy outside the base, and receives the expected size (the manifest's `size`), which it checks **before** allocating; a response announcing or exceeding the expected size (+ 64 bytes of table for a delta) is refused; the manifest only accepts names of the form `<name>.<10 hex>.glb|patch`, without a prototype.
- **A fallback is never silent**: each fallback (missing manifest, refused delta…) calls `console.warn('[hero-assets] fallback', name, reason)` and increments `window.__hero.captureFallbacks` (`{ count, last }`). The identity harness reads this counter (0 expected) in addition to the network requests.
- A failed base download is remembered for the session (no retry on every stage); bases are cached per file.

`HeroFilm.tsx` requests the manifest **at the same time** as the film's JavaScript chunk (no extra round trip before `S0`) and passes the loader to `mountHero({ fetchGlb })`. In `scene.js` (vendored module), only three spots are touched, marked with "hero-assets anchor": the `glbFetcher` variable, the first line of `fetchGlb`, and the `fetchGlb` option of `mount()`. `scene-anchor.test.js` fails if a resync with the prototype erases them.

Load order: `S0` first (frame 1 of the film); `S1` to `S4` start when the film reaches 4 s (or after 2.5 s), through the existing `preload: 'auto'` option, so well before ~28.8 s of film, one stage at a time and at low priority. `characters` is only read if the character PNGs fail (the film's fallback path): `low` priority. The poster is unchanged.

## Levers kept and discarded

| Lever | Status | Reason / measurement (S0) |
|---|---|---|
| Re-encoded vertex streams (v1 codec) | **kept** | -13.5 KB brotli; decodes identically; `KHR_` rename (caveat below) |
| Losslessly recompressed PNGs (oxipng) | **kept** | -14.8 KB brotli; same RGBA pixels and same colorimetry chunks |
| Stage deltas against `S0` | **kept** | S1..S4: 524 KB (rebuilt full files) -> 183 KB brotli; stateless, independent of load order |
| Precompressed brotli 11 | **kept** | -13% on JS, -17% on GLBs compared with gzip (if the server serves it, see "Server") |
| Content hashing | **kept** | enables `immutable` on the captures |
| Quantizing positions to the 1/16 grid | discarded | **wrong**: 10.65% of `S0` components are off the grid (grass, ferns, logs: random offsets); and the film reads `geometry.attributes.position.array` as world floats |
| meshopt exponential filter | discarded | 22,000 to 47,000 components differ after decoding: not identical |
| Merging primitives | discarded | 137 materials with unique names, no pair of primitives shares one; merging requires an atlas, which breaks `NEAREST`/`REPEAT` and draw order |
| KTX2 / Basis | discarded | lossy transcoding, not identical with `NEAREST` |
| Reordering vertices (`reorder`) | discarded | changes draw order and the index pattern; uncertain gain |
| SIMD-only meshopt decoder | discarded from the build | -2 KB gzip, but breaks browsers without WASM SIMD |
| Compression Dictionary Transport (S0 as dictionary) | discarded | 49 KB better than the delta but Chromium only; the byte delta works everywhere |
| Chained delta (S2 against S1…) | discarded | only -22 KB, depends on load order |
| Blender / gltf-transform | discarded | the rebuild happens at the container level: the JSON and view order remain those of the source (gltf-transform rewrites them), and there is no extra dependency |
| Recompressing the JPEG posters | not done | no lossless tool already available (`jpegtran`, `mozjpeg`): downloading a binary is ruled out |
| JS levers from the `three-diet` track (i18n catalog, removing three code, CSS) | out of scope | separate work: this pipeline only handles assets |

## Byte budget

`scripts/hero-assets/budget.json` stores the measured values; each metric fails at **value + 3%** (`marginPercent`). Metrics: `baseBrotli` (S0), `deltasBrotli` (S1..S4), `stagesBrotli` (S0..S4), `stagesGzip`, `charactersBrotli`. Adding a metric without a reference value also fails. Exceeding the budget **fails** even during generation (not just a warning): the same code runs in CI and in the deployment build, and a weight regression must not reach production without review; the escape hatch is `--update-budget`, visible in the PR diff. After a deliberate change (new capture, tool update): `bun run hero:assets --update-budget` and review the file's diff in the PR.

Actual CI safeguards: pipeline unit tests, decoding proof (on every generation and every `--check`), budget, determinism. The "generated folder = sources" comparison of `--check` only applies when the folder exists (after `bun run hero:assets`, or on a dev machine): on a fresh CI it does not exist, `--check` says so and compares nothing.

## Adding a capture

1. Copy `NAME.glb` (and `NAME.json`) into `apps/web/public/hero/captures/`.
2. Add an entry to `scripts/hero-assets/config.json`: `name`, `role` (`stage` or `characters`), `priority`, and **`delta: true`**: only the base (`S0`, `base` field) can ship as a full file; the pipeline refuses a second entry without `delta` (a delta is computed against a single base). A delta is only worthwhile if the capture resembles `S0`: check the size in `report.json`.
3. `bun run hero:assets --update-budget`, review `budget.json`, then `bun run hero:check`.
4. On the film side: add the name to `STAGE_NAMES` in `scene.js` if it is a stage; the loader reads the manifest, nothing else to wire.
5. Any new capture still requires the visual validation of `docs/concepts/development-workflow.md` (Minecraft or Blender): tests do not replace it.

## Server

Findings on the current production (29 October 2026, `curl -I`): `nginx/1.31.8` responds **without `Cache-Control`** (neither on `/assets/*.js` nor on `/hero/…`), **without `X-Robots-Tag`**, with `ETag`/`Last-Modified` and the `application/octet-stream` type for `.glb` files, in gzip even when the client accepts brotli, and **responds 200 for non-existent paths** (`/hero/captures-opt/manifest.json` before deployment). `deploy/nginx.web.conf` responds 404 for a missing file and sets `Cache-Control` and `X-Robots-Tag` with `always`: this file is **therefore not applied** by this deployment. Likely cause: the site is deployed as a "static site" by Coolify, whose default nginx serves `apps/web/dist` without the repository's file; `coolify-railpack.md` asks to apply it "or its locations in the existing Nginx", which is a manual step in Coolify, probably never done. Nothing was changed on the Coolify side; to do: paste the configuration from `deploy/nginx.web.conf` into the application's custom nginx configuration, or build an image with this file. Without that, captures are gzipped on the fly, with no durable caching.

What the repository configuration now does:

- `/hero/captures-opt/*.glb` and `*.patch`: `Cache-Control: public, max-age=31536000, immutable`, fixed MIME type (`model/gltf-binary`, `application/octet-stream` for deltas), `X-Robots-Tag` repeated (a location `add_header` replaces the server's).
- `/hero/captures-opt/manifest.json`: `Cache-Control: no-cache` (ETag revalidation), **never immutable**: the folder is emptied on every build, so a manifest cached for a day would point to deleted hashes and every returning visitor would get the full GLBs.
- `/hero/` (unhashed): one day + `stale-while-revalidate`, unchanged.
- `gzip_static on` (standard nginx module: serves the precomputed `.gz`), `gzip_vary on`, `gzip_types` (including `model/gltf-binary` and `application/octet-stream`, for on-the-fly compression of files without a `.gz`). These directives are **inside `server {}`**, not at the `http` level: if the host nginx already enables `gzip` in its `nginx.conf`, a second declaration at the same level makes `nginx -t` fail ("\"gzip\" directive is duplicate"). The immutable cache rules only target `\.[0-9a-f]{10}\.(glb|patch)$` (regex in quotes: otherwise the braces are nginx syntax).
- `brotli_static on` is **commented out**: it requires the `ngx_brotli` module, absent from the standard nginx image; without the module, nginx refuses to start on an unknown directive. The `.br` files produced (321 KB instead of 375 KB for the captures) are only useful with that module or behind a CDN that reads `.br` files.
- This configuration has not been run in a real nginx (no nginx binary or image on this machine, and no image was downloaded): run `nginx -t` on first deployment, including with a host `nginx.conf` that already enables gzip.

## Measured results

Measurements of 29 October 2026 on this machine (Chromium 153, real GPU `--use-angle=gl`, `apps/web/dist` served locally against the live landing `https://minemories.xenos.lightin.io/`). "Bytes on the wire" come from CDP (`encodedDataLength`). Two columns for the candidate: **on-the-fly gzip** (what current production would do with these files: standard nginx without the brotli module) and **precompressed brotli** (with `brotli_static`, or a CDN that serves the `.br` files). Do not read the brotli figure as the production result until the server has changed.

| Bytes on the wire (GLB captures of `/`, 1440 px) | Live landing | Candidate, on-the-fly gzip | Candidate, precompressed brotli |
|---|---|---|---|
| `S0` (first frame) | 217,045 | 169,232 | **138,325** |
| `S1` to `S4` | 829,812 (gzip, 4 full GLBs) | 210,651 (4 deltas) | **183,590** (4 deltas) |
| Total GLB + deltas | 1,046,857 | **379,883** (-63.7%) | **321,915** (-69.2%) |
| Manifest (`manifest.json`) | n/a | 752 | 752 |
| Whole `/` page, 390 px | 1,940,891 | 1,201,838 (-38%) | 1,143,870 (-41%) |
| Whole `/` page, 1440 px | 2,113,818 | 1,374,538 (-35%) | 1,316,570 (-38%) |

The page total still includes ~0.75 MB of JavaScript, fonts and images that this pipeline does not touch.

Timings (the benchmark's shared harness, 2 repetitions, median; shared machine, so indicative): film ready (`readyAt`) at 390 px, CPU x4, slow 4G: **9.4 s -> 8.6 to 8.8 s**; at 1440 px without throttling: **2.28 s -> 1.85 to 1.93 s**. LCP is unchanged (the poster does not change).

If the production server stays on gzip, the real gain is **-64% on the captures**; it rises to -69% with brotli.

Rebuilt bytes (`bun run hero:assets`, without transport compression): `S0` 1,334,540 -> 1,027,996 bytes (rebuild alone), `S1`..`S4` and `characters` as deltas of 31 to 134 KB raw. Per-capture details in `report.json`. Current budget: see `budget.json` (S0 138,060; deltas 182,460; S0..S4 320,520 in brotli).

### Visual identity (log)

A single Chromium launch, fixed random seed, `?autoplay=0&q=high`, clock driven by `window.__hero.goto(t)`, canvas only (interface hidden), the live landing and the candidate in the same launch, 390 and 1440 px. Instants: 10.6 / 30.8 / 51.8 s (canonical) and 21 others covering the five stages (landing map: S0 1-31 s, S1 32-33, S2 34-35, S3 36, S4 37-43, S2 44, S0 45-58), i.e. 24 instants per width. The candidate's request logs prove that the "delta" path was actually used (one `S0.<hash>.glb`, four `.patch`, **no** request to `/hero/captures/S0..S4.glb`): without that, 0 px would prove nothing, since the raw GLBs are the landing's.

| Width | Canonical instants | 24 instants | Pixels off by more than one level | Displayed stages identical |
|---|---|---|---|---|
| 390 px | **0 px** | 4 px (0.7 s: 2; 1.1 s: 1; 36 s: 1), 1 channel level | 0 | yes (S0 to S4) |
| 1440 px | **0 px** | 12 px (1.1 s: 9; 36 s: 2; 44 s: 1), 1 channel level | 0 | yes (S0 to S4) |

Second pass after the review fixes (same method, one launch): canonical 0 px at both widths, 24 instants 4 px (390) and 7 px (1440), no difference > 1 level, `window.__hero.captureFallbacks` = `{ count: 0 }` and the same requests (1 hashed base, 4 deltas, 0 raw GLB), including the 36 s instant at 390 px (stage S3). The rare non-zero pixels are one-channel-level GPU rendering noise, at the same instants as those found when comparing a landing with itself (`three-diet` track, `fidelity.md`). The comparison script (`identity.cjs`, derived from the track's `mega-fid.cjs` and `stages.cjs`) depends on local paths (the portfolio's Playwright, cached Chromium) and is not in the repository.

## Limits and caveats

- **`KHR_meshopt_compression`**: version 1 streams require `GLTFLoader` to accept this name. three 0.186 does (checked on every generation by `assertThreeAcceptsKhrMeshopt`, which fails if an upgrade removes either name); another reader of these files (external tool, meshopt decoder older than 0.23) might refuse them. The raw captures stay on `EXT_`.
- **Delta against `S0`**: a stage cannot load on its own (it needs `S0`, always loaded first); any failure falls back to the full GLB.
- **JPEG posters** (197, 120 and 47 KB) are not recompressed.
- **Identity**: the pixel comparison is done in Chromium with a real GPU (see the log above); a one-channel-level difference on a few pixels at 1440 px is GPU rendering noise, also present between two loads of the same page. Safari and Firefox were not tested.
- Timing measurements are indicative (shared machine).
