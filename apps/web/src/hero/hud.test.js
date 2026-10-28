// Ported from the prototype's Node battery (renders-v12/tests/h1-hud-v12.mjs) to Vitest; the film modules are imported from this folder instead of docs/marketing.
// v12 copy of renders-v11b/tests/h1-hud-v11b.mjs: the film has two titles left (the hook t-evenings and the ending t-keep), no title over the arrival line of the return, the stations
// and the announcements follow. Run: node renders-v12/tests/h1-hud-v12.mjs  (MM_WEB selects the folder)
// H1 (decisions-v9 section 13, lot L2), v9c copy: the pure core of web/hud.js, under Node only (no browser).
//   node --import renders-v9/l1/tests/register.mjs renders-v9c/tests/h1-hud.mjs     (adds cues-equiv against scene.js STORY.cues)
// v9c changes: the arrival line of the return ('rejoin', 45.3 to 48.6 s) is the game's system message, not a story block: it may stand while T4 is lit (one documented exemption of
// the "no title during a chat line" rule and of the one-block rule, decisions v9c); thirteen reduced-motion stations (R10 = 45.8 s, Efe is back); the announcement list has it.
// Written BEFORE the code: against the v8b hud.js almost everything fails.
import { loadLocale, translate } from '../i18n/catalog.ts'
import * as HUD from './hud.js'
import { test } from 'vitest'
import assert from 'node:assert/strict'


const IDS = ['en', 'fr', 'ru', 'de', 'ko', 'pt-BR', 'pl', 'ja', 'en-GB', 'en-CA', 'fr-CA']
const COMPLETE = ['en', 'fr', 'ru', 'de', 'ko', 'pt-BR', 'pl', 'ja']
await Promise.all(IDS.map(loadLocale))
const catalogs = Object.fromEntries(
	Object.entries(import.meta.glob('../i18n/locales/*.json', { eager: true, import: 'default' })).map(([file, json]) => [file.replace(/^.*\/|\.json$/g, ''), json])
)
const config = { playerName: 'Efe' }
const tIn = (locale) => (key, values = {}) => translate(locale, key, { ...values, name: config.playerName })
const len = (s) => Array.from(s).length
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps

// ---------------------------------------------------------------------------------------------------------------
// Plan: windows of every text (decisions-v9 sections 2.2, 3.4, 6.3)
// ---------------------------------------------------------------------------------------------------------------
test('plan windows: chat lines, titles, hotbar (v9 table)', () => {
	const plan = HUD.makePlan(HUD.LOCAL_CUES, HUD.LOCAL_REF)
	const chat = Object.fromEntries(plan.chat.map((l) => [l.id, l]))
	assert.ok(near(chat.join.on, 0.2) && near(chat.join.off, 3.5), 'join 0.20 -> 3.50')
	assert.ok(near(chat.mod.on, 10.5) && near(chat.mod.off, 14.55), 'mod line 10.50 -> bubble opens')
	assert.ok(near(chat.say.on, 17.65) && near(chat.say.off, 24.7), 'promise line 17.65 -> 24.70')
	assert.ok(near(chat.quit.on, 21.4) && near(chat.quit.off, 24.7), 'quit line 21.40 -> 24.70')
	assert.equal(chat.say.out, 0.3)
	const T = Object.fromEntries(plan.titles.map((x) => [x.id, x]))
	assert.deepEqual(Object.keys(T), ['t-evenings', 't-keep'])
	const want = { 't-evenings': [3.65, 8.15], 't-keep': [51.8, 54.5] }
	for (const [id, [on, off]] of Object.entries(want)) assert.ok(near(T[id].on, on) && near(T[id].off, off), `${id} ${on} -> ${off}, got ${T[id].on} -> ${T[id].off}`)
	assert.deepEqual(plan.hotbar, [0.2, 21.4])
})

test('hotbar selection: 4, then 3, 2, 1 at 5.75 / 5.85 / 5.95; leaves at 21.40, never returns', () => {
	const sel = (t) => HUD.hudAt(t).hotbar
	assert.equal(sel(1).selected, 4)
	assert.equal(sel(5.74).selected, 4)
	assert.equal(sel(5.75).selected, 3)
	assert.equal(sel(5.849).selected, 3)
	assert.equal(sel(5.85).selected, 2)
	assert.equal(sel(5.949).selected, 2)
	assert.equal(sel(5.95).selected, 1)
	assert.equal(sel(10).selected, 1)
	assert.equal(sel(0.1).on, false)
	assert.equal(sel(0.2).on, true)
	assert.equal(sel(21.39).on, true)
	assert.equal(sel(21.4).on, false)
	for (let t = 21.4; t <= 60; t += 0.1) assert.equal(sel(t).on, false, `hotbar back at ${t}`)
})

test('one story block at a time on [0 ; 60] (quit line is nested in the promise line); no title during a chat line', () => {
	const plan = HUD.makePlan(HUD.LOCAL_CUES, HUD.LOCAL_REF)
	for (let i = 0; i <= 3000; i++) {
		const t = i * 0.02
		const on = HUD.chaptersAt(t, { plan })
		on.delete('quit') // nested in `say` (one block for the readability tool)
		on.delete('rejoin') // v9c: the game's arrival line of the return is a system message, not a story block (plan.blocks[].system)
		assert.ok(on.size <= 1, `blocks at ${t.toFixed(2)}: ${[...on]}`)
		const h = HUD.hudAt(t, { plan })
		if (h.title && h.chat !== 'rejoin') assert.equal(h.chat, null, `title ${h.title} over chat ${h.chat} at ${t.toFixed(2)}`)
		if (h.chat === 'rejoin') assert.ok(h.title === null || h.title === 't-echo', 'the only title that may stand over the arrival line is T4')
		if (h.title) assert.equal(h.typing, null, `title over the bubble at ${t.toFixed(2)}`)
		if (h.title) assert.equal(h.menu, null, `title over the held screen at ${t.toFixed(2)}`)
	}
})

test('modchat=0 removes the mod line; site phase removes everything', () => {
	assert.equal(HUD.hudAt(12, {}).chat, 'mod')
	assert.equal(HUD.hudAt(12, { modchat: false }).chat, null)
	for (const t of [0.5, 5, 12, 16, 19, 22, 30, 36, 44, 47, 52, 58]) {
		const h = HUD.hudAt(t, { site: true })
		assert.deepEqual([h.chat, h.chatAbove, h.typing, h.menu, h.title], [null, null, null, null, null], `site phase at ${t}`)
		assert.equal(h.hotbar.on, false)
		assert.equal(HUD.chaptersAt(t, { site: true }).size, 0)
	}
})

// ---------------------------------------------------------------------------------------------------------------
// Menu: one panel, cursor stopped then sliding to "quit" (decisions-v9 section 7)
// ---------------------------------------------------------------------------------------------------------------
test('menu: single panel, idle then straight to quit, never over resume or options after the stop', () => {
	assert.equal(HUD.menuAt(18.29), null)
	const first = HUD.menuAt(18.3)
	assert.equal(first.panel, 'pause')
	assert.equal(first.item, 'idle')
	const idle = HUD.LOCAL_CUES.find((c) => c.id === 'menu').items.idle
	const quit = HUD.LOCAL_CUES.find((c) => c.id === 'menu').items.quit
	assert.ok(idle[1] > 1, 'idle waits below the panel, on no button')
	for (let t = 18.3; t < 19.1; t += 0.02) {
		const m = HUD.menuAt(t)
		assert.ok(near(m.u, idle[0], 1e-3) && near(m.v, idle[1], 1e-3), `cursor stopped at ${t.toFixed(2)}`)
		assert.equal(m.hover, null)
	}
	let last = HUD.menuAt(19.1)
	for (let t = 19.1; t <= 21.39; t += 0.02) {
		const m = HUD.menuAt(t)
		assert.ok(m.v >= quit[1] - 1e-9, `cursor never above the quit row (v ${m.v} at ${t.toFixed(2)})`)
		assert.ok(m.v <= last.v + 1e-9, 'moves up only (it comes from below the panel)')
		assert.ok(m.hover === null || m.hover === 'quit', `hover ${m.hover}`)
		assert.ok(m.pressed === null || m.pressed === 'quit', `pressed ${m.pressed}`)
		last = m
	}
	assert.equal(HUD.menuAt(19.69).hover, null)
	assert.equal(HUD.menuAt(19.7).hover, 'quit')
	assert.equal(HUD.menuAt(21.14).hover, 'quit')
	assert.equal(HUD.menuAt(21.15).pressed, 'quit')
	assert.equal(HUD.menuAt(21.3).pressed, null)
	assert.ok(near(HUD.menuAt(20.1).v, 0.6, 1e-3) && near(HUD.menuAt(20.1).u, quit[0], 1e-3), 'on the quit button from 20.10')
	assert.equal(HUD.menuAt(21.4), null)
})

// ---------------------------------------------------------------------------------------------------------------
// Typing: graphemes, chars(n), column wrapping with CJK = 2 columns (decisions-v9 section 13, H1)
// ---------------------------------------------------------------------------------------------------------------
test('typedChars(n) is monotone, 0 at n=0, the whole text at the last key, in every language', () => {
	const K = HUD.LOCAL_CUES.find((c) => c.id === 'say').keys.length
	assert.equal(K, 28)
	for (const id of IDS) {
		const text = tIn(id)("stay, I'll be back soon...")
		const L = HUD.graphemes(text).length
		assert.ok(L > 0)
		let prev = -1
		for (let n = 0; n <= K + 3; n++) {
			const c = HUD.typedChars(n, K, L)
			assert.ok(c >= prev, `${id} monotone at ${n}`)
			assert.ok(Number.isInteger(c) && c >= 0 && c <= L)
			prev = c
		}
		assert.equal(HUD.typedChars(0, K, L), 0)
		assert.equal(HUD.typedChars(K, K, L), L, `${id} full text at the last key`)
		assert.equal(HUD.typedChars(K + 5, K, L), L)
	}
})

test('graphemes: counts user-perceived characters (emoji, combining marks, hangul)', () => {
	assert.equal(HUD.graphemes('éa').length, 2)
	assert.equal(HUD.graphemes('한국어').length, 3)
	assert.equal(HUD.graphemes('a b…').length, 4)
})

test('wrapRows: columns (CJK = 2), 12 / 18 per row, breaks on spaces, between CJK characters, never inside a Latin word', () => {
	assert.equal(HUD.SAY_ROW_COLS.phone, 12)
	assert.equal(HUD.SAY_ROW_COLS.wide, 18)
	assert.equal(HUD.columnsOf('a'), 1)
	assert.equal(HUD.columnsOf('한'), 2)
	assert.equal(HUD.columnsOf('日'), 2)
	assert.equal(HUD.columnsOf('…'), 1)
	for (const id of IDS) {
		const text = tIn(id)("stay, I'll be back soon...")
		for (const cols of [12, 18]) {
			const rows = HUD.wrapRows(text, cols)
			// Rebuild the message from the rows and their joiners: the text must be reproduced exactly.
			const rebuilt = rows.map((r, i) => r.g.join('') + (i < rows.length - 1 && r.join ? ' ' : '')).join('')
			assert.equal(rebuilt, text, `${id} ${cols}: rows rebuild the text`)
			const total = rows.reduce((s, r, i) => s + r.g.length + (i < rows.length - 1 ? r.join : 0), 0)
			assert.equal(total, HUD.graphemes(text).length, `${id} ${cols}: typed units = graphemes`)
			for (const r of rows) {
				const c = r.g.reduce((s, g) => s + HUD.columnsOf(g), 0)
				const words = r.g.join('').split(' ')
				const single = words.length === 1 && !/[぀-ヿ㐀-鿿가-힯]/u.test(words[0])
				assert.ok(c <= cols || single, `${id} ${cols}: row "${r.g.join('')}" is ${c} columns`)
			}
			// Typed prefix: never splits a word differently from the full wrap; ends equal to the full text.
			const L = HUD.graphemes(text).length
			assert.equal(HUD.typedRows(rows, L), rows.map((r) => r.g.join('')).join('\n'))
			assert.equal(HUD.typedRows(rows, 0), '')
		}
	}
	// A long CJK run breaks between characters at the column limit.
	const rows = HUD.wrapRows('ここにいて、すぐ戻るよ…', 12)
	assert.ok(rows.length >= 2)
	assert.ok(rows.every((r) => r.g.reduce((s, g) => s + HUD.columnsOf(g), 0) <= 12))
})

// ---------------------------------------------------------------------------------------------------------------
// Texts: every key exists, "Efe" everywhere, budgets recomputed per language with the tool's reading formula
// ---------------------------------------------------------------------------------------------------------------
test('every text key of the film exists in the 8 complete catalogues (the English key is the source)', () => {
	const keys = HUD.filmKeys()
	assert.ok(keys.length >= 24, `film keys: ${keys.length}`)
	for (const id of COMPLETE) for (const k of keys) assert.ok(Object.hasOwn(catalogs[id], k), `${id} is missing "${k}"`)
})

test('the player is called Efe in join and quit lines, in every language', () => {
	for (const id of IDS) {
		const t = tIn(id)
		for (const key of ['{name} joined the game', '{name} left the game', '<{name}> {message}']) {
			const text = t(key, { message: 'x' })
			assert.ok(text.includes('Efe'), `${id}: ${text}`)
			assert.ok(!/Noa/.test(text))
		}
	}
	assert.equal(config.playerName, 'Efe')
})

test('reading budgets recomputed per language (0.7 s + chars / 12; window = on -> off, held stops added)', () => {
	const plan = HUD.makePlan(HUD.LOCAL_CUES, HUD.LOCAL_REF)
	const holds = HUD.holdList(plan) // [[at, wall], ...]
	const heldIn = (a, b) => holds.filter(([at]) => at >= a && at < b).reduce((s, [, w]) => s + w, 0)
	const lineOf = (id) => plan.chat.find((l) => l.id === id)
	const bad = []
	for (const id of IDS) {
		const t = tIn(id)
		const texts = {
			join: { n: len(t('{name} joined the game')), avail: lineOf('join').off - lineOf('join').on - 0.1 + heldIn(0.2, 3.5) },
			quit: { n: len(t('{name} left the game')), avail: lineOf('quit').off - lineOf('quit').on - 0.1 },
			mod: { n: len(t('Minemories: world capture done.')), avail: lineOf('mod').off - lineOf('mod').on - 0.1 + heldIn(10.5, 14.55) },
		}
		for (const x of plan.titles) {
			const lines = HUD.TITLE_LINES[x.id]
			// The reading tool counts the space between two lines of one block as a character.
			const all = [...lines.title, ...lines.sub]
			const n = all.reduce((s, k) => s + len(t(k)), 0) + (all.length - 1)
			texts[x.id] = { n, avail: x.off - x.on + heldIn(x.on, x.off) - 0.45 + x.out / 2 }
		}
		for (const [k, v] of Object.entries(texts)) if (HUD.readingNeeds(v.n) > v.avail + 1e-9) bad.push(`${id} ${k}: ${v.n} chars need ${HUD.readingNeeds(v.n).toFixed(2)} s, window offers ${v.avail.toFixed(2)} s`)
	}
	assert.deepEqual(bad, [])
	// And the documented budgets (decisions-v9 section 3.4) still hold for fr and en.
	const fr = tIn('fr')
	const sum = (keys) => keys.reduce((s, k) => s + len(fr(k)), 0)
	assert.ok(sum([...HUD.TITLE_LINES['t-evenings'].title, ...HUD.TITLE_LINES['t-evenings'].sub]) <= 46)
	assert.ok(sum([...HUD.TITLE_LINES['t-keep'].title, ...HUD.TITLE_LINES['t-keep'].sub]) <= 42)
})

// ---------------------------------------------------------------------------------------------------------------
// Announcements (single role=status region), stations, chapter keys, holds
// ---------------------------------------------------------------------------------------------------------------
test('announcement order (decisions-v9 section 11.7) and at least 1.2 s between two', () => {
	const plan = HUD.makePlan(HUD.LOCAL_CUES, HUD.LOCAL_REF)
	const sched = HUD.announceSchedule(plan)
	assert.deepEqual(
		sched.map((a) => a.id),
		['join', 't-evenings', 'mod', 'say', 'quit', 'gaze', 'rejoin', 'joy', 't-keep'],
	)
	for (let i = 1; i < sched.length; i++) assert.ok(sched[i].shownAt - sched[i - 1].shownAt >= 1.2 - 1e-9, `${sched[i - 1].id} -> ${sched[i].id}`)
	assert.ok(near(sched.find((a) => a.id === 'gaze').at, 22.2) && near(sched.find((a) => a.id === 'joy').at, 47.8))
	for (const a of sched) assert.ok(a.shownAt >= a.at - 1e-9 && a.shownAt - a.at < 1)
	const t = tIn('fr')
	for (const a of sched) assert.ok(HUD.announceText(a.id, t).length > 0, a.id)
	assert.equal(HUD.announceText('gaze', t), t('The dog turns to you, sad, then lies down.'))
	assert.equal(HUD.announceText('joy', t), t('{name} is back. The dog jumps up and celebrates.'))
	assert.equal(HUD.announceText('rejoin', t), t('{name} joined the game'), 'the arrival line is read like the first one')
})

test('the arrival line of the return (v9d): 45.8 to 49.1 s, exactly when Efe appears, the bottom line, same format as the first arrival', () => {
	const plan = HUD.makePlan(HUD.LOCAL_CUES, HUD.LOCAL_REF)
	const line = plan.chat.find((l) => l.id === 'rejoin')
	assert.ok(line && near(line.on, 45.8) && near(line.off, 49.1) && line.tone === 'join', JSON.stringify(line))
	assert.equal(line.on, plan.by.return.at, 'the line starts on the cue of his appearance')
	assert.equal(HUD.hudAt(45.3, { plan }).chat, null, 'the bench is empty and silent for 0.5 s')
	assert.equal(HUD.hudAt(45.79, { plan }).chat, null)
	assert.equal(HUD.hudAt(45.8, { plan }).chat, 'rejoin')
	assert.equal(HUD.hudAt(49.09, { plan }).chat, 'rejoin')
	assert.equal(HUD.hudAt(49.1, { plan }).chat, null)
	assert.equal(HUD.hudAt(45.9, { site: true, plan }).chat, null, 'nothing on the site')
	for (const l of ['en', 'fr', 'ru', 'de', 'ko', 'pt-BR', 'pl', 'ja', 'en-GB', 'en-CA', 'fr-CA']) assert.ok(tIn(l)('{name} joined the game').includes('Efe'), l)
})

test('reduced-motion stations R0 to R12 (v9d: R10 = Efe is back, 46.8 s), chapters 1 to 5, holds', () => {
	const plan = HUD.makePlan(HUD.LOCAL_CUES, HUD.LOCAL_REF)
	const st = HUD.stationList()
	assert.deepEqual(st.map((s) => s.t), [1.0, 5.5, 10.6, 17.5, 20.6, 23.6, 25.9, 30.8, 36.8, 44.0, 46.8, 48.6, 51.8])
	assert.deepEqual(st.map((s) => s.id), Array.from({ length: 13 }, (_, i) => `R${i}`))
	assert.equal(HUD.hudAt(46.8, { plan }).chat, 'rejoin', 'R10 (v9d: 46.8 s, after the fade-in and his turn) shows the arrival line, and (v12) no title')
	assert.equal(HUD.hudAt(46.8, { plan }).title, null)
	// v12: no title in the whole absence (28.8 to 51.8 s): the film tells it alone
	for (let t = 24.7; t < 51.8; t += 0.05) assert.equal(HUD.hudAt(t, { plan }).title, null, `title at ${t.toFixed(2)}`)
	// R3: the bubble is full; R4: quit hovered; R5: gaze, lines on; R6: lying down; R11: the party; R12: freeze, T5.
	assert.equal(HUD.hudAt(17.5, { plan }).typing.n, 28)
	assert.equal(HUD.hudAt(20.6, { plan }).menu.hover, 'quit')
	const r5 = HUD.hudAt(23.6, { plan })
	assert.ok(r5.chat === 'quit' && r5.chatAbove === 'say')
	assert.equal(HUD.hudAt(51.8, { plan }).title, 't-keep')
	assert.deepEqual(HUD.chapterList().map((c) => [c.id, c.t]), [['evening', 7.9], ['leaving', 13.35], ['waiting', 29.4], ['memory', 41.2], ['return', 47.8]])
	assert.deepEqual(HUD.holdList(plan), [[10.6, 1.2], [51.8, 2.2]])
	assert.equal(HUD.stationIndexAt, undefined, 'the scroll-driven station mapping is gone')
	assert.equal(HUD.buildMap, undefined)
	assert.equal(HUD.gateList, undefined)
})

test('dog gaze and the party carry audio-description cues', () => {
	const cues = HUD.LOCAL_CUES
	assert.ok(near(cues.find((c) => c.id === 'gaze').at, 22.2))
	assert.ok(near(cues.find((c) => c.id === 'joy').at, 47.8))
	assert.ok(near(cues.find((c) => c.id === 'quit').at, 21.4))
})

// Equivalence of the local cue table with the scene's STORY.cues (only when scene.js can be imported: node --import register.mjs).
test('cues-equiv: LOCAL_CUES = scene.js STORY.cues (v9)', async (ctx) => {
	let M
	try {
		M = await import(`${ROOT}/${process.env.MM_WEB ?? "web"}/scene.js?v=${Date.now()}`)
	} catch {
		ctx.skip('scene.js needs the three.js loader (node --import renders-v9/l1/tests/register.mjs)')
		return
	}
	const local = JSON.parse(JSON.stringify(HUD.LOCAL_CUES))
	const scene = JSON.parse(JSON.stringify(M.STORY.cues))
	// Only the cues the HUD reads; story-only cues (gaze, lie, return, joy) compare on id, kind and time.
	assert.deepEqual(local.map((c) => c.id), scene.map((c) => c.id))
	for (let i = 0; i < local.length; i++) assert.deepEqual(local[i], scene[i], `cue ${local[i].id}`)
})

// Final pass: hearts over the dog during the celebration (hud.js heartsAt).
test('hearts: pure in t, only during the celebration, all gone before the band is replayed at 50.5 s, none on the site', () => {
	for (const t of [0, 10, 21.4, 26, 40, 45.3, 47.9]) assert.deepEqual(HUD.heartsAt(t), [], `no heart at ${t}`)
	assert.equal(HUD.heartsAt(47.95).length, 1)
	assert.ok(HUD.heartsAt(48.6).length >= 3, 'a cloud of hearts at 48.6')
	for (let t = 50.35; t <= 60; t += 0.01) assert.deepEqual(HUD.heartsAt(t), [], `no heart at ${t.toFixed(2)}`)
	for (const t of [47.95, 48.2, 48.6, 49.1, 49.9]) assert.deepEqual(HUD.heartsAt(t), HUD.heartsAt(t), 'pure')
	for (const h of HUD.heartsAt(49)) assert.ok(h.k >= 0 && h.k < 1 && Math.abs(h.dx) <= 1)
	assert.deepEqual(HUD.hudAt(10, { site: true }).hearts, [])
	assert.ok(HUD.hudAt(48.6).hearts.length > 0)
})

test('T5 leaves in 0.5 s (gone at 55.0 s, before the crane shows the model); T2, T3 and T4 are gone from the catalogue keys the HUD reads (v12)', () => {
	const t5 = HUD.PLAN.titles.find((t) => t.id === 't-keep')
	assert.equal(t5.out, 0.5)
	assert.ok(t5.off + t5.out <= 55.0 + 1e-6, `${t5.off + t5.out}`)
	assert.deepEqual(Object.keys(HUD.TITLE_LINES), ['t-evenings', 't-keep'])
	assert.deepEqual(HUD.TITLE_LINES['t-keep'], { title: ['That evening'], sub: ['was kept by Minemories.'] })
	const keys = new Set(HUD.filmKeys())
	for (const k of ['Without you, a world dies,', 'it withers…', 'You told him “stay”…', 'Here for years, waiting for you…', 'Minemories had kept a memory,', 'a hope remains,', 'just as you had left it.']) assert.ok(!keys.has(k), k)
})
