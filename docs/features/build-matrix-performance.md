# Specification: fast, reproducible multi-version build

Status: **proposal** (28 October 2026), phase 0 (measurements) done. The rest is not implemented. JAR building has since moved from GitHub Actions to the local `bun mod` tool ([automatic-releases.md](automatic-releases.md)): CI now only compiles each cell, and the passages of this document about GitHub release scripts are historical notes. Tracked tasks live in GitHub Issues; this file holds the architecture decision and the acceptance criteria.

## 1. Problem

The target is a **Minecraft versions × loaders** matrix (NeoForge, Fabric, Forge, plus older versions such as 1.20.1). Today:

- Only one version is in the main build (`mod/1.21.1`, 1.21.1). 1.20.1 lives in a second build (`mod/1.20.1`) that **copies, then regex-edits** the shared sources (`adapt.gradle`). Each new version would add a build, a copy and a batch of regexes to maintain.
- CI rebuilds every target cold: `setup-java` with `cache: gradle` only saves `~/.gradle/caches`, and the machine's Gradle is restarted without a daemon (`org.gradle.daemon=false`).
- The old per-cell build script ran `clean :core:check :common:check` in **every** cell of the matrix, so the same tests and analyses are repeated N times.

The Java code is small (about 14,000 lines for `common`). The dominant cost is therefore not `javac`: phase 0 (section 4) confirms that cold starts are dominated by Minecraft preparation and dependency resolution, not by compilation tasks.

## 2. Architecture decisions

### D1. A single source tree, multiple versions through Stonecutter
Replace `adapt.gradle` (fragile regexes, file copies) with **Stonecutter** (comment-based preprocessor, `//? if >=1.21`), which expresses version differences in the source itself, compilable and reviewable. A build fails if a block does not compile, instead of silently failing to match.

- *Broad* API differences stay behind `ClientPlatform` (already in place). Stonecutter is only for *local* differences (signature, import, renamed method).
- A single root Gradle, one subproject per Minecraft version, one adapter per loader in each.
- Rejected alternatives: one repository or folder per version (guaranteed drift); Architectury multi-module alone (does not address API differences between Minecraft versions).

### D2. A single source of truth for the matrix
`mod/targets.json` stays the source. Gradle (`settings.gradle`) and CI derive their lists from it; no Minecraft or loader version number is duplicated in a `build.gradle`. The `gradle/libs.versions.toml` catalog only holds tool and library versions.

### D3. Compile once what does not depend on Minecraft
- `:core` has no Minecraft dependency: it is compiled **once** with `--release 17` (lowest common denominator), then reused by every cell. This removes `Math.clamp`/`getLast` from the shared code or isolates them behind a common utility.
- `:core:check` (JUnit, JaCoCo, SpotBugs) runs in **a single job**, not in every cell.
- Spotless/format: a single job.

### D4. Three-layer caching
| Layer | Content | Where | Written by |
| --- | --- | --- | --- |
| Local | daemon, build cache, config cache | developer machine | the developer |
| Remote | Gradle task outputs (decompiled and remapped Minecraft, compiled classes) | **private Gradle cache node** (container on the existing infrastructure) | `main` and a nightly job only |
| CI | Maven dependencies, wrapper | `setup-gradle` | `main` |

The remote cache is **read-only** for PRs and forks. The Actions cache alone is not enough: its per-repository limit (10 GB) and its eviction after inactivity cannot hold dozens of decompiled targets.

### D5. Legal and security constraints
- Decompiled sources, remapped jars and images containing Minecraft are **never published**: private, authenticated remote cache, no prefilled public Docker image, no CI artifact containing anything other than the mod.
- The remote cache is never writable from a PR coming from a fork (poisoning risk). Release JARs are verified by the manifest fingerprint (`bun mod build`) and rebuilt **without reading the remote cache** during a release (`--no-build-cache`): the cache speeds things up, it is not authoritative.
- Gradle wrapper verification and `dependency-verification` (`gradle/verification-metadata.xml`) to pin plugins.

### D6. Tiered pipeline
| Trigger | Content | Goal |
| --- | --- | --- |
| PR | Quality (D3) + cells **touched** by the diff + one reference cell per loader | fast feedback |
| `main` | Quality + **the whole matrix** (`assemble`, without re-testing `core`) | warm cache, breakage detection |
| Nightly | Full cold matrix against the cache | feeds and validates the cache |
| Release | Full matrix, `--no-build-cache`, checksums, manifests | reproducible and authoritative |

Diff-based selection: a change limited to `apps/**`, `docs/**` or `packages/**` runs no Java cell; `core/**` and `common/**` run the whole matrix; an adapter folder only runs its own cells.

### D7. Rust: rejected
The load is downloading, decompiling and IO performed by the Minecraft plugins of the Gradle ecosystem, outside our control. Rewriting in Rust speeds up no measurable step and leaves the mod toolchain ecosystem. To be reconsidered only if profiling shows a dominant in-house tool (for example packaging in `scripts/`).

## 3. Requirements

1. Adding a Minecraft version or a loader = **one entry in `mod-targets.json`** + the necessary Stonecutter blocks + in-game validation. No project copy.
2. The release build is reproducible: same inputs, same bytes, whatever the cache state (archives without timestamps, fixed file order).
3. No regression of the repository's guardrails: JaCoCo 90/60 on `:core`, SpotBugs without `ignoreFailures`, `-Werror -Xlint:all` on `:core`, checksum verification of artifacts. Thresholds are not lowered.
4. A rendering or GLB change still requires visual in-game validation. Compilation CI does not count as validation (`validatedInGame` unchanged).
5. Timings are measured and published on every run (`--scan` or a `--profile` summary); otherwise the optimization cannot be verified.

## 4. Implementation plan

Each phase can ship on its own and leaves CI green. Each phase maps to an issue.

### Phase 0: measure (prerequisite)
- Record on the reference machine and in CI: cold build, warm with no change, warm with a change in `common`, per target. Use `--profile` and `--scan`.
- Isolate the time spent in: dependency resolution, Minecraft preparation (decompilation/remapping), compilation, `check`, packaging.
- **Output**: the table below. Phase 5 budgets are set from it.

**Results (28 October 2026, phase 0 done).** Local machine with 12 cores, 31 GB, JDK 21, Gradle 9.8.2 with the current configuration (`daemon=false`, no parallelism or configuration cache). Command: `:<loader>:build` (includes `check`, so Spotless, SpotBugs and, for 1.21.1, the tests). Cold = empty `GRADLE_USER_HOME` (wrapper, plugins and Minecraft downloaded again) and empty build folder. A single sample per cell: these are orders of magnitude, not averages.

| Target | Cold (wall) | of which Gradle tasks | Outside tasks | Warm, nothing changes | Warm, `common` modified |
| --- | --- | --- | --- | --- | --- |
| NeoForge 1.21.1 | 4 min 31 s | 103 s | ≈ 168 s | 6 s | 10 s |
| Fabric 1.21.1 | 3 min 05 s | 57 s | ≈ 128 s | 6 s | 12 s |
| Forge 1.21.1 | 2 min 57 s | 54 s | ≈ 123 s | 6 s | 12 s |
| Fabric 1.20.1 | 2 min 30 s | 13 s | ≈ 137 s | 6 s | 11 s |
| Forge 1.20.1 | 2 min 11 s | 13 s | ≈ 118 s | 5 s | 9 s |

"Outside tasks" is the difference between wall time and the sum of task durations: downloading the wrapper and plugins, dependency resolution, JVM startup, and Minecraft preparation done during configuration. I did not break this block down further; it depends on the network.

Most expensive tasks when cold: `:neoforge:createMinecraftArtifacts` 84 s; `remapJar` 21 s (Fabric) and 21 s (Forge); `spotbugsMain` 19–20 s (Fabric, Forge) and 8 s (NeoForge); `common:compileJava` 6–7 s; adapter `javac` 2–4 s (10 s for 1.20.1, which also compile the adapted shared sources).

Conclusions useful for what follows:
1. **60 to 90% of cold time is not compilation.** The remote cache and caching the preparation work (phase 3) are the main lever; phase 1 (Gradle settings) does not touch it.
2. **When warm, the fixed cost is about 6 s with no work at all** (JVM startup and configuration, since the daemon is disabled). The configuration cache and the local daemon (phase 1) target exactly this.
3. **SpotBugs costs 19–20 s cold per Fabric/Forge cell**, and it is redone in every cell even though `common` is identical: an argument for phase 2.
4. **An extra loader costs 2 to 3 minutes cold, but about 10 s warm.** A matrix of N targets therefore costs N × ≈ 2.5 min without a cache, and very little with a shared cache: the main argument for phase 3.
5. The 1.20.1 builds run neither tests nor SpotBugs; their times are not directly comparable with 1.21.1.

Limits: one machine, one sample, variable network, no CI measurement (4-core runners, no daemon). To be redone on a GitHub runner before setting the phase 5 budgets.

### Phase 1: Gradle settings (low risk)
- `org.gradle.parallel=true`, `org.gradle.configuration-cache=true` (to be disabled per incompatible plugin, with a reason), `org.gradle.daemon=true` locally and `-Dorg.gradle.daemon=false` in CI, memory raised if phase 0 justifies it.
- **Acceptance**: a warm build with no change is dominated by configuration cost; no task runs again without an input change.

**Phase 1 done (28 October 2026).** `mod/1.21.1/gradle.properties` (and the 1.20.1 copy): `org.gradle.parallel=true`, `org.gradle.configuration-cache=true`, and `org.gradle.daemon=false` removed (the daemon is active locally). `scripts/gradle.mjs` adds `-Dorg.gradle.daemon=false --no-configuration-cache` when `CI` is set: runners are disposable, so both mechanisms only add cost there. `-Xmx3G` is unchanged: phase 0 showed no memory issue. The configuration cache is stored without errors with all three plugins (ModDevGradle, Architectury Loom Fabric and Forge).

Measurement: `./gradlew build` on the three 1.21.1 loaders (user Gradle cache already warm, same machine, a single sample):

| Scenario | Before (daemon off, sequential) | After |
| --- | --- | --- |
| Nothing changes | 20.6 s | 7.6 s the first time (storing), **0.6 s** afterwards |
| `common` modified | 25–27 s | 19–20 s |

The gain is mostly local: a rebuild with no change goes from 20 s to 0.6 s, and a change in `common` saves about 25%. Parallelism limits that last gain because `common` and the three adapters form a dependency chain. **No effect expected on cold starts** (downloading and preparing Minecraft): I did not re-measure it, since none of these settings acts on it. In CI, nothing changes until phases 2 and 3 are done.

### Phase 2: take the common code out of the matrix
- `:core` with `--release 17`, built once, consumed by the cells.
- Split the tasks: a global `check` (one job) and `assemble`/`build` per cell. Adapt the per-cell build (no more `:core:check` or `:common:check` per cell; they stay in the quality job, with a check that this job succeeded for the same revision).
- **Acceptance**: a cell runs neither JaCoCo nor SpotBugs for `core`; the published coverage is identical.

**Phase 2 done (28 October 2026).**
- `:core` compiles with `options.release = 17` (class version 61). No Java 21 API call was present; `:core`'s `check` passes, coverage included.
- The old per-cell build script exposed `releaseGradleTasks`. When `RELEASE_SHARED_CHECKS_DONE=true`, a cell runs `clean :<loader>:check :<loader>:build` without `:core:check` or `:common:check`. The workflow only set this variable on the `workflow_run` event: it is the only path that proves *Quality gates* succeeded for this exact commit (`head_sha == github.sha`). A manual run (`workflow_dispatch`) keeps the full check.
- This script and its tests were removed along with the GitHub chain; the current check matrix is `node scripts/mod/cli.mjs ci`.

Measurement: a warm Fabric cell with `--no-build-cache` goes from 26–27 s to 12.6–12.8 s (about 14 s saved per cell: `core` and `common` tests, JaCoCo, SpotBugs). When cold, SpotBugs on `core`/`common` added more, but I did not isolate it. Limit: each CI job still recompiles `:core` (about 1 s). Sharing it between jobs would require an intermediate artifact; the phase 3 remote cache will do it more simply, so I did not add it here.

**Tool updates (28 October 2026).** Survey of the latest published versions (Gradle 9.8.2, Spotless 8.10.4, ModDevGradle 2.0.148, Architectury Loom 1.17.493, SpotBugs 4.10.5 and plugin 6.5.13, JUnit 6.1.3 were already up to date, via Renovate). Bumped: JaCoCo 0.8.15 → 0.8.16 and test Gson 2.14.0 → 2.15.0. **Not bumped**: google-java-format 1.37.0 is published but Spotless 8.10.4 (latest) fails on it, under JDK 21 as well as JDK 25; it stays at 1.36.0 until a compatible Spotless version ships. Java: the latest LTS is 25 (Temurin 25.0.5); Gradle runs on it (CI already does), but the mod is still compiled for Java 21 because Minecraft 1.21.1 requires it. `build` and `check` pass under Gradle/JDK 25 and under Gradle/JDK 21.

**Phase 1 fix.** The configuration cache broke Fabric's and Forge's `processResources` as soon as they actually ran, because the closure read `project.version` at execution time. My measurements had not revealed it: these tasks were up to date or restored from the build cache. The version is now captured at configuration time, as in NeoForge; verified with `clean build --no-build-cache`, twice in a row (configuration reused).

**Trial on the latest version (28 October 2026, throwaway, outside the repository).** Latest Minecraft version: **26.3** (15 September 2026), with NeoForge 26.3.0.99, Fabric Loader 0.20.1 + Fabric API 0.165.0+26.3 and Forge 26.3-66.1.0. All three toolchains prepare Minecraft 26.3 correctly (NeoForge: ModDevGradle 2.0.148, 89 s; Fabric: `net.fabricmc.fabric-loom` 1.19.3, 21 s; Forge: ForgeGradle 7.0.40, 2 min), but **the current code compiles on none of them**: 201 errors on NeoForge and 309 on Fabric (the Forge total was not recorded), most of them in `common`. Main causes: `GuiGraphics`, `ResourceLocation`, `RenderType`/`VertexFormat`/`RenderStateShard`, `BakedQuad`, `GlStateManager` and LWJGL access have changed or disappeared; `getMinBuildHeight`/`getMaxBuildHeight`, `setScreen` and `displayClientMessage` changed shape; `ModelData` and `FluidSpriteCache` (NeoForge) moved; Fabric's key binding API changed package. Consequences for the architecture:
1. **This is an API port, not a build problem.** The rendered capture (`RenderedModelCapture`, `RenderedVertexConsumer`, OpenGL states) is the riskiest part and requires visual in-game validation.
2. **26.x is no longer obfuscated** and requires Java 25. Architectury Loom (`loom-remap` 1.17.493) no longer fits: Fabric moves to `fabric-loom` 1.19, Forge to ForgeGradle 7. The `:common` module therefore cannot remain a single Loom project for every version. This argues for decision D1 (Stonecutter) with one `common` per Minecraft generation.
3. **The matrix's Java toolchain becomes heterogeneous** (21 for 1.20/1.21, 25 for 26.x): to be planned in `mod-targets.json` (`java` field, already present) and in the caches.

### Phase 3: shared Gradle cache
- `gradle/actions/setup-gradle` in CI (writes only on `main`).
- Private, authenticated cache node (D4/D5); `buildCache { remote(HttpBuildCache) }` configuration with `push` conditioned on CI on `main`.
- A nightly job that feeds the cache and alerts if it diverges from a cold rebuild.
- **Acceptance**: a PR that does not touch Minecraft decompiles nothing; a test proves the remote cache is never written from a PR.

### Phase 4: migration to Stonecutter
- Introduce Stonecutter with 1.21.1 as the reference, without any behavior change: the three JARs of the current version must have equivalent classes (comparing class fingerprints or content).
- Migrate 1.20.1: convert each `adapt.gradle` rule into a conditional block, delete `mod/1.20.1/adapt.gradle` and the separate build.
- Generate the projects from `mod-targets.json` (D2).
- **Acceptance**: a single `./gradlew` builds the whole matrix; `adapt.gradle` deleted; the 1.20.1 JARs pass the already documented in-game validations.
- **Main risk**: Stonecutter compatibility with each of the three plugins (ModDevGradle, Architectury Loom for Fabric and Forge). **Half-day spike at the start of the phase** to confirm, on a throwaway branch, that one cell per loader compiles; otherwise fall back to one Gradle project per version with a tested source sync script.

### Phase 5: tiered pipeline
- Diff-based matrix computation (D6) in `scripts/ci-scope.mjs` or a neighboring script, with tests (`node:test`) for each path rule.
- CI time budgets: a warning (not a failure) when a cell exceeds the budget set in phase 0.
- **Acceptance**: a documentation PR runs no Java job; a PR that changes an adapter only runs its own cells.

### Phase 6: hardening
- `dependency-verification`, wrapper verification, reproducible archives, reproducibility test (two builds, same bytes).
- Documentation: update [loader-support.md](loader-support.md), [automatic-releases.md](automatic-releases.md) and [development-workflow.md](../concepts/development-workflow.md).

## 5. Order and dependencies

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 ─┐
                       └──── Phase 4 ───┴→ Phase 5 → Phase 6
```
Phases 3 and 4 are independent once phase 2 is done. Phase 4 is the riskiest and the most rewarding in the long run: it stops maintenance cost from growing with the number of versions.

## 6. Out of scope
- Automating in-game validation (AGENTS.md requires it to be manual for any new target).
- Changing loaders or mappings (official Mojang mappings stay).
- Separate Quilt support (reuses the Fabric JAR).

## 7. Open questions
1. Which Minecraft versions exactly, and how far back? This sets the matrix size and the minimum Java version (17 for 1.20.1, 21 for 1.21.x).
2. Where to host the cache node (is the existing infrastructure suitable, with what disk capacity)?
3. Acceptable CI budget for the full nightly job.
