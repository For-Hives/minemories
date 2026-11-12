# Discord sync: changelog and roadmap

The GitHub workflow `.github/workflows/discord.yml` posts to the project's Discord server through two webhooks (#changelog and #roadmap). It is the **owner's explicit exception** (Andy, 7 November 2026) to the rule "CI publishes nothing": it only posts public information about the repository (commit subjects, release notes, roadmap issues) and never builds, tags or uploads anything. The scripts live in `scripts/discord/` (Node ESM, no dependencies) and are covered by `node --test scripts/discord/*.test.mjs`, which also runs in `bun run scripts:test` and in the `discord` gate of `quality.yml` (Biome plus these tests, for any change to `scripts/discord/`, `scripts/mod/notify.mjs`, `discord.yml` or `mod/release-notes/`; a change to the shared notes fixture `scripts/discord/fixtures/` also runs the API gate).

## What is posted where

Two channels, one webhook each:

- **#changelog** receives what changed: commits pushed to `main`, and one release card per mod release.
- **#roadmap** holds a single message, edited in place, that only tracks issues: In progress and Planned.

| Trigger | Channel | Message |
| --- | --- | --- |
| Push to `main` | #changelog | One embed "main updated: N changes" linking to the compare view, with the commit subjects grouped into Features (`feat`), Fixes (`fix`), Performance (`perf`), Documentation (`docs`) and Other. `(#123)` becomes a link to the pull request. `chore(release)` commits, commits carrying the skip-ci marker and merge commits are dropped; nothing is posted when nothing is left, nor for a new branch or a force push. The footer shows the short SHA. |
| Push of a `mod-v*` tag | #changelog | The release card "Minemories mod X" (see [Mod release card](#mod-release-card)). |
| Issue opened, edited, closed, reopened, labelled, unlabelled or deleted (only when it carries, or just lost, the `roadmap` label), every day at 06:00 UTC, manual run | #roadmap | A single message, edited in place, with two embeds: In progress (N) and Planned (N). |

The changelog job posts to `#changelog` through the `DISCORD_CHANGELOG_WEBHOOK_URL` secret, and the roadmap job edits its single message in `#roadmap` through `DISCORD_WEBHOOK_URL`. Nobody posts by hand in `#roadmap`. Each secret may hold the full webhook URL, `<id>/<token>` or only the token: the workflow sets the matching webhook id (not a secret) next to it. Tag pushes no longer touch the roadmap message.

## How the roadmap works

The source of truth is the GitHub issues of `For-Hives/minemories` that carry the **`roadmap`** label (pull requests are ignored). The site's `GET /api/roadmap` uses exactly the same rules:

- **In progress**: open issue that also has the **`in-progress`** label;
- **Planned**: any other open roadmap issue;
- **Done**: roadmap issue closed as completed (or without a reason) during the last 30 days. Issues closed as "not planned" or "duplicate" never appear.

Discord only shows **In progress** and **Planned**. The Done column is still computed (and still shown on the site's `/roadmap` for now; its removal there is tracked in issue #243), but the Discord message no longer includes it.

## Mod release card

Posted to #changelog when a `mod-v*` tag is pushed. The site's "Latest mod version" card on `/roadmap` shows the same data (the `latestRelease` field of `GET /api/roadmap`, built by `apps/api/src/mod-release.ts`). The Discord side reads it from the public GitHub API in `scripts/discord/release-info.mjs`:

- **Version**: the pushed tag, among the `mod-v*` tags (`mod-vX.Y.Z` or `mod-vX.Y.Z-beta.N`, at most three pages of 100 tags) sorted by semver with a release above its betas (`0.36.1` > `0.36.1-beta.3` > `0.36.1-beta.1` > `0.36.0`). Its previous release is the next older tag. A beta is marked as such. The site uses the newest tag.
- **Date**: the committer date of the tag's commit, shown as a Discord date (`<t:…:D>`, in each reader's locale).
- **Notes**, curated first: the English file `mod/release-notes/<version>.md` read from the default branch (`https://raw.githubusercontent.com/For-Hives/minemories/main/mod/release-notes/<version>.md`). Its format (`- New: …`, `- Fixed: …`, `- Changed: …`, optional trailing `(#123)`, the file's order kept) is described in [`mod/release-notes/README.md`](../../mod/release-notes/README.md). `latestRelease.source` says `curated`.
- **Fallback notes**, when that file is missing (404) or holds no note, or when reading it fails (logged without secrets: a warning on Discord, the `release_notes_unavailable` event in the API): the commits touching `mod/` reachable from the tag and strictly newer than the previous tag's commit (that commit excluded). `chore(release)` commits, commits carrying the skip-ci marker and merge commits are dropped. Each note is the first line of the subject without its Conventional Commit prefix, marked New (`feat`), Fixed (`fix`) or Changed (everything else), features first, then fixes, then the rest; `(#123)` becomes a link to the pull request. Without a previous tag, the 12 newest `mod/` commits. `latestRelease.source` says `commits` (also the default for older API bodies).
- At most 12 notes, the rest counted in "+N more". Notes that would not fit Discord's description limit are counted there too.
- **Links**: Download (`/downloads`), All changes (`/versions`, which absorbed the former `/changelog`) and Compare (the GitHub compare view between the two tags, or the tag's tree when there is no previous tag).

The card is posted best effort: when GitHub fails or does not list the tag, the job logs a warning, posts nothing and stays green. To post (or repost) a card by hand, for example after adding a notes file late:

```bash
node scripts/discord/cli.mjs changelog release --tag mod-v0.36.1-beta.1
```

It needs `DISCORD_WEBHOOK_URL` set to the #changelog webhook. When that value only holds the webhook token, also set `DISCORD_WEBHOOK_ID=1568717896820199455` (the workflow sets it, a local shell does not). Before the notes file is merged, add `--notes-dir mod/release-notes`, otherwise the card falls back to the commit notes. Each run posts a new message.

## Columns

In progress and Planned are sorted by last update, newest first (ties: highest issue number first). Each column shows at most 25 issues and a "+N more" line for the rest. Each line is `#123 title — areas`, linking to the issue, where the areas are the labels among `mod`, `api`, `front` and `socials` (community and videos). When the two columns together exceed Discord's 6000-character limit, the longest column loses lines (counted in its "+N more") until the message fits.

To put something on the roadmap: add the `roadmap` label to the issue. To mark it as being worked on: add `in-progress`. Closing it removes it from the Discord message.

## Safety

- Every payload sets `allowed_mentions: { parse: [] }`: nobody is ever pinged. `@everyone` and `@here` are also broken with a zero-width space.
- Issue titles and commit subjects are escaped for Discord markdown (no injected links, formatting or mentions) and clipped. Discord limits are enforced: title 256, description 4096, 10 embeds, 6000 characters per message.
- The webhook URL is never printed: every error goes through the same redaction as `scripts/mod/notify.mjs`.
- Deliveries retry on 429 (Discord's `retry_after`, capped at 30 s) and on 5xx or network errors (4 attempts in total); a 4xx is not retried.
- Changelog posts are best effort: a Discord failure is logged as a warning and the job stays green. The roadmap job fails when GitHub or Discord fails, so a stale roadmap is visible in the Actions tab.
- Without the secret, every job exits successfully with a notice and sends nothing. Pull requests never trigger this workflow; their tests run in `quality.yml`.
- Release notes (curated lines or commit subjects) are escaped and clipped like issue titles. The version comes only from tags matching `mod-vX.Y.Z(-beta.N)`, so the notes file path cannot be steered. Nothing is sent to `raw.githubusercontent.com` but a plain GET without token.
- The `issues` trigger runs with the webhook secret for any edit of a roadmap issue. Issue titles only reach the Node script through the GitHub API, never a shell line, and are escaped before posting.

## One-time setup

1. In Discord, create a webhook on the target channel (Server settings → Integrations → Webhooks) and copy its URL.
2. Store the `#roadmap` webhook as the repository secret `DISCORD_WEBHOOK_URL` and the `#changelog` webhook as `DISCORD_CHANGELOG_WEBHOOK_URL` (Settings → Secrets and variables → Actions, or `gh secret set <name>`). Never paste them in an issue, a commit or a log.
3. Create the labels `roadmap`, `in-progress` and `socials` if they do not exist (the areas `mod`, `api`, `front` already do).
4. Run the workflow manually once (Actions → Discord sync → Run workflow). Without a stored message id, the roadmap job posts a new message and prints **only its id** in the log. Issue events and the daily run do nothing until the id is stored, so they cannot pile up messages.
5. Store that id as the repository **variable** `DISCORD_ROADMAP_MESSAGE_ID`. From then on, every run edits that message.

If someone deletes the roadmap message, automatic runs get a 404 and **fail on purpose** without posting anything. Run the workflow manually: it posts a new message, prints its id and fails too; update `DISCORD_ROADMAP_MESSAGE_ID` with the printed id. Manual runs only post from the default branch.

## Running it locally

```bash
node scripts/discord/cli.mjs changelog push --before <sha> --after <sha> --dry-run
node scripts/discord/cli.mjs changelog release --tag mod-v0.36.1-beta.1 --dry-run
node scripts/discord/cli.mjs changelog release --tag mod-v0.36.1-beta.1 --notes-dir mod/release-notes --dry-run
node scripts/discord/cli.mjs roadmap --dry-run
```

`--dry-run` prints the JSON payload instead of sending it. Without `--dry-run` the commands need `DISCORD_WEBHOOK_URL` (and, for the roadmap, `DISCORD_ROADMAP_MESSAGE_ID`); `GITHUB_TOKEN` is optional and only raises the GitHub API rate limit. `--notes-dir <dir>` (or the `DISCORD_RELEASE_NOTES_DIR` environment variable) reads the curated notes from a local folder instead of the default branch, to preview a notes file before it is merged.
