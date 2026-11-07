# Discord sync: changelog and roadmap

The GitHub workflow `.github/workflows/discord.yml` posts to the project's Discord server through one webhook. It is the **owner's explicit exception** (Andy, 7 November 2026) to the rule "CI publishes nothing": it only posts public information about the repository (commit subjects, release notes, roadmap issues) and never builds, tags or uploads anything. The scripts live in `scripts/discord/` (Node ESM, no dependencies) and are covered by `node --test scripts/discord/*.test.mjs`, which also runs in `bun run scripts:test` and in the `discord` gate of `quality.yml` (Biome plus these tests, for any change to `scripts/discord/`, `scripts/mod/notify.mjs` or `discord.yml`).

## What is posted where

| Trigger | Channel | Message |
| --- | --- | --- |
| Push to `main` | #changelog | One embed "main updated: N changes" linking to the compare view, with the commit subjects grouped into Features (`feat`), Fixes (`fix`), Performance (`perf`), Documentation (`docs`) and Other. `(#123)` becomes a link to the pull request. `chore(release)`, `[skip ci]` and merge commits are dropped; nothing is posted when nothing is left, nor for a new branch or a force push. The footer shows the short SHA. |
| Push of a `mod-v*` tag | #changelog | One embed "Minemories mod X released": the commits touching `mod/` since the previous `mod-v*` tag (at most 50 when there is none), grouped the same way, with links to `/downloads` and `/changelog` on the site. |
| Push of a `mod-v*` tag, issue opened, edited, closed, reopened, labelled, unlabelled or deleted (only when it carries, or just lost, the `roadmap` label), every day at 06:00 UTC, manual run | #roadmap | A single message, edited in place: a "Latest mod version" embed, then three embeds: In progress, Planned, Done, last 30 days. |

The workflow posts through the webhook stored in the `DISCORD_WEBHOOK_URL` secret; the webhook decides the channel. If changelog and roadmap must land in two different channels, use two webhooks and adapt the workflow (one secret per job).

## How the roadmap works

The source of truth is the GitHub issues of `For-Hives/minemories` that carry the **`roadmap`** label (pull requests are ignored). The site's `GET /api/roadmap` uses exactly the same rules:

- **In progress**: open issue that also has the **`in-progress`** label;
- **Planned**: any other open roadmap issue;
- **Done**: roadmap issue closed as completed (or without a reason) during the last 30 days. Issues closed as "not planned" or "duplicate" never appear.

## Latest mod version

The first embed of the roadmap message (and the card above the board on `/roadmap`, from the same `latestRelease` field of `GET /api/roadmap`) shows the newest mod release, read from the public GitHub API (`scripts/discord/release-info.mjs`):

- **Version**: the `mod-v*` tags (`mod-vX.Y.Z` or `mod-vX.Y.Z-beta.N`, at most three pages of 100 tags), sorted by semver with a release above its betas (`0.36.1` > `0.36.1-beta.3` > `0.36.1-beta.1` > `0.36.0`). The newest is the latest version, the next one the previous version. A beta is marked as such.
- **Date**: the committer date of the latest tag's commit, shown as a Discord date (`<t:…:D>`, in each reader's locale).
- **Notes**: the commits touching `mod/` reachable from the latest tag and strictly newer than the previous tag's commit (the previous tag's commit excluded). `chore(release)`, `[skip ci]` and merge commits are dropped. Each note is the first line of the subject without its Conventional Commit prefix, marked New (`feat`), Fixed (`fix`) or Changed (everything else), features first, then fixes, then the rest; `(#123)` becomes a link to the pull request. At most 12 notes, the rest counted in "+N more". Without a previous tag, the 12 newest `mod/` commits.
- **Links**: Download (`/downloads`), All changes (`/changelog`) and Compare (the GitHub compare view between the two tags, or the tag's tree when there is no previous tag).

When GitHub fails while reading the release (or there is no `mod-v*` tag yet), the roadmap is still posted, without this embed, and the job logs a warning. When the message exceeds Discord's 6000-character limit, release notes are dropped first (into "+N more"), then roadmap lines.

## Columns

Planned and In progress are sorted by last update, Done by closing date, newest first (ties: highest issue number first). Each column shows at most 25 issues and a "+N more" line for the rest. Each line is `#123 title — areas`, linking to the issue, where the areas are the labels among `mod`, `api`, `front` and `socials` (community and videos). When the three columns together exceed Discord's 6000-character limit, the longest column loses lines (counted in its "+N more") until the message fits.

To put something on the roadmap: add the `roadmap` label to the issue. To mark it as being worked on: add `in-progress`. Closing it as completed moves it to Done for 30 days.

## Safety

- Every payload sets `allowed_mentions: { parse: [] }`: nobody is ever pinged. `@everyone` and `@here` are also broken with a zero-width space.
- Issue titles and commit subjects are escaped for Discord markdown (no injected links, formatting or mentions) and clipped. Discord limits are enforced: title 256, description 4096, 10 embeds, 6000 characters per message.
- The webhook URL is never printed: every error goes through the same redaction as `scripts/mod/notify.mjs`.
- Deliveries retry on 429 (Discord's `retry_after`, capped at 30 s) and on 5xx or network errors (4 attempts in total); a 4xx is not retried.
- Changelog posts are best effort: a Discord failure is logged as a warning and the job stays green. The roadmap job fails when GitHub or Discord fails, so a stale roadmap is visible in the Actions tab.
- Without the secret, every job exits successfully with a notice and sends nothing. Pull requests never trigger this workflow; their tests run in `quality.yml`.
- Release notes are commit subjects: they are escaped and clipped like issue titles. The version comes only from tags matching `mod-vX.Y.Z(-beta.N)`.
- The `issues` trigger runs with the webhook secret for any edit of a roadmap issue. Issue titles only reach the Node script through the GitHub API, never a shell line, and are escaped before posting.

## One-time setup

1. In Discord, create a webhook on the target channel (Server settings → Integrations → Webhooks) and copy its URL.
2. Store it as the repository secret `DISCORD_WEBHOOK_URL` (Settings → Secrets and variables → Actions). Never paste it in an issue, a commit or a log.
3. Create the labels `roadmap`, `in-progress` and `socials` if they do not exist (the areas `mod`, `api`, `front` already do).
4. Run the workflow manually once (Actions → Discord sync → Run workflow). Without a stored message id, the roadmap job posts a new message and prints **only its id** in the log. Issue events and the daily run do nothing until the id is stored, so they cannot pile up messages.
5. Store that id as the repository **variable** `DISCORD_ROADMAP_MESSAGE_ID`. From then on, every run edits that message.

If someone deletes the roadmap message, automatic runs get a 404 and **fail on purpose** without posting anything. Run the workflow manually: it posts a new message, prints its id and fails too; update `DISCORD_ROADMAP_MESSAGE_ID` with the printed id. Manual runs only post from the default branch.

## Running it locally

```bash
node scripts/discord/cli.mjs changelog push --before <sha> --after <sha> --dry-run
node scripts/discord/cli.mjs changelog release --tag mod-v0.36.1-beta.1 --dry-run
node scripts/discord/cli.mjs roadmap --dry-run
```

`--dry-run` prints the JSON payload instead of sending it. Without `--dry-run` the commands need `DISCORD_WEBHOOK_URL` (and, for the roadmap, `DISCORD_ROADMAP_MESSAGE_ID`); `GITHUB_TOKEN` is optional and only raises the GitHub API rate limit.
