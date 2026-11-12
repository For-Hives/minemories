# Minemories brand guidelines: the Minecraft interface, applied to the whole site

Reference document for Andy (front end, landing), Bréval (product) and anyone adding a page. It complements [design-system.md](design-system.md) (tokens, components, landing audit): this document says **what** to apply and **why**, the other says **how** it is coded.

Status: version 1 (30/10/2026). The game's grays (buttons, panels, slots, disabled) are applied in `film.css :root` (section 3). Passages marked **[to validate]** are still undecided proposals.

---

## 1. The principle: a memory is an object

Minemories keeps memories of Minecraft worlds. So the site speaks the game's language: its menus, slots, tooltips and chat messages. Visitors should think “this is made for the game” before reading a single word.

Three rules govern everything else:

1. **We reuse the game's grammar, not its files.** Bevels, slots, tooltips, notifications, pixel scale, text shadow: yes. Textures, sprites, sounds, logo: never (see § 12).
2. **The game is the reference.** When in doubt between two solutions, pick the one closest to what a player sees in the game, as long as it stays readable (§ 11).
3. **Restraint.** No gradients, rounded pills, blurred shadows, three-column cards, emoji or generic icons. One material (stone), one accent (ember).

### The closeness slider

| Level | What it means | Where we are |
|---|---|---|
| 1. Evocative | You sense the theme (pixels, blocky font) | past it |
| **2. Faithful to the grammar** | Same shapes, same proportions, same states, nearby colors | **target of these guidelines** |
| 3. Copying the screens | Remaking Mojang's title screen, inventory, loading screen | **forbidden** (rights, § 12) |

The guidelines aim for level 2 everywhere: a player recognizes the family, nobody mistakes the page for a Mojang screen.

---

## 2. What we apply today (landing, in production)

| Area | Applied | Where |
|---|---|---|
| Font | “MM Minecraft” for headings and controls; Atkinson Hyperlegible Next for reading text; Unifont for Korean and Japanese; “Readable font” option | `film.css`, `charter.css` |
| Pixel | `--gp` = 2 px (3 px for the film HUD above 960 × 720) | `film.css`, `tokens.css` |
| Type scale | headings 24 / 32 / 40 px, reading 16 / 18 / 20 px | `tokens.css` |
| Colors | Warm night `#14110e`, text `#f4efe6`, stone, copper, ember `#ffb347` | `film.css :root` |
| Relief | 1 gp black border, light top left, shadow bottom right, one-texel text shadow | `.mc-btn`, `.mc-panel` |
| Components | Button, panel, slot, hotbar, tooltip, notification, chat, tabs, field, FAQ, steps, footer | `film.css`, `charter.css` |
| Motion | 120 / 200 / 360 ms, 12 px scroll-in entrance, stopped under “reduced motion” | `tokens.css`, `reveal.ts` |
| Accessibility | Contrast ≥ 4.5:1, 44 px targets, visible focus, Tab order = DOM order | `charter.css` |

---

## 3. Where we match the game, where we depart from it, and what we propose

The game (Java 1.21.1, measured on the client) is the reference. Art direction v7 had deliberately shifted several tones so as not to look like a Mojang screen. Since you want to get closer, here is the detail.

| Element | Game (vanilla) | Minemories today | Proposal |
|---|---|---|---|
| Button, idle | face `#6F6F6F`, light `#AAAAAA`, shadow `#565656`, black outline | game gray `#6F6F6F` / `#AAAAAA` / `#565656` (applied) | **Done.** Before: warm stone `#6E6862`. White text 5.0:1. |
| Button, hover | white outline `#FFFFFF`, face one step lighter | `--hover` outline `#FFF4E0` | keep (nearly identical) |
| Button, disabled | face `#2C2C2C`, text `#A0A0A0` | `--off #2C2C2C`, `--off-ink #A0A0A0` (applied) | **Done.** Text 5.3:1. |
| Primary button | none: all buttons are gray | copper `#8A5A2B` | **keep copper, but only one per area.** Deliberate departure: it avoids aping the game and guides the eye. |
| Panel (container) | face `#C6C6C6`, white light, shadow `#555555`, notched corners, title `#404040` | game gray `#C6C6C6` / `#FFFFFF` / `#555555`, title `#404040` (applied) | **Done.** Before: warm paper `#CFC8BC`. Text 6.1:1. |
| Page background | since 1.20.5: 25% black veil over a blurred panorama | warm night `#14110E` | keep: the site is set at night. Put a dark veil over background images. |
| Item slot | inset `#373737`, face `#8B8B8B`, light edge `#FFFFFF` | `#373737` / `#8B8B8B` / `#FFFFFF` (applied) | **Done.** White text on a slot: 3.4:1, below 4.5:1 (it was ~3:1 before): only put icons and large numbers on a slot. |
| Tooltip | `#100010` background at 94%, purple border `#5000FF` → `#28007F`, offset by 12 gp | ember border | **keep the ember.** The purple border is the game's most recognizable sign: dropping it separates homage from imitation. |
| Notification (toast) | face `#212121`, ring `#555555`, yellow title `#FFFF00`, 600 ms entrance, 5 s hold | face `#221D18`, gold title `#FFD25A` | keep the gold; adopt the game's durations (600 ms / 5 s) |
| Text field | black background, `#A0A0A0` outline, white outline on focus | `--field`, `--field-edge` | identical in practice |
| Text | white, shadow = text × 0.25 per channel | headings: same rule; reading text without shadow, in sans-serif | intended departure (“modern”) |
| Title | `/title`: ×4, centered, drop shadow | 40 px h1 with a 5 px shadow | identical in spirit |
| Color codes | 16 chat colors (§0 to §f) | `--c-name`, `--c-lore`, `--c-blue`, `--c-green`, `--c-gold` | reuse the 16 colors **as is** for player and world names, with the contrast check (§ 4.3) |

The two departures we keep each have a reason:
- **Copper for the primary action** (the game has none): readability and guiding the eye.
- **Ember instead of purple** in tooltips: we avoid copying the most distinctive sign.

The switch was made in `film.css :root` (seven variables, plus the gray buttons' text shadow `#3F3F3F`, white × 0.25) and propagates to every component.

---

## 4. Colors

### 4.1 Base palette (night, in production)

| Token | Value | Role |
|---|---|---|
| `--night` | `#14110E` | page background |
| `--night-2` | `#1F1A15` | dark panel background |
| `--night-3` | `#2E2822` | card background, separators |
| `--text` | `#F4EFE6` | main text (≥ 15:1) |
| `--text-2` | `#C9C1B4` | secondary text (≥ 9.6:1) |
| `--text-3` | `#9D958A` | meta, help |
| `--outline` | `#0A0806` | 1 gp outline |
| `--hover` | `#FFF4E0` | hover outline, focus ring |

### 4.2 Materials

| Material | Tokens | Use |
|---|---|---|
| Stone | `--stone-hi/stone/stone-lo` | buttons, slots |
| Copper | `--copper-hi/copper/copper-lo` | primary button (one per area) |
| Light panel | `--panel-hi/panel/panel-lo`, `--panel-ink` | inventory-style containers |
| Ember | `--ember #FFB347`, `--ember-deep #E07B24`, `--gold #FFD25A` | accent: hover, open state, notification titles |

### 4.3 Game colors for content

Player, world and item names and chat messages use the game's colors:

| Code | Value | Code | Value |
|---|---|---|---|
| §0 black | `#000000` | §8 dark gray | `#555555` |
| §1 dark blue | `#0000AA` | §9 blue | `#5555FF` |
| §2 dark green | `#00AA00` | §a green | `#55FF55` |
| §3 dark aqua | `#00AAAA` | §b aqua | `#55FFFF` |
| §4 dark red | `#AA0000` | §c red | `#FF5555` |
| §5 dark purple | `#AA00AA` | §d light purple | `#FF55FF` |
| §6 gold | `#FFAA00` | §e yellow | `#FFFF55` |
| §7 gray | `#AAAAAA` | §f white | `#FFFFFF` |

Contrast rule: on a dark background, only the light colors (§7, §a to §f; check §9, which is weaker) pass 4.5:1. The dark ones (§0 to §6, §8) are only for decoration or paired with an icon or label. On a light panel, white and yellow are forbidden (1.6 to 1.7:1).

States: error `--bad #FF9A8C` (8.9:1), success `--c-green`, warning `--gold`, info `--c-blue`. Never use color alone to carry meaning: always add an icon or a word.

---

## 5. Typography: two voices, one modern and one from the game

Since v1.1 (30/10/2026), the site is no longer entirely in the game font: at 16 px over long paragraphs it is tiring and looks like a toy. We keep the game font for what **titles and controls**, and a modern sans-serif for what **is read**.

| Role | Font | Where |
|---|---|---|
| Game voice | **MM Minecraft** (the game's font), bold for headings | logo, H1 to H3, buttons, bar labels, film HUD and text, numbers |
| Reading voice | **Atkinson Hyperlegible Next** (OFL, self-hosted, already in the repo) | lead, paragraphs, step cards, FAQ, lists, footer, help and error text |
| Labels | Atkinson bold, 13 px, capitals, 0.08 em letter spacing | “Minecraft Java mod · beta” badge |
| Korean, Japanese | Unifont (OFL) everywhere, as before | no CJK glyphs in Atkinson |
| “Readable font” option | Atkinson for everything, film included | unchanged |

A single token changes the reading font: `--ds-f-text` (`tokens.css`). A more modern replacement candidate if we want to go further: Inter or Geist (OFL), to self-host; not done here, as it needs a font file added.

Game voice scale (the font is an 8-texel pixel: only multiples of 8 are crisp):

| Level | Size / line height | Text shadow | Use |
|---|---|---|---|
| H1 | 32/40, 40/48 from 640 px | 3 px, 4 px | page title |
| H2 | 32/40 | 3 px | section title |
| H3 | 24/32 | 2 px | card or step title |
| Button, label | 16/18 | 2 px | controls |

Reading voice scale:

| Level | Size / line height | Use |
|---|---|---|
| Lead | 18/1.6, 20 px from 1,000 px | under the H1 |
| Section text | 18/1.6 | paragraphs |
| Body text | 16/1.5 | cards, FAQ (answer), lists, footer |
| FAQ question | 18 bold, 1.35 | |

Rules: nothing above 40 px (game voice) outside the film; 58-character measure; **no pixel shadow on reading text**; never synthesized bold or italic for the game voice (the game has no italics); heading shadow = text color × 0.25 per channel, softened (2 to 4 px instead of 3 to 5); no decorative capitals outside labels.

---

## 6. Grid, spacing, scale

- **GUI pixel** `--gp` = 2 px. Every border, bevel and offset is a multiple of `--gp`. No rounding, no blur.
- **Spacing**: 4 px steps (`--ds-sp-1` to `-8`: 4, 8, 12, 16, 24, 32, 48, 64). **Vertical rhythm**: 24 px (`--ds-gap`) between a heading and its content and between two blocks; 12 px between two FAQ rows; a section has 32 px top and bottom margin (40 px from 640 px), so 64 px (80 px from 640 px) between two sections. Nothing else: no component-specific margins.
- **Targets**: anything tappable is at least 44 px tall (`--ds-hit`).
- **Width**: text at 58 characters; content centered, never full width on large screens.
- **Breakpoints**: 640, 900, 1,000 px; mobile first (390 px reference).
- **No rounded corners.** Corners are square or notched (a ring without corners, as in the game's code).

---

## 7. Components: from the game to the site

| Game component | Our component | Class | Rules |
|---|---|---|---|
| Gray button | Button | `mc-btn` | 44 px, relief, hover = light outline + 1 px up, press = pressed-in relief |
| “Done” button | Primary button | `mc-btn--primary` | copper; one per area |
| Inventory panel | Panel | `mc-panel`, `mc-panel--dark` | notched corners, title in `--panel-ink` |
| Hotbar | Hotbar | `mc-hotbar` | nine slots; selection by white frame; key number |
| Tooltip | Tooltip | `mc-tip`, `mc-hovertip` | name in aqua, description in light purple, facts in gray; ember border |
| Chat message | Chat | `mc-chat` | one line per event, game text |
| Name tag | Tag | `mc-nametag` | 25% black background |
| Text field | Field | `mc-field` | black background, gray outline, white outline on focus |
| Checkbox, option | Option | `mc-check`, `mc-check--radio` | 44 px row |
| Recipe (3×3 grid) | Steps | `mc-recipe`, `mc-step` | to explain how something works |
| Progress bar | Bar | `mc-bar` | green fill like XP |

Any new component must answer: which game element does it resemble? If it has none, it is probably decoration we can remove.

---

## 8. Images, icons, illustrations

- **Icons**: pixel SVG (`public/hero/mcui/icons/`), `image-rendering: pixelated`, `shape-rendering: crispEdges`. 16- or 8-pixel grid, a single 2 px stroke. No generic library icons.
- **Game items** (bone, ember, journal): drawn by us in the spirit of the items, never copied.
- **World captures**: they are the content. Always crisp pixels (`image-rendering: pixelated` when enlarged), no filter, no rounded border. Caption in the spirit of a tooltip.
- **Background**: 25% black veil over a blurred capture, like the game menu since 1.20.5.
- **Forbidden**: stock photos, smooth vector illustrations, 3D that does not come from a capture, real Mojang screenshots.

---

## 9. Motion and sound

Motion serves to **confirm** (I clicked, it responds), **orient** (it comes from here) and **give weight** (one pixel at a time). It does not decorate.

### Tokens
| Token | Value | Use |
|---|---|---|
| `--ds-dur-1` | 120 ms | hover, press (press is twice as fast: 60 ms) |
| `--ds-dur-2` | 200 ms | state change: opening, color, icon |
| `--ds-dur-3` | 360 ms | block entering on scroll, panel opening |
| `--ds-dur-4` | 560 ms | hero entrance on load (once) |
| `--ds-ease` | `cubic-bezier(.2,.8,.2,1)` | soft arrival (default) |
| `--ds-ease-std` | `cubic-bezier(.4,0,.2,1)` | there and back |
| `--ds-ease-pop` | `cubic-bezier(.34,1.56,.64,1)` | 6% bounce: badges, icons, numbers, **never** a block of text |
| `--ds-lift` | 2 px | button lift |

### Catalog (every interactive or appearing element)
| Element | Motion |
|---|---|
| Hero on load | kicker, title, lead, buttons and notice arrive one after another (12 px + fade, 60 ms stagger) |
| Section titles | stepped left-to-right wipe (12 steps, like text being typed) when entering the screen |
| Content blocks | 12 px + fade on scroll, once, siblings staggered by 60 ms |
| Button | hover: rises 2 px + light outline; press: drops 1 px, 60 ms; the ember icon grows 20%, arrows move forward 3 px |
| Link | the underline moves away from the text (3 px → 6 px) |
| Step card | the number “drops” into place with a bounce on entrance, then grows 8% when the card is hovered or focused |
| FAQ, step details, footer, “The film, in words” | height animates (360 ms) and content fades in; the chevron rotates with a bounce |
| FAQ (additionally) | only one question open at a time (`name` attribute); a copper edge unfolds on the open card; the answer rises after opening; the question moves forward 4 px on hover and sinks one pixel on press; the chevron dips on hover before flipping |
| Disclosure summaries | copper color and 4 px shift on hover, one-pixel press |
| Language list (the bar's picker) | the list opens by dropping 8 px while fading in (200 ms), game style (night background, relief), the active option outlined like a game button, the current one in ember with a check; the chevron flips |
| Header menus and the phones' panel | drop 8 px while fading in; the close cross arrives with a bounce |
| Film bar (right edge) | during the film only (it disappears on the slide to the site); vertical timeline: ember fill and handle that follow the film's time (full on the site); five chapter markers with tooltips; dragging moves the handle and the film jumps **only once**, on release (anti-flash safeguards); keyboard: up / down = previous / next chapter, Home, End |
| Map, while reading the site | it **continuously** follows the space the text leaves (measured on every scroll, 0.18 s exponential smoothing, reframing without restarting an animation) and sits 28 px **under** the text (the page is above the canvas); the first measurement is taken before the end-of-film slide, so the map arrives directly at its final place |
| End of film → site | the map shrinks at a constant rate (constant size ratio) and moves toward the panel like a camera pulling back around a fixed point; 1.8 s instead of 1.2 s; reframing the map when the text changes width: 1.1 s, symmetric curve |
| Notifications | 600 ms entrance and exit, 5 s hold (game values) |

### Rules
- **Transform and opacity only** (plus `clip-path` for the wipe, and `block-size` for panels): never a jumping width, margin or position.
- **Never vary brightness**: no more than 2 flashes per second. Nothing loops under the film.
- **Stepped** for anything that moves across a distance (`steps(n)`): an object advances one pixel at a time. Opacity stays continuous.
- The film canvas and its HUD are never animated by the guidelines.
- **Reduced motion** (system or footer option): no animation, no movement, not even on hover; content is there immediately. The motion code only exists behind `prefers-reduced-motion: no-preference` and the option, and a guidelines test checks it.
- **Progressive enhancement**: the panel opening animation (`::details-content`) needs a recent Chrome; elsewhere it opens without animation, without breaking anything.
- **Sound**: no sound by default, never autoplay, game sounds are not reused.

---

## 10. Tone of voice

The site speaks like the game: short, concrete, present tense.

- **Game chat**: the landing's lines come from the real chat (“Minemories: world capture done.”). When a line exists in the mod, the site reuses it verbatim. *To decide with Bréval: the mod still shows “AFK memory saved locally.”*
- **Buttons**: a verb (“Install”, “Capture”, “Share”), no period.
- **Headings**: at most 6 words per line; natural when spoken; no literary turns of phrase.
- **Errors**: say what happened and what to do, without jargon or capitals.
- **Informal “you”** (French *tu*), like the game; gender-neutral wording.
- **11 languages**: translated by a person who speaks the language, not word for word. Proper nouns and parameters preserved.

---

## 11. Accessibility (non-negotiable, even if the game does not do it)

The game is not an accessibility reference: several of its colors do not pass 4.5:1. We keep the spirit and fix the contrast.

- Text ≥ 4.5:1 (the weakest today: primary button, 5.87:1); large text ≥ 3:1.
- Visible focus everywhere: 2 px light ring, offset by 2 px.
- Tab follows DOM order; skip link first.
- 44 px targets.
- “Readable font” option; “Reduced motion” option; `<html lang>` kept up to date.
- No information carried by color alone.
- Everything doable with a mouse is doable with the keyboard (the 3D viewer included).

---

## 12. Rights and notices (to respect; this is not legal advice)

Minecraft's usage guidelines (read on 23/10/2026) say in substance:

- the brand covers “logos, fonts, textures, and any other distinctive characteristics”;
- we must do nothing that suggests it is official, approved, endorsed or associated;
- the Minecraft name must never dominate, and no brand element goes into a logo;
- we must say **who is responsible** and **how to contact them**;
- a “similar” notice must be prominently displayed: **“NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT”**, on the site and on materials.

Consequences for the guidelines:

1. Never a texture, sprite, sound, logo, title screen, panorama or inventory reproduced in full.
2. **Font**: “MM Minecraft” is derived from the game's font (extracted from the atlases). It was accepted “as is” for the prototype, but it is a Mojang file: **to replace or get approved before any public launch**. The replacement plan exists (`assets/mc/MANIFEST.json`, `mcFont` key): the advance widths are the contract, so replacing it moves no layout. Independent alternatives: Pixel Operator (CC0), Departure Mono and Pixelify Sans (OFL). Monocraft is excluded.
3. **Loading screen** (`apps/web/index.html`, blocks `boot:begin` to `boot:end`, generated by `node scripts/boot-screen/gen.mjs`): since 08/11/2026 a world-loading screen (dirt background, chunk map with its percentage, block-by-block reveal of the film) that uses **no game texture**: the dirt tile is our own procedural 16 × 16 pattern (seeded PRNG, colours sampled from a screenshot), the map is drawn by our script. The percentage still uses the "MM Minecraft" font (item 2). **To validate before the public launch**: the screen deliberately recreates the *look* of the game's world-loading screen at Andy's request (08/11/2026), which the table at the top (level 3) and the "Don't" list forbid; its 1.1 s reveal is also longer than the 360 ms of the "Don't" list. It is an exception to decide with Bréval, not a precedent. The previous loader (Steve mining an ore block, with real Mojang textures: the Steve skin, the iron pickaxe, the diamond and the breaking stages, kept by Andy on 30/10/2026) is archived in `scripts/boot-screen/legacy/` and no longer shipped.
4. Logo: our own pixel-art camera on a tripod (sources in `design/logo/`, web and mod icons rebuilt by `bun run brand:icons`). The whole logo, tripod included, stands alone (without the word) in the site header and the landing bar, and makes the favicon, the touch and app icons and the link preview; the square mark (the camera's head) stands before the word Minemories in the footer and makes the mod icon. No beveled stone letters.
5. The “not official” notice appears in the footer of every page, not just the landing.
6. How close the name “Minemories” is to “Minecraft” is a question for Andy and Bréval (the guidelines target “confusingly similar” names); it is not covered here.

---

## 13. Applying the guidelines page by page

Since 30/10/2026, only the `/` landing (and a 404 page) is online: all other pages are archived (tag `archive/pages-v1-2026-10-30`) and audited in `docs/features/pages-archive-and-audit.md`, which proposes the site map to rebuild (8 pages) and the rebuild order. The table below describes the target.

A page adopts the guidelines by: (1) putting `.ds-page` on its root; (2) using only `mc-*` classes; (3) loading `tokens.css` + `film.css` + `charter.css` (currently injected by `HeroFilm`, to be moved into a shared `DesignSystemStyles` when the second page is migrated); (4) defining no hard-coded sizes.

| Page | Game screen evoked | Components |
|---|---|---|
| Landing `/` | title screen + cinematic | already in production. The “What Minemories doesn't do” section (gold frame) was removed; its four limits (not a backup, nothing before the mod, one AFK capture every 4 h, Java 1.21.1 in beta) still need saying elsewhere if needed (FAQ, installation page) |
| Guides (`/installation`, `/how-it-works`, `/faq`…) | book, help screen | `mc-step`, `mc-faq`, `mc-recipe`, `mc-section` |
| Discovery (`/explore`) | world selection | world row: square thumbnail, name in white, detail in gray, button on the right |
| Long texts (`/privacy`, `/terms`) | signed book | `mc-prose`, 58-character measure |
| Sign-in, sign-up, account | settings screen | `mc-form`, `mc-field`, `mc-check`, `mc-select`, a single primary button |
| Gallery, sharing | capture album | grid of slots, tooltip-style caption on hover and focus |
| 3D viewer | the game itself | keeps its own interface: `mc-hotbar`, `mc-dock`, `mc-panel`, `mc-btn--icon` |
| Administration, moderation | command screen | `mc-panel--dark`, dense 16/24 table, no animation |

For any new page, answer in order: which game screen does this page evoke? Which components from § 7? What is the single primary button? What is visible without JavaScript?

---

## 14. Do / don't

**Do**
- Measure in multiples of `--gp`.
- Put a text shadow (text × 0.25) under any light text on a dark background.
- Use only one primary button per area.
- Write in the tone of the game chat.
- Check the contrast of every new color.
- Test at 390, 820 and 1440 px, and with “reduced motion”.

**Don't**
- Rounded corners, blurred shadows, gradients, frosted glass, three-column cards, emoji, library icons, stock photos.
- Font sizes outside the scale (16, 24, 32, 40) or synthetic bold / italic.
- Color alone for meaning; white or yellow text on a light panel.
- Reproduce Minecraft's title screen, inventory, loading screen or logo.
- Pulsing yellow splash text (too recognizable), sound or music by default.
- Animations longer than 360 ms, or anything moving inside a block of text already displayed.

---

## 15. Decisions to make

1. ~~Bringing the grays closer~~: done (buttons, panels, slots, disabled).
2. **Game font**: keep “MM Minecraft” in public production, or replace it (Pixel Operator) before launch? A legal decision, not a design one.
3. **Primary button**: keep copper (recommended) or go gray like the game?
4. **Mod chat line**: align “AFK memory saved locally.” with the film's line (with Bréval).
5. **`/design` page**: create the component showcase page during the first migration (recommended).
6. **16 px body text on large screens**: readable but small at 1,920 px; the crisp alternative with the pixel font is 24 px, not 20 px.

## 16. Sources

- Vanilla interface measurements and rights: `docs/marketing/v0/hero/direction-da-v7.md` (local, outside the public repo).
- Tokens and components: `apps/web/src/hero/tokens.css`, `film.css`, `charter.css`; audit and captures: [design-system.md](design-system.md).
- Minecraft usage guidelines: https://www.minecraft.net/en-us/usage-guidelines
