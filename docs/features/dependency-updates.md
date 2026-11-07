# Dependency updates and lookups

Renovate uses `renovate.json`. Bun dependencies, Gradle tooling, CI actions and images keep the recommended preset. PR #113 updates the Architectury Loom remapping tool from 1.17.487 to 1.17.493; this change is not native validation of a new loader.

The four lookup failures reported in #4 came from runtime dependencies resolved as if they all lived on Maven Central:

- `com.mojang:minecraft` now uses the official Mojang manifest, turned into stable release versions by the Renovate custom datasource.
- Fabric Loader and Fabric API explicitly use `https://maven.fabricmc.net/`.
- Forge explicitly uses `https://maven.minecraftforge.net/`.

Runtime versions are constrained to the matrix actually validated in `mod/targets.json`. They are still looked up: no dependency is ignored and warnings are not hidden. Changing Minecraft, Fabric Loader/API or Forge requires an explicit change to the matrix, the matching constraints and the in-game scenarios before claiming the new compatibility. Build tools remain eligible for ordinary Renovate updates.

`dependencyDashboardAutoclose` lets the bot close its dashboard when no updates remain. The dashboard must not be closed manually to hide a lookup error; the next hosted run must confirm the warnings are gone.

## Local validation

The official validator `renovate-config-validator --strict renovate.json` and an official Renovate run with `--platform=local --dry-run=lookup` check extraction from the real Gradle files and the lookups, without writing to GitHub or changing dependencies. Renovate 44.164.10 expects Node 24; Node 26 can perform the lookups but returns an environment error, so it does not count as a successful run. Use Node 24.15+ for this validation.

Private validation logs are not committed. The hosted run, the remapping CI and the repository tests complete this check; a new JAR version is not announced as validated in game on this basis alone.

References: [custom datasources](https://docs.renovatebot.com/modules/datasource/custom/), [Maven](https://docs.renovatebot.com/modules/datasource/maven/), [dashboard autoclose](https://docs.renovatebot.com/configuration-options/#dependencydashboardautoclose).
