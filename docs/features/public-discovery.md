# Public gallery and ranking

## Contract and publishing

The `discovery` procedures of the shared contract separate the public catalog,
owner publishing and moderation. Memories stay private on upload. An owner
explicitly submits a title, a description, a category, an optional thumbnail
and `consent: true`. The candidate is `pending`; it stays out of the catalog
and its GLB can only be viewed by a moderator.

Another moderator can approve it or reject it with a reason. Every new
submission gets a new UUID and goes back to pending: it keeps neither approval
nor votes. Revocation removes the catalog entry and the public file; moving to
the trash does the same within the SQLite transaction, even if another server
path modifies the memory. Restoring from the trash never republishes
automatically. Permanent deletion cascades to votes, reports and the
publication.

The public DTO contains only the chosen fields, the publication UUID, its date
and the votes. It carries no server address, seed, coordinates, owner, private
UUID, storage key or private metadata. The GLB itself becomes public after
approval; its textures and captured content must therefore be part of the
consent shown to the owner. Private link sharing is separate.

## Moderation and safeguards

Moderators are Better Auth administrators (`user_roles` table). Without an
administrator, submissions stay pending. An account cannot approve its own
publication. No client can grant itself this role. The `pending`, `approved`,
`rejected` and `reported` queues are reserved for these roles. Reports do not
automatically hide a memory; a moderator reviews the GLB and decides. The last
twenty reasons are shown per candidate and reports are cleared after the
decision.

Votes and reports require a real session. A publication/account primary key
enforces a single vote, and voting for your own memory is refused. The desired
`voted` state makes retries idempotent. SQLite counters limit, per account and
per fixed one-hour UTC window, five submissions, thirty vote changes and ten
reports. They survive restarts; old counters are cleaned up in bounded
batches. This limits bursts and duplicates per account, without claiming to
identify the people behind multiple accounts.

The catalog searches title/description literally, filters by category and
sorts by recency or vote count, with pagination of 24 results. SQL queries use
parameters. Responses and GLBs use `private, no-store`; files add `nosniff`.
The server rechecks the publication after the asynchronous storage open,
before sending the response: a revocation committed during that wait wins. A
file already received by a visitor cannot be removed from their machine.

## Validation

The service tests cover ownership, DTO separation, independent review,
revocation/resubmission, trash/restore/deletion, persisted thresholds, reports,
literal search, pagination and ranking. Independent SQLite processes exercise
duplicate votes and a concurrent revocation.

The HTTP tests use Better Auth, a real oRPC client, a paired device, a GLB
upload and filesystem storage. They check consent, permissions, the
review-only file, the catalog after approval, parallel votes, the absence of
private fields, storage outage and revocation while the stream is opening.
Coverage of `discovery.ts` is 100% lines/functions.

## Interfaces and local evidence

`/explore` and `/ranking` show the real catalog, its filters and its server
votes. The "Try the demo" option opens `?demo=1`: favorites, votes and shares
of these examples stay separate and publish no private capture. A private
capture's card offers "Public publication", with title, description, category,
consent unchecked by default and withdrawal. States and reasons come from the
API. The moderator role gives access to the **Moderation** link, the queues
and GLB review through `/public/:id?review=1`; the server enforces this mode,
the URL parameter grants no role.

Report and decision reasons are entered in the page. The tests cover
filters/pagination, voting without a locally invented duplicate, reporting,
rejection/retry, mandatory consent, withdrawal, role and decisions, public
loading and review, review refusal and existing private link. The dynamic
routes `/public/` and `/moderation` use the SPA fallback in Vite preview/Nginx,
stay `noindex` and are excluded from robots/sitemap.

On 15 October 2026, an isolated API/filesystem and site exercised in the
browser: owner sign-in, submission of the private memory with consent, sign-in
of another moderator account, approval, appearance in the catalog, vote,
report, review of the reason, rejection and explicit withdrawal by the owner.
Server search and the fields/actions on a dark background were inspected.
Accounts, storage keys and GLBs are local fixtures, with no production.

The available built-in browser disables WebGL: building the renderer fails
before the file is read. The Three.js render is therefore not claimed to be
visually validated in this environment. The tests check the viewer wiring, and
the GLB downloaded anonymously from the public route is identical to the
original Minecraft file (63,096 bytes, SHA-256
`dd4cc0ca5112be59255ccf7d7080ab046bbad10bf8212438f0c2e0738fbcaa51`).
Its import/render in Blender 5.2.2 was inspected: textured tower and terrain,
1 mesh, 12 images, dimensions 5 × 5 × 11. The existing renderer and GLB format
are not changed by this feature.

Artifacts outside Git:
`~/.local/state/minemories-validation/public-discovery-20261015/` (isolated
API/SQLite, screenshots of submission/catalog/moderation/withdrawal, downloaded
GLB, checksum and Blender render/log). `bun check` and `bun run build` pass; CI
also checks the real Garage cycle before merging.
