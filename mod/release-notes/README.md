# Mod release notes

One file per mod release, named after the version without the `mod-v` prefix: the tag `mod-v0.36.1-beta.1` reads `0.36.1-beta.1.md`. These notes are what players see in the Discord `#changelog` release card and in the "Latest mod version" card on `/roadmap`. Without a file, both fall back to the subjects of the commits touching `mod/` since the previous tag, which are often terse or not in English.

## Format

One note per line, in English, written for players:

```markdown
- New: what a player can now do. (#123)
- Fixed: what no longer goes wrong.
- Changed: what works differently.
```

- `New` becomes a feature, `Fixed` a fix, `Changed` anything else. The marker is case insensitive.
- A trailing `(#123)` links the pull request. It is optional and only counts at the very end of the line; parentheses inside the text stay as written.
- Every other line (headings, blank lines, comments, other bullets) is ignored. A file without any note counts as missing.
- Notes keep the order of the file. Put the most important first.
- At most 12 notes are shown; the rest is counted as "+N more".
- A pull request that adds or edits a notes file runs the Discord tests (not the Gradle build); they fail when a file holds no note.

The same rules are implemented in `scripts/discord/release-info.mjs` and `apps/api/src/mod-release.ts`, and both test suites check them against `scripts/discord/fixtures/curated-notes.json`.

## When to add it

Every mod release adds its file. Both readers fetch it from the default branch on GitHub (`https://raw.githubusercontent.com/For-Hives/minemories/main/mod/release-notes/<version>.md`), so:

1. Merge the file into `main` **a few minutes before pushing the tag**. GitHub's raw files are cached for about five minutes, a missing file included, so a file merged right before the tag may not be seen yet.
2. If the file lands after the tag, the site picks it up within about fifteen minutes (its own ten-minute cache plus GitHub's). The Discord card already posted keeps the commit notes; post a corrected card by hand with `node scripts/discord/cli.mjs changelog release --tag mod-v<version>` (it posts a second message).

To preview a card from a local file before merging: `node scripts/discord/cli.mjs changelog release --tag mod-v<version> --notes-dir mod/release-notes --dry-run`.
