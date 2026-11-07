**Save, revisit and share Minecraft worlds as memories**

Working document · Version 1.0 · September 2026 Status: pre-MVP, no code written yet

---

## Contents

1. [Executive summary](#1-executive-summary)
2. [The concept](#2-the-concept)
3. [The user need](#3-the-user-need)
4. [Market analysis](#4-market-analysis)
5. [Competitive landscape](#5-competitive-landscape)
6. [Risk analysis](#6-risk-analysis)
7. [Strategic recommendations](#7-strategic-recommendations)
8. [Revised business model](#8-revised-business-model)
9. [Go-to-market plan](#9-go-to-market-plan)
10. [Preliminary technical specification](#10-preliminary-technical-specification)
11. [Roadmap](#11-roadmap)
12. [Open decisions](#12-open-decisions)
13. [Sources](#13-sources)

---

## 1. Executive summary

**The idea.** An online service that turns an area of a Minecraft world into a lightweight, hosted 3D model that can be explored in the browser and shared with a simple link — a "memory capsule" that outlives the server shutting down, mods disappearing and the save folder being forgotten.

**Technical feasibility: high.** The rendering building block is a solved, documented problem (BlueMap, Mineways, Chunky). The real engineering work is in three areas: mod support, mesh compression, and temporal modelling for the timelapse. None of the three is a blocker.

**Commercial feasibility: medium, provided the product is repositioned.** The market exists but is narrower than it looks, and the pricing model initially considered (€2 per snapshot, €5/month for the evolving version) hits users at the worst point of their engagement cycle. Realistic estimate as things stand: €15–35k/year after three years. That is not a full-time business without a multiplier.

**The most important finding of the analysis.** CoreProtect, the near-universal block-logging plugin on Paper/Spigot servers, already records every block change with a timestamp and an author. The data needed for the "timelapse" product therefore **already exists, retroactively, on tens of thousands of servers**, without any snapshot ever having to be scheduled. This is the basis of a value proposition that nobody offers as a service today.

**The three structuring recommendations.**

1. Reposition the entry product on the **timelapse and the yearly retrospective** ("Wrapped" format), free and viral, and make the permanent archive the premium product.
2. Target **the server admin**, not the individual player: one payer for five to ten exposed users.
3. Add a **physical product** (3D print of the base) — a ticket 20× higher, a real margin, and a natural seasonal peak.

---

## 2. The concept

### 2.1 Initial statement

> It regularly happens that a group of friends sets up a Minecraft server once a year and has fun on it for a few months. We build, we create a world. Then we stop, and we forget everything. At best we keep a save we never launch again, because it is not practical to re-download every mod in the right version just to visit an old world.

### 2.2 Proposal

Automatically generate **miniature 3D models** of worlds — whatever mods are used — store them, and make it easy to revisit them from a gallery of memories.

### 2.3 Product principles

|Principle|Consequence|
|---|---|
|**The memory, not the map**|A frozen, dated object, not a live exploration map|
|**Zero infrastructure for the player**|No port, no VPS, no Docker, no config|
|**Mod independence**|The model must outlive the modpack|
|**Area selection**|We don't save the whole world, only what was built|
|**Lightweight**|Loads in a browser in a few seconds, including on mobile|
|**Shareable**|A link, no account required for the visitor|

---

## 3. The user need

### 3.1 The problem, broken down

The real problem is not "I don't have a backup". It is a chain of frictions:

1. **Relaunch friction.** Finding the right version of the modpack, launcher and loader. Cost: 30 to 90 minutes, for uncertain enjoyment.
2. **Coordination friction.** Revisiting alone a world built by eight people does not mean the same thing. Everyone would have to reinstall.
3. **Disappearance friction.** Mods are removed from CurseForge, versions break, hosts purge. Aternos, for example, imposes a 4 GB storage limit per server, which fills up quickly with a large modpack.
4. **Forgetting friction.** A `.zip` save on a hard drive is not a memory. It cannot be browsed, shared or seen. It triggers nothing.

The product does not solve storage — it solves the **emotional accessibility** of the memory.

### 3.2 Personas

**Léo — the admin (the payer)** 22, sets up a modded server with 6 friends every summer. Rents one for €5/month from a host or uses Aternos. He has the files, the habit of paying, and a sense of responsibility towards the group. **Primary target.**

**Sarah — the player (the user)** 19, plays for 3 months then drops off. Will never pay herself, but she is the one who shares the link on Discord and drives virality. **Usage and acquisition target.**

**Marc — the nostalgic (the convert)** 28, finds in 2026 the `world` folder of a 2015 server. No way to relaunch it. Ready to pay a high one-off price to get it back. **High-margin conversion target, but low volume.**

### 3.3 Job to be done

> _When a server season ends, I want to be able to show and revisit what we built together, without anyone having to reinstall anything, so that those months of play do not disappear._

Note the "show": it comes before "revisit". This is a decisive clue for positioning (see §7.1).

---

## 4. Market analysis

### 4.1 Sizing

|Level|Estimate|Basis|
|---|---|---|
|Minecraft monthly active players (all platforms)|~212 M|2026 aggregates|
|Java Edition share of server play|~65–70%|2026 server statistics|
|Aternos users (proxy for small servers)|~85 M registered, ~1 M players/day|Aternos|
|r/admincraft members (engaged admins)|150,270|Reddit|
|**Active "season with friends" servers per year**|**~1–3 M**|Derived (1 admin / 5–10 players)|
|**Reachable in 3 years, organic channels**|**~20–50k servers**|Modrinth + Reddit + Discord ceiling|
|**Realistic revenue at 5% conversion, €15/year**|**~€15–35k/year**||

### 4.2 Reading

The top of the funnel is huge but misleading. Three successive filters drastically shrink the target:

- **Java only** (Bedrock has a different world format, a marginal modding community, and a younger, less solvent audience);
- **persistent multiplayer** (solo play creates less collective attachment);
- **organically reachable** (no viable paid acquisition budget on these keywords).

**Conclusion: as things stand, this is an excellent profitable side project, not a company.** §7.3 proposes three multipliers to change this order of magnitude.

### 4.3 Seasonality

A usable and underestimated signal:

|Period|Event|Implication|
|---|---|---|
|**June**|Summer servers are born|**Acquisition** peak|
|**September–October**|Servers die (back to school)|**Conversion** peak|
|**December**|Nostalgia + gifts|**Wrapped** + **3D print** peak|

The product therefore has three natural campaign moments per year. That is rare, and the calendar must be built around it.

---

## 5. Competitive landscape

### 5.1 Map

|Category|Players|Model|Threat|
|---|---|---|---|
|**Live web maps**|BlueMap, Dynmap, squaremap, Pl3xMap|Open source, self-hosted, free|**High** (similar tech)|
|**Desktop 3D export**|Mineways, jmc2obj, Chunky|Open source, local, free|Low (expert UX)|
|**Web build viewers**|cubical.xyz, Minemev, Blockical|Freemium / subscription|Low (schematics, not worlds)|
|**Timelapse**|renderlapse, CoreProtect Time-Lapse|CLI tools, not packaged|**None — this is the opportunity**|
|**Defunct attempt**|Remix 3D (Microsoft)|Closed in January 2020|Historical warning|

### 5.2 BlueMap — the adjacent competitor to understand

It is the technical reference and the visual benchmark. It generates 3D models of the world's surface, displayed in the browser through three.js, in a Google Earth-style viewer. The project is very active: v5.23 of August 2026 targets Java 25 and publishes Paper/Folia, Fabric, Forge and NeoForge jars for Minecraft 26.1–26.2. It handles resource pack blocks.

**Its weaknesses, which define your opening:**

- it needs a running server, a published HTTP port and configuration;
- it is expensive in disk space on large worlds, to the point that some users move the webserver to a VPS with a shared SQL backend so as not to saturate their bandwidth;
- **it dies with the server** — which is precisely when the need appears;
- no notion of time, memory, gallery or social sharing;
- unsuited to a casual audience.

**Positioning rule: never present yourself as "hosted BlueMap".** That would be a losing fight against something free, on their turf.

### 5.3 Mineways — proof of physical demand

Mineways exports creations from Minecraft Java (versions 26.2 and earlier) to 3D files usable for images, films or 3D prints. It has a print-dedicated export mode that merges adjacent blocks, removes internal faces and seals openings, and historically it served as a bridge to 3D printing services.

**Strategic reading:** demand for a physical object has existed for more than ten years, but it remains limited to those who can handle an austere GUI and a Blender pipeline. Nobody has ever made it accessible in one click.

### 5.4 CoreProtect — the hidden lever

CoreProtect is a fast, efficient logging and anti-griefing tool designed for large servers, capable of rollback and restore, with SQLite storage by default or MySQL as an option, and no configuration required. It has a public API and an officially documented add-on ecosystem, which already includes **CoreProtect Time-Lapse**, a tool that automatically walks the historical logs to help create a timelapse of any length.

**Major implication:** on any Paper/Spigot server equipped with CoreProtect — that is, the vast majority of serious servers — the full history of block changes is **already recorded**. The "timelapse" product can therefore be delivered **retroactively**, from the very first connection, without any snapshot ever having been scheduled.

The resulting sales pitch: _"Plug in your CoreProtect. We give you back the last six months of your server, animated, in two minutes."_

The equivalent exists on the modded/Fabric side (Ledger and similar), so the approach covers both ecosystems.

### 5.5 Remix 3D — the failure to understand

Microsoft tried a version of this idea: a 3D community browsable from the browser, with built-in support in Minecraft Windows 10 that let players use structure blocks to select parts of the world and export them. The service was shut down on 10 January 2020.

**Failure hypothesis:** Remix 3D was a **model repository**, not a **memory service**. It gave no reason to come back: no temporality, no collective dimension, no link to a lived story. The object was there, the emotion was not.

### 5.6 Summary: the gap in the market

```
                       EPHEMERAL                     PERMANENT
                          │                              │
    TECHNICAL    BlueMap, Dynmap ────────────── Mineways, jmc2obj
                 (live map, dies                (local export, expert,
                  with the server)               file on a disk)
                          │                              │
    ───────────────────────┼──────────────────────────────┼──────────────
                          │                              │
    MAINSTREAM      cubical.xyz,              ███  EMPTY SPACE  ███
                    Minemev, Blockical         Hosted memory capsule,
                    (schematics, builds)       temporal, shareable
```

The box is empty. Microsoft failed there once — for identifiable and avoidable reasons.

---

## 6. Risk analysis

### 6.1 Legal / platform risk — **moderate, manageable**

The Minecraft guidelines require a visible notice stating that the product, service or event is not official and is neither approved by nor associated with Mojang or Microsoft. They also state that Minecraft may revoke any permission at any time if it deems it appropriate, or simply if it does not like what is being done.

**Mandatory mitigations from day 1:**

- never include "Minecraft" (or an obvious variation) in the brand name or domain;
- an explicit disclaimer in the footer of every public page — exactly what Planet Minecraft does, which has operated since 2010 without incident;
- claim no affiliation, partnership or endorsement;
- do not redistribute game assets or mod jars; only produce **derived renders** generated on demand for the user who owns the world.

**Residual risk:** low but not zero, and unilateral. To be accepted consciously, not ignored.

### 6.2 Competitive risk — **the most serious**

If BlueMap (or a host) ships a "hosted archive" mode, the technical differentiator disappears overnight.

**Mitigation:** do not build the advantage on render quality, but on the three things an open-source mapping project will not naturally do: the **retroactive timelapse**, the **physical object**, and the **emotional/social layer** (gallery, Wrapped, sharing).

### 6.3 Purchase timing risk — **structural**

The product sells at the moment the user disengages. They pay when they stop playing — that is, when they stop thinking about the product. It is the worst possible sales cycle.

**Mitigation:** capture users during the server's life with a free, social product (weekly timelapse, Wrapped), and sell the archive as a deferred benefit. See §7.1.

### 6.4 Over-engineering risk — **the most likely**

The technical problem is fun (binary parsing, meshing, compression, WebGL), the market is small, the margin is thin. It is the classic recipe for a beautifully architected project that never launches.

**Mitigation:** a hard constraint — a working public demo in **three weeks at most**, even an ugly one, before anything else.

### 6.5 Egress cost risk — **underestimated**

The dominant cost is not storage or CPU, but **outbound bandwidth**. A gallery shared on a 500-person Discord serves several GB in a few hours. On a provider that charges for egress, a single viral success can cost more than a month of revenue.

**Mitigation:** Cloudflare R2 or Backblaze B2 (free or near-zero egress) from day one. A structuring decision that is cheap to make and irreversible if taken early.

### 6.6 SWOT

||Positive|Negative|
|---|---|---|
|**Internal**|**Strengths**<br>Real, lived need · No direct competitor · Documented technical building block · Untapped timelapse angle|**Weaknesses**<br>Narrow market · Unfavourable purchase timing · High technical cost of mod support · Solo project|
|**External**|**Opportunities**<br>CoreProtect = free data · Minecraft nostalgia (14 years of play) · 3D printing · B2B hosting channel|**Threats**<br>Mojang revocation · BlueMap moves in · Viral egress · Remix 3D's historical failure|

---

## 7. Strategic recommendations

### 7.1 Recommendation no. 1 — Invert the value proposition

**Problem.** Selling nostalgia to people who are not nostalgic yet does not work. By the time they are, they have not thought about Minecraft for six months and will never find the service.

**Solution.** The entry product must be consumed **during** the server's life, and be **social** rather than about memory.

```
BEFORE (initially proposed)           AFTER (recommended)
────────────────────────────          ──────────────────────────────
Entry: €2 snapshot                    Entry: shareable timelapse (free)
Premium: timelapse €5/month           Loop: yearly Wrapped (free)
Moment: end of server                 Premium: permanent archive + HD
Emotion: nostalgia                    Extra: physical object
                                      Moment: during the server
                                      Emotion: pride, then nostalgia
```

We sell **vanity now** and deliver **nostalgia later**. Nostalgia is not sold, it is harvested.

### 7.2 Recommendation no. 2 — Target the admin, not the player

A server among friends = **one payer for five to ten exposed users**. The admin is already used to paying (hosting), has access to the files, and carries the sense of responsibility towards the group.

Concrete consequences:

- pricing is **per server**, never per player;
- onboarding targets a profile that already knows how to install a plugin;
- the acquisition channel is r/admincraft, Modrinth and server Discords — not mainstream social networks;
- the product must make the admin **a hero to their group** ("look what I did for us").

### 7.3 Recommendation no. 3 — The three multipliers

Without them, the ceiling is ~€30k/year. With them, the order of magnitude changes.

**Multiplier A — The physical product (×3 to ×5 on revenue)**

The cleaned-up mesh already exists in the pipeline. A "watertight" mode (merging adjacent blocks, removing internal faces, closing openings — exactly what Mineways does) makes it possible to offer:

> _"Order this base printed in coloured resin — €39"_

- a ticket 20× higher than the monthly subscription;
- a real 30–50% margin through a white-label print-on-demand service;
- no stock, no logistics of our own;
- natural seasonal peak: Christmas, end of season, server anniversary.

**Multiplier B — The yearly "Wrapped" (organic acquisition)**

Every December, every connected server automatically receives an animated retrospective:

- blocks placed and broken, per player;
- the biggest builder, the biggest miner, the biggest destroyer;
- evolution of the main base as a timelapse;
- the night everyone was online at the same time;
- the most visited biome, the dumbest death.

Free, generated automatically, shareable in one click. Spotify has shown that this format is the best organic acquisition vehicle ever designed for a personal data product. **And all the data is already in CoreProtect.**

**Multiplier C — The B2B hosting channel (×10 on distribution)**

Hosts (Aternos, Minehut, FalixNodes, Minefort, ScalaCube on the free side, and dozens on the paid side) already own the files, the users, the payment method and the control panel. They are all looking for a differentiating feature.

A "Memories" button integrated at **a single** mid-sized host is worth two years of organic acquisition. Model: revenue share or white-label licence. To be pursued as soon as a convincing demo exists.

### 7.4 Recommendation no. 4 — The four differentiation axes to hold

|Axis|Content|Defensibility|
|---|---|---|
|**Retroactive timelapse**|Rebuilding history through CoreProtect/Ledger, with no prior snapshot|**Very high** — nobody does it as SaaS|
|**Mod independence**|Client-side export of meshes already baked by the game|**High** — real technical barrier|
|**Zero infrastructure**|No port, no VPS, no Docker, no reverse proxy|Medium — copyable|
|**Object and emotion**|Gallery, permalink, Wrapped, 3D print|Medium but cumulative|

---

## 8. Revised business model

### 8.1 Why drop the €2 price

|Problem|Detail|
|---|---|
|Payment fees|Stripe: ~€0.25 fixed + 1.5% → **~14% of the ticket**|
|Operating debt|"Lifetime" storage committed for €1.70 net|
|Psychological friction|Micro-payment triggers a purchase decision for a trivial amount — free converts better, at comparable marginal cost|
|Value signal|A very low price suggests a disposable product, which directly contradicts the promise of permanence|

### 8.2 Recommended pricing

|Offer|Price|Strategic role|
|---|---|---|
|**Discovery snapshot**<br>1 area, 12-month retention, standard resolution|**Free**|Acquisition, virality, proof of value|
|**Yearly Wrapped**<br>Automatic server retrospective|**Free**|Seasonal acquisition, retention|
|**Server**<br>Unlimited areas, timelapse, permanent retention, HD, custom domain|**€4.99/month or €39/year**|Recurring revenue — paid by the admin|
|**Lifetime archive**<br>Frozen mesh, guaranteed permalink, downloadable `.glb` export|**€19 (one-off payment)**|The real nostalgia product, with no perceived debt|
|**3D print**<br>Colour resin, 3 sizes|**€39 / €79 / €149**|Margin, seasonal peak, gift|

### 8.3 Cost structure (orders of magnitude)

|Item|Cost|Comment|
|---|---|---|
|Meshing CPU|Negligible|A few seconds to minutes, in an asynchronous worker|
|Storage (R2/B2)|~$0.015/GB/month|An archived world ≈ 5–20 MB → ~€0.003/year/world|
|**Egress**|**0 on R2/B2**|**The trap to avoid — never standard S3**|
|Payment|~2–14%|Drops sharply with ticket size|
|3D print|50–70% of the price|White-label subcontracting|

**Operational break-even: very low.** The project can run on a few tens of euros per month of infrastructure up to several thousand archived worlds. The real cost of the project is **development time**, not infrastructure.

---

## 9. Go-to-market plan

### Phase 0 — The proof artifact (weeks 1–3)

**A single deliverable:** a public page showing **your own world**, explorable, with the time slider if possible.

No marketing landing page. No pricing. No sign-up. Just the object.

**Decision criterion:** if you feel nothing when you see your world again, and if three friends you send it to do not reply within a minute, **stop the project here**. The rest of the plan rests on the emotional weight of this demo.

### Phase 1 — Admins (months 1–3)

|Channel|Tactic|Why|
|---|---|---|
|**Modrinth + Hangar**|Publish the plugin/mod for free|No. 1 distribution channel, free, provides usage statistics|
|**r/admincraft** (150k members)|A **technical** post, not a promotional one: "how I rebuilt 8 months of CoreProtect history as a 3D timelapse", with the code|This community rewards technique and punishes marketing|
|**CoreProtect ecosystem**|Get the add-on listed on the official third-party integrations page|Perfectly qualified, free, lasting audience|
|**Server Discords**|Identify 50 SMPs among friends, offer the season retrospective for free|Each delivery exposes 6–10 players|

### Phase 2 — Players (months 3–9)

|Channel|Tactic|
|---|---|
|**Micro-creators**|Contact 20 FR+EN YouTubers/TikTokers with 10–100k subscribers (not the big ones). Guaranteed format: _"I found the server we made in high school"_. Offer the service for life in exchange for a link in the description|
|**Discord embed**|Automatically generate an isometric PNG postcard for the OpenGraph tags. **Main viral channel** — polish it as much as the 3D render|
|**Mainstream Reddit**|r/Minecraft, r/feedthebeast, r/MinecraftBuilds — by showing worlds, never by selling|
|**Seasonality**|Campaigns timed for June / September–October / December (§4.3)|

### Phase 3 — Distribution (month 9+)

Pitch to hosts, with the usage statistics from phase 1 as social proof. Target mid-sized hosts first, more accessible and hungrier for differentiation than the leaders.

### What will not work

- **Google Ads** — high CPC on Minecraft keywords, zero purchase intent
- **Planet Minecraft** — an audience of map makers, not nostalgic players
- **App Store / Play Store** — wrong usage context, disproportionate development cost
- **Starting from the website** — building the marketing before the object is the most common failure mode

---

## 10. Preliminary technical specification

### 10.1 Overall architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  DATA SOURCES                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  A. Client mod (Fabric/NeoForge)    B. Server plugin (Paper)    │
│     → meshes already baked             → region files + CoreProtect
│     → resolves mods                    → retroactive timelapse  │
│                                                                 │
│  C. .zip upload (dead worlds)                                   │
│     → Anvil parsing + asset resolution via manifest             │
└────────────────────────────┬────────────────────────────────────┘
                             │  HTTPS (compressed chunks)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  INGESTION API (Rust/Axum or Go)                                │
│  Authentication · quotas · queueing                             │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  MESHING WORKERS (Rust)                                         │
│  1. External flood fill   → visible shell only                  │
│  2. Greedy meshing        → merge coplanar quads                │
│  3. Texture atlas         → packing + KTX2/Basis                │
│  4. LOD (3 levels)        → distance-based decimation           │
│  5. glTF + meshopt export → final .glb                          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STORAGE                                                        │
│  Cloudflare R2 / Backblaze B2  (free egress — critical)         │
│  PostgreSQL: metadata, users, temporal index                    │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (three.js + React)                                    │
│  Gallery · 3D viewer · time slider · OG sharing                 │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 The mod problem — three paths

**Path A — Client-side companion mod (recommended, top priority)**

The Minecraft client has **already** loaded and baked every model of every mod in memory, with the texture atlas assembled. An export mod can therefore grab the final geometry directly, without ever needing to know what a mod is.

- ✅ **Full and free** mod support
- ✅ No multi-GB upload
- ✅ Natural in-game area selection
- ✅ Exact textures and models, including custom blocks, connected textures, resource packs
- ❌ Requires the player to launch the game (unsuited to dead worlds)
- ❌ Two builds to maintain (Fabric, NeoForge)

**Path B — Server plugin (Paper/Spigot)**

Reads region files directly on the server + access to CoreProtect for history.

- ✅ The admin installs it once, the whole server benefits
- ✅ **The only path giving access to the retroactive timelapse**
- ❌ On a modded server, mod blocks are not resolved server-side → fallback required

**Path C — Save upload (dead worlds)**

- Parsing the Anvil format (`.mca`) and NBT
- Reading `level.dat` for the version and mod list
- Resolving assets through a CurseForge/Modrinth manifest → downloading the jars → extracting `assets/*/models/`, `blockstates/`, `textures/`
- **Progressive fallback** if a mod cannot be found:
    1. average texture colour if the mod is partially available
    2. deterministic colour derived from the hash of the block identifier
    3. neutral grey cube

> A world that is 95% recognizable is infinitely better than an error message.

**Implementation order: C (prototype) → A (product) → B (differentiation).** Path C validates the pipeline on your own saves, with no external dependency.

### 10.3 Meshing pipeline — details

|Step|Technique|Expected gain|
|---|---|---|
|**1. External flood fill**|BFS from the faces of the bounding box, marking reachable air; only blocks adjacent to that air are kept|**×50 to ×150** — the most cost-effective optimization|
|**2. Face culling**|Remove any face whose neighbour is opaque|×2 to ×6|
|**3. Greedy meshing**|Merge coplanar quads with the same texture and orientation|×5 to ×50 depending on how regular the builds are|
|**4. Atlas**|Pack the textures used, `NearestFilter` mandatory, KTX2/Basis compression|×4 on texture weight|
|**5. LOD**|3 levels: full / half resolution / coloured silhouette|Progressive loading|
|**6. Compression**|Binary glTF + `meshoptimizer` (better than Draco for voxel geometry)|×3 to ×5|

**Performance target**

|Area|Raw blocks|Triangles after pipeline|`.glb` size|
|---|---|---|---|
|Small base (64³)|260k|~15k|0.5–2 MB|
|Medium base (256×256×128)|8.4 M|~120k|**2–8 MB**|
|Large area (512×512×256)|67 M|~600k|15–40 MB (LOD mandatory)|

**Critical point of attention:** `NearestFilter` on every texture. Linear filtering turns Minecraft pixel art into mush and destroys the product's visual identity. This is the detail that separates a render that moves people from one that disappoints.

### 10.4 Temporal data model (timelapse)

**Never store N complete meshes.** An offer with hourly snapshots would generate 720 states per month — unmanageable and ruinous.

**Chosen model: base + block patches**

```
world_id/
├── base.glb                 ← state T0, complete mesh
├── atlas.ktx2               ← textures, shared by every state
├── timeline.json            ← index of events and checkpoints
└── patches/
    ├── 0001.bin             ← block diff (position, old_id, new_id)
    ├── 0002.bin
    └── ...
```

**Client-side reconstruction:**

1. load `base.glb` + `atlas.ktx2`;
2. apply patches up to the requested instant T;
3. re-mesh **only the affected chunks**, in a Web Worker;
4. replace the matching sub-meshes in the scene.

**Checkpoints:** a complete mesh every ~200 patches, to avoid a linear rebuild from the origin on long histories.

**Ingestion from CoreProtect:**

```sql
-- Conceptual schema: each change is already timestamped and attributed
SELECT time, user, x, y, z, type, action
FROM co_block
WHERE x BETWEEN ? AND ? AND z BETWEEN ? AND ?
ORDER BY time ASC;
```

This is exactly the structure of a patch stream. **The conversion is almost direct** — which is what makes the timelapse multiplier so cheap to implement.

### 10.5 Automatic detection of interesting areas

A high-impact, technically simple UX feature.

**Algorithm:**

1. For each chunk, compute an **artificiality score**:
    - high weight: blocks never generated naturally (planks, glass, ore blocks, concrete, wool, redstone, torches…)
    - medium weight: natural blocks in an unlikely arrangement (stone at Y>100, regular geometry detected)
    - negative weight: purely generated chunks
2. Build a heatmap and apply Gaussian smoothing
3. Extract local maxima, group them into clusters by flood fill on the threshold
4. Generate a bounding box per cluster, with a 16-block margin
5. Present: _"We found 6 builds in your world"_, with thumbnails and checkboxes

**UX benefit:** the player selects nothing, they **confirm**. This is probably the feature that makes the difference between an admin tool and a mainstream product.

### 10.6 Target user journeys

**Journey A — From the game (main path)**

```
/memories
  → a holographic frame appears around the player
  → scroll wheel: grow / shrink   ·   Shift+scroll: height
  → right click: confirm
  → "Uploading… 12%"
  → chat: "✅ Your memory is ready: mem.link/a7f3k"
```

Zero coordinates to type. Zero files to handle. Zero accounts required to create.

**Journey B — From the web (dead worlds)**

```
Drag and drop the world folder (or the .zip)
  → automatic analysis: version, detected mods, builds found
  → "We found 6 builds" → checkboxes + thumbnails
  → generation → gallery
```

**Journey C — The visitor (the most important for virality)**

```
Discord link → embed with an isometric postcard
  → click → 3D viewer, no account required, loads in < 3 s
  → time slider visible immediately
  → "Create my server's memory" button
```

### 10.7 Proposed tech stack

|Layer|Choice|Rationale|
|---|---|---|
|Client mod|**Fabric + NeoForge** (Java)|Covers most of today's modded ecosystem|
|Server plugin|**Paper** (Java)|Access to the CoreProtect API|
|Parsing + meshing|**Rust** (`fastanvil`, `fastnbt`, `meshopt`)|Critical performance, single-binary deployment|
|API|**Rust/Axum** or **Go**|Consistent with the workers, small footprint|
|Queue|**Redis** or **NATS**|Simplicity|
|Database|**PostgreSQL**|Metadata, temporal index, users|
|Object storage|**Cloudflare R2**|**Free egress — non-negotiable decision**|
|Frontend|**React + three.js + `@react-three/fiber`**|Mature ecosystem for glTF/KTX2|
|Payment|**Stripe**|Standard|

### 10.8 File formats involved

|Format|Role|Libraries|
|---|---|---|
|`.mca` (Anvil)|Region files, 32×32 chunks|`fastanvil` (Rust), `anvil-parser` (Python)|
|NBT / `level.dat`|World metadata, version, mods|`fastnbt`, `prismarine-nbt`|
|`.jar` (mods)|Asset extraction (path C)|`zip` + JSON blockstate parsing|
|`.glb`|3D deliverable|`gltf` (Rust), `GLTFLoader` (three.js)|
|`.ktx2`|GPU-compressed textures|`basis_universal`|
|SQLite/MySQL|CoreProtect database|Read-only, never written|

### 10.9 Security and privacy

- Worlds contain **usernames, coordinates, text on signs and in books** — so potentially personal data. GDPR applies.
- Galleries are **private by default**, with explicit sharing through an unguessable link (UUID v4).
- Never index private galleries; `robots.txt` and `noindex` by default.
- Option to anonymize usernames in timelapses.
- Full deletion on request, in one click, with no email to write.
- Strict upload validation: an uploaded `.zip` is an attack surface (zip bombs, path traversal). Sandboxed extraction, hard quotas.

---

## 11. Roadmap

### Milestone 0 — Emotional proof (3 weeks) 🎯

- [ ] Parse vanilla `.mca` in Rust, on a personal save
- [ ] External flood fill + greedy meshing + atlas
- [ ] `.glb` export
- [ ] Minimal three.js viewer, deployed on a public URL
- [ ] **Test:** send it to 3 friends who played on that server

**Go/no-go criterion:** an immediate emotional reaction, or the project stops.

### Milestone 1 — Validating the differentiator (weeks 4–6)

- [ ] Read a CoreProtect database and rebuild the state of an area at a given date
- [ ] Generate a 30-second animation showing a base's evolution
- [ ] **Criterion:** if the reconstruction works, the product has a unique angle

### Milestone 2 — Minimal product (months 2–4)

- [ ] Fabric client export mod (resolves mods)
- [ ] Ingestion API + workers + R2
- [ ] Web gallery + permalinks + OpenGraph embeds
- [ ] Automatic area detection
- [ ] Stripe

### Milestone 3 — Launch (months 4–6)

- [ ] Modrinth release
- [ ] Technical post on r/admincraft
- [ ] 50 retrospectives offered to server Discords
- [ ] Listing on the CoreProtect add-ons page

### Milestone 4 — Multipliers (months 6–12)

- [ ] Yearly Wrapped (ship before December — hard deadline)
- [ ] Watertight mode + 3D printing partnership
- [ ] Reach out to hosts
- [ ] NeoForge support + Paper plugin

---

## 12. Open decisions

Points to settle before milestone 2:

1. **Open source or proprietary?** An open-core model (open-source client mod, proprietary hosted service) massively speeds up adoption on Modrinth and admins' trust, at the cost of fork risk. **Recommended leaning: open-core.**
    
2. **Bedrock, yes or no?** Different world format (LevelDB), marginal modding community, younger audience. **Recommendation: no, at least until milestone 4.**
    
3. **Name and brand.** Absolute constraint: must not contain "Minecraft", nor "craft", nor "mine" in an overly evocative way. "Minemories" is probably too close — to be reassessed legally.
    
4. **Free forever or limited retention?** The promise of permanence is the emotional core of the product, but it creates a debt. Option: 12 years of free retention (a plausible service lifetime), presented honestly.
    
5. **Who builds it?** A solo project is feasible up to milestone 3, but the Java client mod and the Rust backend are two distinct skills. Consider a technical co-founder or limit the initial scope to path C.
    

---

## 13. Sources

**Tools and projects studied**

- BlueMap — https://github.com/BlueMap-Minecraft/BlueMap
- Dynmap, squaremap, Pl3xMap — 2026 comparison: https://blog.berrybyte.net/dynmap-vs-bluemap-vs-squaremap-which-map-plugin-is-best-for-your-minecraft-server/
- Mineways — https://www.realtimerendering.com/erich/minecraft/public/mineways/
- CoreProtect — https://modrinth.com/plugin/coreprotect
- CoreProtect Time-Lapse — https://modrinth.com/plugin/cptl
- CoreProtect integrations — https://docs.coreprotect.net/tools-integrations/
- renderlapse — https://github.com/moon44432/renderlapse
- cubical.xyz, Minemev, Blockical — web build viewers
- Remix 3D (closed in 2020) — https://en.wikipedia.org/wiki/Remix_3D

**Market data**

- Minecraft statistics 2026 — https://www.demandsage.com/minecraft-statistics/
- Server statistics 2026 — https://dathost.com/blog/minecraft-server-player-count-statistics-2026
- Aternos and free hosting — https://www.oak-servers.com/blog/free-minecraft-server-hosting/
- r/admincraft — 150,270 members

**Legal framework**

- Minecraft Usage Guidelines — https://www.minecraft.net/en-us/usage-guidelines

---

_This document supports decisions; it is not a fixed execution plan. The market estimates are orders of magnitude derived from public sources and must be validated by the first real usage figures._

_This project is not an official Minecraft product. It is not approved by or associated with Mojang or Microsoft._
