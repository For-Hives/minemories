# Discord sync: changelog and roadmap

The GitHub workflow `.github/workflows/discord.yml` posts to the project's Discord server through one webhook. It is the **owner's explicit exception** (Andy, 7 November 2026) to the rule "CI publishes nothing": it only posts public information about the repository (commit subjects, release notes, roadmap issues) and never builds, tags or uploads anything. The scripts live in `scripts/discord/` (Node ESM, no dependencies) and are covered by `node --test scripts/discord/*.test.mjs`, which also runs in `bun run scripts:test` and in the `discord` gate of `quality.yml` (Biome plus these tests, for any change to `scripts/discord/`, `scripts/mod/notify.mjs` or `discord.yml`).

## What is posted where

| Trigger | Channel | Message |
| --- | --- | --- |
| Push to `main` | #changelog | One embed "main updated: N changes" linking to the compare view, with the commit subjects grouped into Features (`feat`), Fixes (`fix`), Performance (`perf`), Documentation (`docs`) and Other. `(#123)` becomes a link to the pull request. `chore(release)`, `[skip ci]` and merge commits are dropped; nothing is posted when nothing is left, nor for a new branch or a force push. The footer shows the short SHA. |
| Push of a `mod-v*` tag | #changelog | One embed "Minemories mod X released": the commits touching `mod/` since the previous `mod-v*` tag (at most 50 when there is none), grouped the same way, with links to `/downloads` and `/changelog` on the site. |
| Issue opened, edited, closed, reopened, labelled, unlabelled or deleted (only when it carries, or just lost, the `roadmap` label), every day at 06:00 UTC, manual run | #roadmap | A single message, edited in place, with three embeds: In progress, Planned, Done, last 30 days. |

The workflow posts through the webhook stored in the `DISCORD_WEBHOOK_URL` secret; the webhook decides the channel. If changelog and roadmap must land in two different channels, use two webhooks and adapt the workflow (one secret per job).

## How the roadmap works

The source of truth is the GitHub issues of `For-Hives/minemories` that carry the **`roadmap`** label (pull requests are ignored). The site's `GET /api/roadmap` uses exactly the same rules:

- **In progress**: open issue that also has the **`in-progress`** label;
- **Planned**: any other open roadmap issue;
- **Done**: roadmap issue closed as completed (or without a reason) during the last 30 days. Issues closed as "not planned" or "duplicate" never appear.

Planned and In progress are sorted by last update, Done by closing date, newest first (ties: highest issue number first). Each column shows at most 25 issues and a "+N more" line for the rest. Each line is `#123 title — areas`, linking to the issue, where the areas are the labels among `mod`, `api` and `front`. When the three columns together exceed Discord's 6000-character limit, the longest column loses lines (counted in its "+N more") until the message fits.

To put something on the roadmap: add the `roadmap` label to the issue. To mark it as being worked on: add `in-progress`. Closing it as completed moves it to Done for 30 days.

## Safety

- Every payload sets `allowed_mentions: { parse: [] }`: nobody is ever pinged. `@everyone` and `@here` are also broken with a zero-width space.
- Issue titles and commit subjects are escaped for Discord markdown (no injected links, formatting or mentions) and clipped. Discord limits are enforced: title 256, description 4096, 10 embeds, 6000 characters per message.
- The webhook URL is never printed: every error goes through the same redaction as `scripts/mod/notify.mjs`.
- Deliveries retry on 429 (Discord's `retry_after`, capped at 30 s) and on 5xx or network errors (4 attempts in total); a 4xx is not retried.
- Changelog posts are best effort: a Discord failure is logged as a warning and the job stays green. The roadmap job fails when GitHub or Discord fails, so a stale roadmap is visible in the Actions tab.
- Without the secret, every job exits successfully with a notice and sends nothing. Pull requests never trigger this workflow; their tests run in `quality.yml`.
- The `issues` trigger runs with the webhook secret for any edit of a roadmap issue. Issue titles only reach the Node script through the GitHub API, never a shell line, and are escaped before posting.

## One-time setup

1. In Discord, create a webhook on the target channel (Server settings → Integrations → Webhooks) and copy its URL.
2. Store it as the repository secret `DISCORD_WEBHOOK_URL` (Settings → Secrets and variables → Actions). Never paste it in an issue, a commit or a log.
3. Create the labels `roadmap` and `in-progress` if they do not exist (the areas `mod`, `api`, `front` already do).
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
