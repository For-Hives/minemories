// Minemories · film HUD v9 (24/10/2026): the story goes through the game's own interface. Chat at the bottom left, typing bubble above the player's head,
// held menu screen, /title lines, the real hotbar. Documents: ../hero/decisions-v9.md (rules), ../hero/ui-spec-v8.md (drawing), PAGE-API.md (page contract).
//
// Two parts:
//  1. PURE (no DOM, importable under Node: tests H1): `makePlan`, `chaptersAt`, `hudAt`, `typingAt`, `menuAt`, text helpers (graphemes, columns, wrapRows,
//     typedChars, typedRows), `announceSchedule`, `stationList`, `chapterList`, `holdList`, `readingNeeds`. The HUD state is a pure function of the film time
//     (and of the phase: on the site, `hudAt` shows nothing).
//  2. DOM (`createHud`): applies `hudAt` to the `[data-hud]` elements (class `.is-on`, fades are CSS transitions), places the bubble and the held screen once
//     at opening from the scene's anchors, drives the cursor, announces to screen readers.
// Every visible string goes through the i18n catalogue (keys = English source text, `{name}` = "Efe"): the pure part receives `t`, it never imports i18n.js.
// The dates come from `STORY.cues` (scene) when exported, otherwise from LOCAL_CUES, the local copy of the same table (decisions-v9 section 10.1).
// No text is ever drawn in the canvas.
import { FILM_HOTBAR, selectSlot } from './mcui/hotbar.js'

// ---------------------------------------------------------------------------------------------------------------
// Texts: English source keys of the catalogues (web/i18n/en.json)
// ---------------------------------------------------------------------------------------------------------------

/** Chat and speech keys. `{name}` is always the player's name (config.playerName, "Efe"). */
export const KEY = Object.freeze({
	join: '{name} joined the game',
	quit: '{name} left the game',
	chat: '<{name}> {message}',
	typed: "stay, I'll be back soon...",
	mod: 'Minemories: AFK memory stored locally.',
	afkHelp: 'AFK: you have not touched the game for 5 minutes. Locally: on your computer.',
	speech: '{name}: {message}',
	gaze: 'The dog turns to you, sad, then lies down.',
	joy: '{name} is back. The dog jumps up and celebrates.',
	menu: Object.freeze(['Back to Game', 'Options...', 'Save and Quit to Title']),
})

/** The two /title blocks (v12: "show, don't tell", the film tells the story alone; only the hook and the ending say the product): the keys of their title line(s)
 *  then of their subtitle line(s), in reading order. */
export const TITLE_LINES = Object.freeze({
	't-evenings': Object.freeze({ title: Object.freeze(['There are evenings']), sub: Object.freeze(['we wish we could keep.']) }),
	't-keep': Object.freeze({ title: Object.freeze(['That evening']), sub: Object.freeze(['was kept by Minemories.']) }),
})

/** Keys of the five film chapters (keys 1 to 5 of the keyboard), in order. */
export const CHAPTER_TITLES = Object.freeze(['The evening', 'Leaving', 'The wait', 'The kept memory', 'The return'])

/** Every English key the film HUD reads: tests check them in all catalogues. */
export function filmKeys() {
	const keys = new Set([KEY.join, KEY.quit, KEY.chat, KEY.typed, KEY.mod, KEY.afkHelp, KEY.speech, KEY.gaze, KEY.joy, ...KEY.menu, ...CHAPTER_TITLES])
	for (const t of Object.values(TITLE_LINES)) for (const k of [...t.title, ...t.sub]) keys.add(k)
	for (const item of FILM_HOTBAR) keys.add(item.name)
	for (const k of ['Chapter {n}: {title}', 'Film step {n} of {total}', 'Pause the film', 'Play the film', 'Skip the film', 'Previous', 'Next', 'Film chapters (keys 1 to 5)']) keys.add(k)
	return [...keys]
}

// Local copy of STORY.cues (decisions-v9 section 10.1): same shape, same values. Replaced by M.STORY.cues as soon as the scene exports it (test cues-equiv).
export const LOCAL_CUES = Object.freeze([
	{ id: 'join', kind: 'line', tone: 'join', at: 0.2 },
	{ id: 'mod', kind: 'line', tone: 'mod', at: 10.5, option: 'modchat' },
	{
		id: 'say',
		kind: 'say',
		arms: [14.4, 17.8],
		open: 14.55,
		send: 17.65,
		keys: [14.65, 14.74, 14.83, 14.92, 15.01, 15.1, 15.4, 15.48, 15.56, 15.64, 15.72, 15.8, 15.88, 15.96, 16.04, 16.12, 16.2, 16.3, 16.39, 16.48, 16.57, 16.66, 16.75, 16.9, 16.99, 17.15, 17.3, 17.45],
	},
	{
		id: 'menu',
		kind: 'gui',
		hands: [18.15, 21.4],
		open: 18.3,
		close: 21.4,
		// `idle` is a point, not a button: the cursor waits there (just below the panel, on the right), then slides straight to `quit` (the right end of its button).
		items: { idle: [0.55, 1.14], resume: [0, -0.6], options: [0, 0], quit: [0.72, 0.6] },
		panels: [[18.3, 'pause']],
		path: [[18.3, 'idle'], [19.1, 'idle'], [20.1, 'quit'], [21.4, 'quit']],
		hover: [[19.7, 21.15, 'quit']],
		press: [[21.15, 21.3, 'quit']],
	},
	{ id: 'quit', kind: 'line', tone: 'quit', at: 21.4 },
	{ id: 'gaze', kind: 'story', event: 'dog.gaze', at: 22.2 },
	{ id: 'lie', kind: 'story', event: 'dog.lie', at: 24.7 },
	{ id: 'return', kind: 'story', event: 'player.return', at: 45.8 }, // v9d: 0.5 s after the cut to the tight shot (45.3 s): the bench is empty, then Efe appears with this line
	{ id: 'joy', kind: 'story', event: 'dog.joy', at: 47.8 },
])

// Dates of the scene the page derives titles, holds and stations from (v9 values; the page reads the real ones from M.BEATS / M.TIMELINE).
export const LOCAL_REF = Object.freeze({
	duration: 60,
	diorama: 52.5,
	siteStart: 55.5, // STORY.site.start: the film hands over to the site
	chatOff: 24.7, // the promise and the leaving lines go out together
	joinOff: 3.5, // the arrival line
	holdAt: Object.freeze({ capture: 10.6, keep: 51.8 }),
	holdWall: Object.freeze({ capture: 1.2, keep: 2.2 }),
})

const r2 = (x) => Math.round(x * 100) / 100
/** Seconds the arrival line of the return stays up (the first arrival line stays 3.3 s). */
export const REJOIN_LIFE = 3.3
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

// ---------------------------------------------------------------------------------------------------------------
// Plan: every text window, derived from the cue table and the scene dates
// ---------------------------------------------------------------------------------------------------------------

// /title (v12: two blocks, the hook and the ending): 0.5 s in, 1.0 s out (0.5 s for the ending). Lengths in film seconds; the start comes from the story.
const TITLE_DEFS = [
	{ id: 't-evenings', plaque: 0.78, out: 1.0, len: 4.5 },
	{ id: 't-keep', plaque: 0.78, out: 0.5, len: 2.7 }, // out 0.5: the title is gone by 55.0, before the crane shows the model (artistic control correction 13)
]

export function makePlan(cues = LOCAL_CUES, ref = LOCAL_REF) {
	const by = Object.fromEntries(cues.map((c) => [c.id, c]))
	const { join, mod, say, menu, quit } = by
	const back = by.return
	const chatOff = ref.chatOff ?? r2(quit.at + 3.3)
	const joinOff = ref.joinOff ?? r2(join.at + 3.3)
	const chat = [
		{ id: 'join', tone: 'join', on: join.at, off: joinOff, out: 0.15 },
		...(mod ? [{ id: 'mod', tone: 'mod', on: mod.at, off: say.open, out: 0, option: mod.option }] : []),
		// The promise stays above the leaving line (as in the real chat, where a line lives 10 s); both go out together (0.3 s fade).
		{ id: 'say', tone: 'player', on: say.send, off: chatOff, out: 0.3 },
		{ id: 'quit', tone: 'quit', on: quit.at, off: chatOff, out: 0.3 },
		// v9c (blind test: "nothing shows that Efe comes back"): the game's own arrival line when he reappears, same format as the first one ({name} joined the game).
		// It is the game's system message, not a block of the story: like the hotbar it is never counted among the story blocks (`system: true` in `blocks`), so it may stand
		// while T4 is lit (documented exemption, decisions v9c).
		...(back ? [{ id: 'rejoin', tone: 'join', on: back.at, off: r2(back.at + REJOIN_LIFE), out: 0.15 }] : []),
	]
	// Story blocks for chaptersAt: the bubble and its line carry the same chapter (one message, typed then sent).
	const blocks = [
		{ id: 'join', on: join.at, off: joinOff },
		...(mod ? [{ id: 'mod', on: mod.at, off: say.open, option: mod.option }] : []),
		{ id: 'say', on: say.open, off: chatOff }, // bubble, then the sent line, then (nested) the leaving line: one block
		{ id: 'quit', on: quit.at, off: chatOff, nestedIn: 'say' },
		// v9c: the arrival line of the return: listed so that the tools see it, but a system message (see `chat` above), not a block of the story: tests and the readability copy exempt it.
		...(back ? [{ id: 'rejoin', on: back.at, off: r2(back.at + REJOIN_LIFE), system: true }] : []),
	]
	const titleOn = {
		't-evenings': r2(joinOff + 0.15),
		't-keep': ref.holdAt.keep,
	}
	const titles = TITLE_DEFS.map((d) => ({ id: d.id, plaque: d.plaque, out: d.out, on: titleOn[d.id], off: r2(titleOn[d.id] + d.len) }))
	for (const t of titles) blocks.push({ id: t.id, on: t.on, off: t.off })
	return Object.freeze({ cues, by, chat, blocks, titles, menu, ref, hotbar: [join.at, quit.at], chatOff })
}

export let PLAN = makePlan()
export function setPlan(plan) {
	PLAN = plan
}

// ---------------------------------------------------------------------------------------------------------------
// Pure functions of the film time
// ---------------------------------------------------------------------------------------------------------------

// The hotbar wheel: slot 4 (campfire) until he leaves the fire for the bench, then three notches 4 -> 3 -> 2 -> 1 (the bone).
export const HOTBAR_WHEEL = Object.freeze([5.75, 5.85, 5.95])
export const hotbarSelected = (t) => 4 - HOTBAR_WHEEL.filter((at) => t >= at).length

// Story blocks (data-chapter) lit at time t. opts: { plan, modchat (false: the mod line is removed), site (true: nothing) }.
export function chaptersAt(t, opts = {}) {
	const plan = opts.plan ?? PLAN
	const on = new Set()
	if (opts.site) return on
	for (const b of plan.blocks) {
		if (b.option === 'modchat' && opts.modchat === false) continue
		if (t >= b.on && t < b.off) on.add(b.id)
	}
	return on
}

// Hearts over the dog while it celebrates (final pass, artistic control idea A): the game's own language for affection. One cloud, once: eight hearts, one every
// 0.2 s from 47.95 s, each rising for 1.0 s; the last is gone at 50.35 s, before the band is replayed at 50.5 s. Pure in the film time: k is the age (0 to 1) of each
// living heart, dx its drift (a fraction of the head width), both fixed per heart.
export const HEARTS = Object.freeze({ from: 47.95, every: 0.2, life: 1.0, dx: Object.freeze([-0.55, 0.45, -0.1, 0.65, -0.4, 0.2, 0.55, -0.7]) })
export function heartsAt(t) {
	const out = []
	for (let i = 0; i < HEARTS.dx.length; i++) {
		const age = (t - (HEARTS.from + i * HEARTS.every)) / HEARTS.life
		if (age >= 0 && age < 1) out.push({ i, k: +age.toFixed(4), dx: HEARTS.dx[i] })
	}
	return out
}

// Typing: n = keys pressed at t, instantaneous rate (c/s) and "runaway" level (0: < 8 c/s, 1: 8-12, 2: >= 12). The typed TEXT is the DOM layer's (language).
export function typingAt(t, opts = {}) {
	const plan = opts.plan ?? PLAN
	const c = plan.by.say
	if (!c || t < c.open || t >= c.send) return null
	let n = 0
	while (n < c.keys.length && c.keys[n] <= t) n++
	// Same rule as cuesAt (scene): rate = 1 / interval of the last two keys while the last one is recent (max(0.25 s, 2 intervals)).
	const iv = n >= 2 ? c.keys[n - 1] - c.keys[n - 2] : 0
	const sinceKey = n ? t - c.keys[n - 1] : Infinity
	const rate = n >= 2 && sinceKey <= Math.max(0.25, 2 * iv) ? 1 / iv : 0
	const wild = rate >= 12 ? 2 : rate >= 8 ? 1 : 0
	return {
		id: 'say',
		t,
		n,
		total: c.keys.length,
		caret: Math.floor((t - c.open) / 0.3 + 1e-9) % 2 === 0,
		rate: +rate.toFixed(2),
		wild,
		key: sinceKey < 0.06,
	}
}

const smooth01 = (x) => {
	const u = clamp(x, 0, 1)
	return u * u * (3 - 2 * u)
}

// Held screen: panel, button under the cursor (`item`), hover, press, cursor position (u, v) in [-1 ; 1]^2 of the panel. Same rule as `menuOf` of the scene:
// the cursor follows `path`, smoothed between two points; `hover` and `pressed` are the table's windows. `idle` is a point, never a button.
export function menuAt(t, opts = {}) {
	const m = (opts.plan ?? PLAN).menu
	if (!m || t < m.open || t >= m.close) return null
	let panel = m.panels[0][1]
	for (const [at, name] of m.panels) if (t >= at) panel = name
	const P = m.path
	let item = P[0][1]
	let pos = m.items[item]
	for (let i = 0; i < P.length; i++) {
		const [at, name] = P[i]
		if (t >= at) {
			item = name
			pos = m.items[name]
			const next = P[i + 1]
			if (next && t < next[0]) {
				const k = smooth01((t - at) / (next[0] - at))
				const q = m.items[next[1]]
				pos = [pos[0] + (q[0] - pos[0]) * k, pos[1] + (q[1] - pos[1]) * k]
				item = k >= 0.5 ? next[1] : name
			}
		}
	}
	const inWin = (list) => list.find(([a, b]) => t >= a && t < b)?.[2] ?? null
	return { panel, item, u: +pos[0].toFixed(4), v: +pos[1].toFixed(4), hover: inWin(m.hover), pressed: inWin(m.press) }
}

// HUD state at film time t: { site, chat: id of the bottom line | null, chatAbove: id of the line above | null, typing | null, menu | null, title: id | null,
// hotbar: { on, selected } }. opts: { plan, modchat, site } (site: the visitor is on the site, the HUD is empty from the first frame).
export function hudAt(t, opts = {}) {
	const plan = opts.plan ?? PLAN
	if (opts.site) return { site: true, chat: null, chatAbove: null, typing: null, menu: null, title: null, hotbar: { on: false, selected: 1 }, hearts: [] }
	// The latest line is the bottom one; if it is the leaving line, the promise stays above it (`chatAbove`).
	const lines = plan.chat.filter((l) => !(l.option === 'modchat' && opts.modchat === false) && t >= l.on && t < l.off)
	const chatLine = lines.at(-1)
	const title = plan.titles.find((x) => t >= x.on && t < x.off)
	return {
		site: false,
		chat: chatLine ? chatLine.id : null,
		chatAbove: chatLine?.id === 'quit' && lines.some((l) => l.id === 'say') ? 'say' : null,
		typing: typingAt(t, opts),
		menu: menuAt(t, opts),
		title: title ? title.id : null,
		hotbar: { on: t >= plan.hotbar[0] && t < plan.hotbar[1], selected: hotbarSelected(t) },
		hearts: heartsAt(t),
	}
}

// Host stops in guided playback: [[film time, wall seconds]] (the scene gives them: TIMELINE.signals.holdAt / holdWall).
export function holdList(plan = PLAN) {
	const { holdAt, holdWall } = plan.ref
	return [
		[holdAt.capture, holdWall.capture],
		[holdAt.keep, holdWall.keep],
	]
}

// Reduced-motion stations (decisions-v9 section 11.2): each is ONE instant whose HUD is exactly hudAt(t). R0 1.0 (wide shot, the arrival line), R1 5.5 (T1, the hook),
// R2 10.6 (the freeze: the mod line), R3 17.5 (the bubble is full), R4 20.6 (quit hovered), R5 23.6 (the gaze, lines on), R6 25.9 (lying down), R7 30.8 (the mornings, v12: no title),
// R8 36.8 (the snow, no title), R9 44.0 (the ember, no title), R10 46.8 (v9c: Efe is back, "Efe joined the game", the dog has seen him; v9d: 46.8 instead of 45.8, after the 0.5 s of empty bench, the 0.2 s fade and his turn), R11 48.6 (the party), R12 51.8 (the freeze again, T5).
// "Next" after R12 hands over to the site.
export const STATION_TIMES = Object.freeze([1.0, 5.5, 10.6, 17.5, 20.6, 23.6, 25.9, 30.8, 36.8, 44.0, 46.8, 48.6, 51.8])
export function stationList() {
	return STATION_TIMES.map((t, i) => ({ id: `R${i}`, t }))
}

// Keys 1 to 5: chapter jump instants (film seconds). Titles of the chapters: CHAPTER_TITLES (same order).
export const CHAPTER_TIMES = Object.freeze([
	['evening', 7.9],
	['leaving', 13.35],
	['waiting', 29.4],
	['memory', 41.2],
	['return', 47.8],
])
export function chapterList() {
	return CHAPTER_TIMES.map(([id, t], i) => ({ id, t, title: CHAPTER_TITLES[i] }))
}

// Reading time the readability tool demands: 0.7 s + characters / 12 on a moving image (15 if the stop is at least as long).
export const readingNeeds = (chars, held = false) => 0.7 + chars / (held ? 15 : 12)

// ---------------------------------------------------------------------------------------------------------------
// Screen reader announcements: one role=status region, in the film's order, at least 1.2 s apart
// ---------------------------------------------------------------------------------------------------------------

// 1.35 s of film (the rule is 1.2 s of wall time between two announcements): the margin absorbs a late frame, which put the dog's gaze 1.15 s after the leaving line when measured (technical control D9).
export const ANNOUNCE_GAP = 1.35
// v10 (decisions-v10 section 2.8): the film may be driven by the scroll. An announcement is made only going forward, at 1.5x at most, and 1.35 s of wall time after the previous one; one that is
// held back by the gap is said later only if its element is still on; going backward, after a jump, in the glide or on the site, the queue is emptied and nothing is said.
export const ANNOUNCE_MAX_RATE = 1.5
export const ANNOUNCE_WALL_GAP = 1350 // ms

// [{ id, at, shownAt }] in order. `shownAt` pushes a message back so that two are always >= 1.2 s of film apart (the dog's gaze, 0.8 s after the
// leaving line, would otherwise be dropped). The modchat=0 option removes the mod line.
export function announceSchedule(plan = PLAN, opts = {}) {
	const list = []
	for (const l of plan.chat) {
		if (l.option === 'modchat' && opts.modchat === false) continue
		list.push({ id: l.id, at: l.id === 'say' ? plan.by.say.send : l.on })
	}
	for (const t of plan.titles) list.push({ id: t.id, at: t.on })
	for (const id of ['gaze', 'joy']) if (plan.by[id]) list.push({ id, at: plan.by[id].at })
	list.sort((a, b) => a.at - b.at)
	let prev = -Infinity
	return list.map((a) => {
		const shownAt = r2(Math.max(a.at, prev + ANNOUNCE_GAP))
		prev = shownAt
		return { ...a, shownAt }
	})
}

// The spoken text of an announcement. A title reads its title lines then its subtitles.
export function announceText(id, t) {
	switch (id) {
		case 'join':
		case 'rejoin':
			return t(KEY.join)
		case 'quit':
			return t(KEY.quit)
		case 'mod':
			return `${t(KEY.mod)} ${t(KEY.afkHelp)}` // v9d: the game's line, then what AFK and locally mean (the same words as the tooltip and step 2)
		case 'say':
			return t(KEY.speech, { message: t(KEY.typed) })
		case 'gaze':
			return t(KEY.gaze)
		case 'joy':
			return t(KEY.joy)
		default: {
			const lines = TITLE_LINES[id]
			return lines ? [...lines.title, ...lines.sub].map((k) => t(k)).join(' ') : ''
		}
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Typing and wrapping (graphemes and columns, so that every script behaves)
// ---------------------------------------------------------------------------------------------------------------

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
/** User-perceived characters of a string (an emoji, or a letter and its combining mark, is one). */
export const graphemes = (text) => (segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text))

// East Asian wide: Hangul syllables and jamo blocks, kana, CJK ideographs, full-width forms and CJK punctuation.
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-힣豈-﫿︰-﹯＀-｠￠-￦]/u
/** Columns a grapheme takes in the bubble: 2 for wide (CJK) characters, 1 otherwise. */
export const columnsOf = (g) => (WIDE.test(g) ? 2 : 1)
const breaksBetween = (g) => WIDE.test(g)

/** Number of characters typed after `n` of `K` key presses, for a message of `L` graphemes: the whole text by the last key (floor(n L / K) before). */
export const typedChars = (n, K, L) => (n >= K ? L : Math.max(0, Math.floor((n * L) / K)))

export const SAY_ROW_COLS = Object.freeze({ phone: 12, wide: 18 })

// Greedy wrap by columns. Rows: [{ g: [graphemes], join: 0 | 1 }]; `join` is the space consumed when the row breaks on a space (0 between two CJK characters).
// Break opportunities: spaces, and between two CJK characters. A Latin word is never cut, even if it is wider than a row.
export function wrapRows(text, cols) {
	const units = [] // { g: [graphemes], cols, space }
	let word = []
	let space = false
	const flush = () => {
		if (!word.length) return
		units.push({ g: word, cols: word.reduce((s, x) => s + columnsOf(x), 0), space })
		word = []
		space = false
	}
	for (const g of graphemes(text)) {
		if (g === ' ') {
			flush()
			space = true
		} else if (breaksBetween(g)) {
			flush()
			units.push({ g: [g], cols: columnsOf(g), space })
			space = false
		} else word.push(g)
	}
	flush()
	const rows = []
	let row = { g: [], join: 0 }
	let used = 0
	for (const u of units) {
		const lead = row.g.length && u.space ? 1 : 0
		if (row.g.length && used + lead + u.cols > cols) {
			row.join = u.space ? 1 : 0
			rows.push(row)
			row = { g: [], join: 0 }
			used = 0
		} else if (lead) {
			row.g.push(' ')
			used += 1
		}
		row.g.push(...u.g)
		used += u.cols
	}
	if (row.g.length) rows.push(row)
	return rows
}

/** The bubble text after `n` typed characters: the wrapped rows cut at `n` units (a consumed space counts as one), joined with line feeds. */
export function typedRows(rows, n) {
	let left = n
	const out = []
	for (const r of rows) {
		if (left <= 0) break
		const take = Math.min(left, r.g.length)
		out.push(r.g.slice(0, take).join(''))
		left -= take
		if (take === r.g.length) left -= r.join
		else break
	}
	return out.join('\n')
}

// ---------------------------------------------------------------------------------------------------------------
// DOM: applies hudAt, places the bubble and the held screen, cursor, announcements
// ---------------------------------------------------------------------------------------------------------------

// ctx: { root (element holding the [data-hud]), frameOf(), anchors() -> fresh anchors or null, reduced(), announce(text), modchat, t(key, values),
//        hotbar (the element built by createHotbar), phase() -> 'film' | 'site' }
export function createHud(ctx) {
	const { root } = ctx
	const $ = (sel) => root.querySelector(sel)
	const t = (key, values) => ctx.t(key, values)
	const lineEls = new Map([...root.querySelectorAll('.mc-chat__line[data-chapter]')].map((el) => [el.dataset.chapter, el]))
	const sayEls = new Map([...root.querySelectorAll('.mc-say[data-chapter]')].map((el) => [el.dataset.chapter, el]))
	const titleEls = new Map([...root.querySelectorAll('.mc-titlecmd[data-chapter]')].map((el) => [el.dataset.chapter, el]))
	// Three sparks per bubble (pixel squares) at fixed random places; their rise is --mc-spark-p, a function of the film time (key by key).
	const SPARK = [[10, -4], [46, -6], [82, -4]]
	const sparks = new Map()
	for (const [id, el] of sayEls) {
		const list = SPARK.map(([x, y]) => {
			const sp = document.createElement('i')
			sp.className = 'mc-say__spark'
			sp.style.left = `${x}%`
			sp.style.top = `${y}px`
			el.append(sp)
			return sp
		})
		sparks.set(id, list)
	}
	// Hearts: eight pixel sprites in one layer, placed over the dog's head from the scene's anchors at every frame while any is alive.
	const heartLayer = $('.mc-hearts')
	const heartEls = heartLayer ? [...heartLayer.querySelectorAll('.mc-heart')] : []
	const stage = root.ownerDocument.getElementById('stage') ?? root
	const gui = $('.mc-guiscreen')
	const hotbar = ctx.hotbar ?? $('.mc-hotbar')
	const sayLineText = $('[data-say-text]') // the promise line's own text node: the nested leaving line must survive a relabel
	const cls = (el, name, on) => {
		if (el && el.classList.contains(name) !== on) el.classList.toggle(name, on)
	}

	let state = { site: false, chat: null, typing: null, menu: null, title: null, hotbar: { on: false, selected: 4 } }
	const placed = new Map() // bubble / screen / title -> placed for this lighting
	let lastT = Number.NaN
	let schedule = announceSchedule(PLAN, { modchat: ctx.modchat })
	let lastWall = -1e9
	let pendingSay = null // { id, expires } : due, held back by the wall gap
	const shown = new Set() // reduced-motion announcements already made at this station
	let lastIds = new Set()
	const sayShown = new Map() // id -> typed text last written

	function announce(id) {
		if (ctx.phase?.() === 'site' || !ctx.announce) return
		const text = announceText(id, t)
		if (!text) return
		lastWall = performance.now()
		ctx.announce(text)
	}
	const isLit = (id) => state.chat === id || state.chatAbove === id || state.title === id || state.typing?.id === id
	// A crossing of the schedule going forward: said now, or kept for the next frames when the wall gap since the last one is not over.
	function consider(id, time, o) {
		if (Number.isFinite(o.rate) && o.rate > ANNOUNCE_MAX_RATE) return
		if (performance.now() - lastWall < ANNOUNCE_WALL_GAP) {
			pendingSay = { id, expires: time + 3 }
			return
		}
		announce(id)
	}

	// -- protected areas: heads, the dog's box, the ember, the fire (px of the film layer)
	function protect(a, f) {
		const out = []
		const box = (h, name, m = 8) => h?.visible && h.r > h.l && out.push({ name, l: f.ox + h.l * f.w - m, r: f.ox + h.r * f.w + m, t: f.oy + h.t * f.h - m, b: f.oy + h.b * f.h + m })
		box(a?.player?.head, 'player')
		box(a?.dog?.head, 'dog-head')
		// "Narrow" zones of the readability tool: the player's face +-0.04 H around player.x/y, the dog's head +-0.045 H around dog.x/y.
		const sq = (name, p, r) => p?.visible && out.push({ name, l: f.ox + p.x * f.w - r, r: f.ox + p.x * f.w + r, t: f.oy + p.y * f.h - r, b: f.oy + p.y * f.h + r })
		sq('player-face', a?.player, 0.04 * f.h)
		sq('dog-zone', a?.dog, 0.045 * f.h)
		if (a?.dog?.box?.visible !== false) box(a?.dog?.box, 'dog', 6)
		const e = a?.ember
		if (e?.visible && (e.strength ?? 1) > 0.02) {
			// Same radius as the page audit, with a floor (4 % of the width): the ember brightens during the kept instant, its halo measured at lighting is smaller than 2 s later.
			const rad = Math.max(Number.isFinite(e.size) && e.size > 0 ? e.size : 0, 22, 0.04 * f.w) * 0.75 + 8
			out.push({ name: 'ember', l: f.ox + e.x * f.w - rad, r: f.ox + e.x * f.w + rad, t: f.oy + e.y * f.h - rad, b: f.oy + e.y * f.h + rad })
		}
		if (a?.fire?.visible && a.fire.lit !== false) {
			const rad = 0.035 * Math.hypot(f.w, f.h)
			out.push({ name: 'fire', l: f.ox + a.fire.x * f.w - rad, r: f.ox + a.fire.x * f.w + rad, t: f.oy + a.fire.y * f.h - rad * 1.4, b: f.oy + a.fire.y * f.h + rad * 0.6 })
		}
		return out
	}
	const overlapArea = (r, boxes, skip) => {
		let s = 0
		for (const b of boxes) {
			if (skip && b.name === skip) continue
			const w = Math.min(r.r, b.r) - Math.max(r.l, b.l)
			const h = Math.min(r.b, b.b) - Math.max(r.t, b.t)
			if (w > 0 && h > 0) s += w * h
		}
		return s
	}

	// Typing bubble, stuck to the player's head: its bottom is 14 px above the top of the head (`player.head`), centred on the head, anchored by the BOTTOM (each new
	// row grows upward, never onto the head). Its width FOLLOWS THE TEXT (widest row typed so far + "_", never narrower than four characters). Rows of 18 columns
	// (>= 640 px) or 12 (phone), wrapped once on the whole message in the current language. Only movement rule: if the bubble (at full message) would cover a face,
	// the dog's head or box, the ember or the fire, it slides sideways by the smallest gap that frees the room; decided ONCE at opening, so nothing jumps while typing.
	const rowsMax = (f) => (f.W < 640 ? SAY_ROW_COLS.phone : SAY_ROW_COLS.wide)
	const wrapped = new Map() // id -> { cols, rows, length }
	const wrappedFor = (id) => {
		const cols = rowsMax(ctx.frameOf())
		const hit = wrapped.get(id)
		if (hit && hit.cols === cols) return hit
		const text = t(KEY.typed)
		const next = { cols, rows: wrapRows(text, cols), length: graphemes(text).length }
		wrapped.set(id, next)
		return next
	}
	const chatLine = (typed) => t(KEY.chat, { message: typed })
	const BUBBLE_GAP = 14 // px between the bottom of the bubble and the top of the head
	const bubbleAt = new Map() // id -> { cx, minW, widest }
	const bubbleWidth = (el, typedEl, text) => {
		typedEl.textContent = text
		el.style.removeProperty('--mc-say-w')
		return Math.ceil(el.getBoundingClientRect().width)
	}
	function placeBubble(el, id) {
		const a = ctx.anchors()
		const head = a?.player?.head
		if (!head?.visible) return false
		const f = ctx.frameOf()
		const typedEl = el.querySelector('.mc-say__typed')
		const caret = el.querySelector('.mc-say__caret')
		const keep = typedEl.textContent
		caret.style.display = 'none'
		// Measure: the whole message (a "_" at the end of each row: the caret never widens) and the minimum (four characters).
		const w = wrappedFor(id)
		const fullW = bubbleWidth(el, typedEl, w.rows.map((r) => `${r.g.join('')}_`).join('\n'))
		const fullH = Math.ceil(el.getBoundingClientRect().height)
		const minW = Math.min(fullW, bubbleWidth(el, typedEl, 'rest_'))
		typedEl.textContent = keep
		caret.style.display = ''
		el.style.removeProperty('--mc-say-w')
		const boxes = protect(a, f)
		const bottom = f.oy + head.t * f.h - BUBBLE_GAP
		const cx0 = f.ox + ((head.l + head.r) / 2) * f.w
		const minL = 16
		const maxL = Math.max(16, f.W - 16 - fullW)
		let best = null
		for (const k of [0, 0.05, -0.05, 0.1, -0.1, 0.15, -0.15, 0.2, -0.2, 0.3, -0.3, 0.4, -0.4, 0.5, -0.5, 0.65, -0.65, 0.8, -0.8, 1, -1]) {
			const cx = cx0 + k * fullW
			const l = clamp(cx - fullW / 2, minL, maxL)
			// The player's head and face are not obstacles: the bubble is his speech, set on his head.
			const area = overlapArea({ l, r: l + fullW, t: bottom - fullH, b: bottom }, boxes.filter((b) => b.name !== 'player' && b.name !== 'player-face'))
			if (!best || area < best.area) best = { cx: l + fullW / 2, area }
			if (area === 0) break
		}
		bubbleAt.set(id, { cx: best.cx, minW, widest: minW })
		const parentH = el.offsetParent?.clientHeight ?? f.H
		el.style.top = 'auto'
		el.style.bottom = `${Math.round(parentH - bottom)}px`
		return true
	}
	// At each key: width = widest row typed (never shrinks), centre unchanged.
	function sizeBubble(el, id) {
		const at = bubbleAt.get(id)
		if (!at) return
		const f = ctx.frameOf()
		const typedEl = el.querySelector('.mc-say__typed')
		const w = Math.max(at.widest, bubbleWidth(el, typedEl, typedEl.textContent))
		at.widest = w
		el.style.setProperty('--mc-say-w', `${w}px`)
		el.style.left = `${Math.round(clamp(at.cx - w / 2, 16, Math.max(16, f.W - 16 - w)))}px`
	}

	// Held screen: first free candidate among (1) centred on `player.front` (in front of the chest), (2) above the head, (3) the free zone opposite the ember. Never on a
	// face, a head, the dog's box, the ember or the fire. Placed ONCE at opening. The box is measured after the labels are translated (it grows with them).
	function placeGui(el) {
		const a = ctx.anchors()
		if (!a?.player?.visible) return false
		const f = ctx.frameOf()
		const w = el.offsetWidth
		const h = el.offsetHeight
		const boxes = protect(a, f)
		const head = a.player.head?.visible ? a.player.head : null
		const front = a.player.front?.visible ? a.player.front : null
		const fx = front ? f.ox + front.x * f.w : f.ox + a.player.x * f.w
		const fy = front ? f.oy + front.y * f.h : f.oy + a.player.y * f.h
		const cands = [{ name: 'front', cx: fx, cy: fy }]
		if (head) for (let k = 0; k <= 10; k++) cands.push({ name: 'above', cx: f.ox + ((head.l + head.r) / 2) * f.w, cy: f.oy + head.t * f.h - 10 - h / 2 - k * 12 })
		const fr = a.free?.best ? a.free[a.free.best] : null
		if (fr) cands.push({ name: 'free', cx: f.ox + ((fr.l + fr.r) / 2) * f.w, cy: f.oy + ((fr.t + fr.b) / 2) * f.h })
		const emberX = a.ember?.visible ? f.ox + a.ember.x * f.w : null
		let best = null
		for (const c of cands) {
			const l = clamp(c.cx - w / 2, 16, Math.max(16, f.W - 16 - w))
			const top = clamp(c.cy - h / 2, (f.top ?? 0) + 8, Math.max(8, f.H - 16 - h))
			const rect = { l, r: l + w, t: top, b: top + h }
			const area = overlapArea(rect, boxes) + (emberX !== null && c.name === 'free' && Math.abs(emberX - c.cx) < w ? 1 : 0)
			if (!best || area < best.area) best = { l, t: top, area, name: c.name }
			if (area === 0) break
		}
		el.style.left = `${Math.round(best.l)}px`
		el.style.top = `${Math.round(best.t)}px`
		el.dataset.place = best.name
		return true
	}

	function setBubble(id, el, ty, reduced) {
		const wanted = Boolean(ty && ty.id === id)
		if (!wanted) {
			placed.delete(id)
			bubbleAt.delete(id)
			cls(el, 'is-on', false)
			return
		}
		// The text is hudAt's (n key presses): in reduced motion a station always lands on the full bubble.
		const w = wrappedFor(id)
		const typedText = typedRows(w.rows, typedChars(ty.n, ty.total, w.length))
		if (sayShown.get(id) !== typedText) {
			sayShown.set(id, typedText)
			el.querySelector('.mc-say__typed').textContent = typedText
			if (placed.has(id)) sizeBubble(el, id)
		}
		el.querySelector('.mc-say__caret').dataset.on = reduced || ty.caret ? '1' : '0'
		el.dataset.wild = reduced ? '0' : String(ty.wild)
		el.style.setProperty('--mc-say-step', !reduced && ty.key && ty.wild > 0 ? '1' : '0')
		// Sparks (>= 12 c/s): the k-th last key makes spark k rise from 0 to 1 in 0.3 s.
		const c = PLAN.by[id]
		const list = sparks.get(id)
		for (let k = 0; k < list.length; k++) {
			const keyT = c.keys[ty.n - 1 - k]
			const p = reduced || keyT === undefined ? 1 : clamp((ty.t - keyT) / 0.3, 0, 1)
			list[k].style.setProperty('--mc-spark-p', p.toFixed(3))
		}
		if (!placed.has(id) && placeBubble(el, id)) {
			placed.set(id, true)
			sizeBubble(el, id)
		}
		cls(el, 'is-on', placed.has(id))
	}

	function setGui(m) {
		if (!gui) return
		if (!m) {
			placed.delete('gui')
			cls(gui, 'is-on', false)
			return
		}
		if (gui.dataset.panel !== m.panel) gui.dataset.panel = m.panel
		for (const b of gui.querySelectorAll('.mc-guiscreen__btn')) {
			const item = b.dataset.item
			cls(b, 'is-hover', m.hover === item || m.pressed === item)
			cls(b, 'is-active', m.pressed === item)
		}
		gui.style.setProperty('--mc-cu', m.u)
		gui.style.setProperty('--mc-cv', m.v)
		if (!placed.has('gui') && placeGui(gui)) placed.set('gui', true)
		cls(gui, 'is-on', placed.has('gui'))
	}

	// /title: small and centred (decisions-v9 section 6): 32 / 32 / 48 px, subtitles 16 / 16 / 24 px (the kit). The CENTRE of the block is baked per title and per format in
	// hero.css (`--title-cy`, a fraction of the screen height, measured so that no protected area is covered); the kit's `--mc-title-y` is the TOP of the block, so the host
	// converts once at lighting: top = centre - height / 2 (the height depends on the language and on the font). Without a baked value (unknown format) the block goes
	// as near the middle as the protected areas allow, never lower than the middle.
	function placeTitle(el) {
		const f = ctx.frameOf()
		const bh = el.offsetHeight
		const min = Math.round((f.top ?? 0) + 8)
		const baked = parseFloat(getComputedStyle(el).getPropertyValue('--title-cy'))
		let top
		if (Number.isFinite(baked)) top = baked * f.H - bh / 2
		else {
			const a = ctx.anchors()
			const boxes = a ? protect(a, f) : []
			const limit = boxes.length ? Math.min(...boxes.map((b) => b.t)) : f.H / 2
			top = Math.min(f.H / 2 - bh / 2, limit - bh)
		}
		el.style.setProperty('--mc-title-y', `${Math.round(clamp(top, min, Math.max(min, f.H - bh - 8)))}px`)
		return true
	}

	function setTitles(id) {
		for (const [tid, el] of titleEls) {
			const wanted = tid === id
			if (!wanted) placed.delete(`t:${tid}`)
			else if (!placed.has(`t:${tid}`) && placeTitle(el)) placed.set(`t:${tid}`, true)
			cls(el, 'is-on', wanted && placed.has(`t:${tid}`))
		}
	}

	// The hearts follow the dog's head (anchors of the last rendered frame). Texel size from the head's width, whole pixels.
	// v9d (Andy: the hearts are born around the DOG, not Efe): in the tight shot of the party Efe's face sits right above the dog's head (about 1.7 head widths), and the v9c hearts, which rose
	// straight up from the dog's head by 0.6 to 2.8 head widths, ended on Efe's face. They now stay in a halo AROUND the dog's head: on both sides of it (0.7 to 1.1 head widths from its centre),
	// starting level with it and rising only about 0.3 head width, so that every heart is nearer the dog's head than Efe's; and a heart that would still touch Efe's head box slides out of it.
	function placeHearts(list) {
		if (!heartLayer) return
		const a = ctx.anchors()
		const head = a?.dog?.head
		const alive = list.length > 0 && head?.visible !== false && head && head.r > head.l
		cls(heartLayer, 'is-on', Boolean(alive))
		if (!alive) {
			// A heart keeps its own `visibility: visible` over a hidden layer: every one is hidden here, or a seek away from the celebration leaves them on the screen.
			for (const el of heartEls) if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'
			return
		}
		const f = ctx.frameOf()
		const hw = (head.r - head.l) * f.w
		const u = clamp(Math.round((hw * 0.45) / 8), 2, 6)
		const size = 8 * u
		const cx = f.ox + ((head.l + head.r) / 2) * f.w
		const cy = f.oy + ((head.t + head.b) / 2) * f.h
		const ph = a?.player?.head
		const playerBox = ph && ph.visible !== false && ph.r > ph.l ? { l: f.ox + ph.l * f.w - 6, r: f.ox + ph.r * f.w + 6, t: f.oy + ph.t * f.h - 6, b: f.oy + ph.b * f.h + 6 } : null
		heartEls.forEach((el, i) => {
			const h = list.find((x) => x.i === i)
			if (!h) {
				if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'
				return
			}
			const side = h.dx < 0 ? -1 : 1
			const lateral = (0.62 + 0.7 * Math.abs(h.dx)) * hw
			const rise = (0.05 + 0.25 * h.k + 0.05 * Math.abs(h.dx)) * hw
			let x = cx + side * lateral + Math.sin(h.k * Math.PI * 2 + i) * 0.05 * hw - size / 2
			const y = cy - rise - size / 2
			// Still over Efe's head (its box is above the dog's head in the frame): slide out of it, away from his side.
			if (playerBox && x + size > playerBox.l && x < playerBox.r && y + size > playerBox.t && y < playerBox.b) x = side > 0 ? playerBox.r : playerBox.l - size
			x = clamp(x, f.ox + 2, f.ox + f.w - size - 2)
			// v11 (CT v9d P2-5): whatever the head boxes do (the dog turns its head at 49.5 s and its box narrows), a heart is always nearer the DOG's head than Efe's. A pure function of the two boxes:
			// the heart is drawn in towards the dog's head centre, as far as needed (a few passes, since moving it changes its distance to both heads).
			let y2 = y
			if (playerBox) {
				const pcx = (playerBox.l + playerBox.r) / 2
				const pcy = (playerBox.t + playerBox.b) / 2
				for (let pass = 0; pass < 4; pass++) {
					const dx = x + size / 2 - cx
					const dy = y2 + size / 2 - cy
					const dDog = Math.hypot(dx, dy)
					const dEfe = Math.hypot(x + size / 2 - pcx, y2 + size / 2 - pcy)
					if (dDog <= 0.8 * dEfe) break
					const k = (0.8 * dEfe) / dDog
					x = cx + dx * k - size / 2
					y2 = cy + dy * k - size / 2
				}
			}
			const op = Math.min(1, h.k / 0.12) * (1 - smooth01((h.k - 0.7) / 0.3))
			el.style.visibility = 'visible'
			el.style.width = el.style.height = `${size}px`
			el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y2)}px)`
			el.style.opacity = op.toFixed(3)
		})
	}

	// v9d: help on the game's mod line ("AFK memory stored locally": two words of jargon). The film layer is aria-hidden and takes no pointer, so the help is a separate button laid over the line
	// while it is on (index.html `#mod-help`): hover, keyboard focus or a tap open the tooltip (the same words as step 2 of the site), Escape closes it first (capture: it never leaves the film),
	// leaving or blurring closes it. The tooltip is placed next to the line at the first of five places that touches no head and no ember (`protect`), else the one that touches least.
	const helpBox = root.ownerDocument.getElementById('mod-help')
	const helpHit = helpBox?.querySelector('.mod-help__hit') ?? null
	const helpTip = helpBox?.querySelector('.mod-help__tip') ?? null
	const modLine = lineEls.get('mod') ?? null
	let helpOn = false
	let helpOpen = false
	let helpDismissed = false
	function positionHelpTip() {
		if (!helpTip || !modLine) return
		const doc = root.ownerDocument
		const line = modLine.getBoundingClientRect()
		const tip = helpTip.getBoundingClientRect()
		const W = Math.round(doc.documentElement.getBoundingClientRect().width) || doc.documentElement.clientWidth
		const H = doc.documentElement.clientHeight
		const a = ctx.anchors?.()
		const f = ctx.frameOf?.()
		const boxes = a && f ? protect(a, f) : []
		const gap = 8
		const w = tip.width
		const h = tip.height
		const top = Math.max(8, (f?.top ?? 0) + 6) // never over the film's own controls at the top of a small screen
		const lefts = [clamp(line.left, 8, Math.max(8, W - w - 8)), clamp(line.right - w, 8, Math.max(8, W - w - 8))]
		// v10 (P2-10): never over the film's own controls (skip, pause, the stations' buttons and counter, which are the game's bottom right corner in reduced motion).
		const bars = [...doc.querySelectorAll('.film-bar .mc-btn, .film-steps__count')].map((n) => n.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0)
		const hitsBar = (r) => bars.some((b) => r.l < b.right + 4 && r.r > b.left - 4 && r.t < b.bottom + 4 && r.b > b.top - 4)
		const heavy = (r) => 10 * overlapArea(r, boxes, 'dog') + overlapArea(r, boxes.filter((b) => b.name === 'dog'))
		let best = null
		const consider = (l, t) => {
			const r = { l, t, r: l + w, b: t + h }
			if (r.t < top || r.b > H - 4 || r.l < 4 || r.r > W - 4) return
			if (r.l < line.right && r.r > line.left && r.t < line.bottom && r.b > line.top) return // never over its own line
			if (hitsBar(r)) return
			// Heads, faces, the ember and the fire count ten times the dog's body box (the brief: no new text over the heads or the ember; the body may be crossed when nothing else is free).
			const score = heavy(r) + 0.02 * Math.abs(r.t + h / 2 - line.top) // then the nearest to the line
			if (!best || score < best.score) best = { l, t, score }
		}
		// Above the line, as close as it gets and then higher in steps of 12 px; to its right; under it.
		for (const l of lefts) for (let t = line.top - gap - h; t >= top; t -= 12) consider(l, t)
		consider(clamp(line.right + gap, 8, Math.max(8, W - w - 8)), line.bottom - h)
		consider(lefts[0], line.bottom + gap)
		if (!best) best = { l: lefts[0], t: Math.max(top, line.top - gap - h) }
		helpTip.style.left = `${Math.round(best.l)}px`
		helpTip.style.top = `${Math.round(best.t)}px`
	}
	function setHelpOpen(open) {
		if (!helpBox || open === helpOpen) return
		helpOpen = open
		if (open) positionHelpTip()
		helpBox.classList.toggle('is-open', open)
	}
	function placeModHelp(visible) {
		if (!helpBox || !helpHit || !modLine) return
		if (!visible) {
			if (helpOn) {
				// v10 (P2-3): the focus on the help button must not fall on <body> (the next Tab would reach the site and leave the film): it goes back to the film's own controls.
				if (root.ownerDocument.activeElement === helpHit) (root.ownerDocument.getElementById('film-play')?.hidden === false ? root.ownerDocument.getElementById('film-play') : root.ownerDocument.getElementById('film-skip'))?.focus({ preventScroll: true })
				helpOn = false
				helpDismissed = false
				setHelpOpen(false)
				helpBox.hidden = true
			}
			return
		}
		const r = modLine.getBoundingClientRect()
		if (!(r.width > 0 && r.height > 0)) return
		helpOn = true
		helpBox.hidden = false
		helpHit.style.left = `${r.left}px`
		helpHit.style.top = `${r.top}px`
		helpHit.style.width = `${r.width}px`
		helpHit.style.height = `${r.height}px`
		helpHit.setAttribute('aria-label', modLine.textContent.trim())
		if (helpOpen) positionHelpTip()
	}
	if (helpBox && helpHit) {
		const show = () => {
			if (!helpDismissed) setHelpOpen(true)
		}
		// v10 (P1-1, P2-4): hovering is the mouse's business only. A finger fires pointerenter, pointerleave, focus and click in that order, which opened, closed, opened and toggled it shut: the TAP
		// (click) opens it and nothing but Escape, the focus leaving it or a tap elsewhere closes it; a click after a hover does not close what the hover opened.
		const mouse = (event) => event.pointerType === 'mouse'
		helpHit.addEventListener('pointerenter', (event) => {
			if (mouse(event)) show()
		})
		helpHit.addEventListener('focus', show)
		helpHit.addEventListener('pointerleave', (event) => {
			if (!mouse(event)) return
			helpDismissed = false
			if (root.ownerDocument.activeElement !== helpHit && !helpTip.matches(':hover')) setHelpOpen(false)
		})
		helpTip.addEventListener('pointerleave', (event) => {
			if (!mouse(event)) return
			helpDismissed = false
			if (root.ownerDocument.activeElement !== helpHit) setHelpOpen(false)
		})
		root.ownerDocument.addEventListener(
			'pointerdown',
			(event) => {
				if (helpOpen && event.target instanceof Node && !helpBox.contains(event.target)) {
					helpDismissed = false
					setHelpOpen(false)
				}
			},
			{ passive: true, capture: true, signal: ctx.signal },
		)
		helpHit.addEventListener('blur', () => {
			helpDismissed = false
			setHelpOpen(false)
		})
		helpHit.addEventListener('click', () => {
			helpDismissed = false
			setHelpOpen(true)
		})
		root.ownerDocument.addEventListener(
			'keydown',
			(event) => {
				if (event.key !== 'Escape' || !helpOpen) return
				event.preventDefault()
				event.stopPropagation()
				helpDismissed = true
				setHelpOpen(false)
			},
			{ capture: true, signal: ctx.signal },
		)
	}

	function update(time, o = {}) {
		const site = Boolean(o.site) || ctx.phase?.() === 'site'
		const reduced = Boolean(ctx.reduced())
		if (site) {
			// On the site nothing of the film survives, from the first frame: no class, no announcement, no placement.
			if (state.site !== true) reset()
			state = { site: true, chat: null, chatAbove: null, typing: null, menu: null, title: null, hotbar: { on: false, selected: 1 }, hearts: [] }
			return state
		}
		const h = hudAt(time, { modchat: ctx.modchat })
		// Page events: `mm:chat` and `mm:title` on #stage, { id, phase: 'show' | 'hide', t }. For announcements and tests only: display comes from hudAt.
		if (stage) {
			if (h.chat !== state.chat) {
				if (state.chat) stage.dispatchEvent(new CustomEvent('mm:chat', { detail: { id: state.chat, phase: 'hide', t: time } }))
				if (h.chat) stage.dispatchEvent(new CustomEvent('mm:chat', { detail: { id: h.chat, phase: 'show', t: time } }))
			}
			if (h.title !== state.title) {
				if (state.title) stage.dispatchEvent(new CustomEvent('mm:title', { detail: { id: state.title, phase: 'hide', t: time } }))
				if (h.title) stage.dispatchEvent(new CustomEvent('mm:title', { detail: { id: h.title, phase: 'show', t: time } }))
			}
		}
		state = h
		// The promise (`say`) stays lit and rises one row when the leaving line (nested in its own) arrives below.
		for (const [id, el] of lineEls) cls(el, 'is-on', h.chat === id || h.chatAbove === id)
		const above = lineEls.get(h.chatAbove)
		for (const [id, el] of lineEls) {
			const lifted = id === h.chatAbove
			if (el.classList.contains('is-above') !== lifted) el.classList.toggle('is-above', lifted)
		}
		if (above) {
			const below = above.querySelector('.mc-chat__line[data-chapter]')
			if (below) above.style.setProperty('--mc-chat-shift', `${below.offsetHeight}px`)
		}
		for (const [id, el] of sayEls) setBubble(id, el, h.typing, reduced)
		setGui(h.menu)
		setTitles(h.title)
		placeHearts(h.hearts)
		placeModHelp(h.chat === 'mod' || h.chatAbove === 'mod')
		if (hotbar) {
			selectSlot(hotbar, h.hotbar.selected)
			cls(hotbar, 'is-on', h.hotbar.on)
		}
		// Announcements: crossing forward, close to the instant (a distant jump announces nothing); reduced motion: the content of the station.
		if (Number.isFinite(lastT)) {
			if (reduced) {
				const ids = new Set([h.chat, h.title, h.typing?.id].filter(Boolean))
				if (time >= PLAN.by.gaze.at && time < 26.1) ids.add('gaze')
				if (time >= PLAN.by.joy.at && time < 50.5) ids.add('joy')
				for (const id of ids) if (!lastIds.has(id)) announce(id)
				lastIds = ids
			} else if (time > lastT) {
				for (const a of schedule) if (lastT < a.shownAt && time >= a.shownAt && time - a.shownAt < 0.6) consider(a.id, time, o)
			} else if (time < lastT) pendingSay = null // going backward: nothing is said, and what was waiting is dropped
		}
		lastT = time
		return h
	}

	// Called every frame: places what was waiting for fresh anchors.
	function tick(time, o = {}) {
		if (o.site || ctx.phase?.() === 'site') return
		const h = state
		// An announcement held back by the wall gap is said when the gap is over, if its element is still on and the film is not going faster than 1.5x.
		if (pendingSay) {
			if (time > pendingSay.expires || (!['gaze', 'joy'].includes(pendingSay.id) && !isLit(pendingSay.id))) pendingSay = null
			else if (!(Number.isFinite(o.rate) && o.rate > ANNOUNCE_MAX_RATE) && performance.now() - lastWall >= ANNOUNCE_WALL_GAP) {
				const id = pendingSay.id
				pendingSay = null
				announce(id)
			}
		}
		if (h.typing && !placed.has(h.typing.id)) update(time, o)
		else if (h.menu && !placed.has('gui')) update(time, o)
		else if (h.title && !placed.has(`t:${h.title}`)) update(time, o)
		const hearts = heartsAt(time)
		if (hearts.length || heartLayer?.classList.contains('is-on')) placeHearts(hearts)
	}

	function reset() {
		pendingSay = null
		placeModHelp(false)
		placed.clear()
		lastT = Number.NaN
		lastIds = new Set()
		state = { site: false, chat: null, typing: null, menu: null, title: null, hotbar: { on: false, selected: 4 } }
		for (const el of root.querySelectorAll('[data-hud].is-on')) el.classList.remove('is-on')
		if (hotbar?.classList?.contains('is-on')) hotbar.classList.remove('is-on')
		sayShown.clear()
		wrapped.clear()
		bubbleAt.clear()
		for (const el of sayEls.values()) {
			el.style.removeProperty('--mc-say-w') // width and height measured again (font, window size, language)
			el.style.removeProperty('bottom')
			el.style.removeProperty('left')
			el.querySelector('.mc-say__typed').textContent = ''
		}
		for (const el of titleEls.values()) el.style.removeProperty('--mc-title-y')
	}

	// The language changed (or the plan did): rewrite the texts the host writes itself and forget every placement.
	function relabel() {
		schedule = announceSchedule(PLAN, { modchat: ctx.modchat })
		if (sayLineText) sayLineText.textContent = chatLine(t(KEY.typed))
		reset()
	}
	relabel()

	return {
		update,
		tick,
		reset,
		relabel,
		get state() {
			return state
		},
		get on() {
			return [...root.querySelectorAll('[data-hud].is-on')].map((el) => el.dataset.chapter || el.dataset.hud)
		},
		get placed() {
			return [...placed.keys()]
		},
		get schedule() {
			return schedule
		},
	}
}
