// Ported from the prototype's Node battery (renders-v9/l2/tests/h2-phase-pure.mjs) to Vitest; the film modules are imported from this folder instead of docs/marketing.
// H2 (pure part, lot L2): the phase state machine of web/phase.js (film -> site), under Node only.
//   node renders-v9/l2/tests/h2-phase-pure.mjs
// Written BEFORE the code. The browser half of H2 (real scroll, real focus, real canvas) is h2-browser.cjs.
import { test } from 'vitest'
import assert from 'node:assert/strict'

import * as P from './phase.js'

test('constants: scroll threshold 32 px, site starts at 55.5 s', () => {
	assert.equal(P.SCROLL_THRESHOLD, 32)
	assert.equal(P.DEFAULT_SITE_START, 55.5)
})

test('start phase: an anchor in the URL, or no WebGL, starts on the site; nothing else does', () => {
	for (const hash of ['#hero', '#steps', '#share', '#limits', '#faq']) assert.equal(P.startPhase({ hash, webgl: true }), 'site', hash)
	assert.equal(P.startPhase({ hash: '', webgl: true }), 'film')
	assert.equal(P.startPhase({ hash: '#unknown', webgl: true }), 'film')
	assert.equal(P.startPhase({ hash: '#film', webgl: true }), 'film')
	assert.equal(P.startPhase({ hash: '', webgl: false }), 'site')
})

test('end of the film: crossing 55.5 s while playing goes to the site (cause "end"), once', () => {
	const m = P.createPhaseMachine()
	assert.equal(m.phase, 'film')
	assert.equal(m.event({ type: 'time', t: 55.0, playing: true }).changed, false)
	assert.equal(m.event({ type: 'time', t: 55.49, playing: true }).changed, false)
	const r = m.event({ type: 'time', t: 55.5, playing: true })
	assert.deepEqual([r.changed, r.phase, r.cause], [true, 'site', 'end'])
	assert.equal(m.event({ type: 'time', t: 56, playing: true }).changed, false, 'already on the site')
})

test('a paused or sought film does not end by itself (time without playing is ignored)', () => {
	const m = P.createPhaseMachine()
	assert.equal(m.event({ type: 'time', t: 57, playing: false }).changed, false)
	assert.equal(m.phase, 'film')
})

test('scroll: only after the first rendered frame, only beyond 32 px', () => {
	const m = P.createPhaseMachine()
	assert.equal(m.armed, false)
	assert.equal(m.event({ type: 'scroll', y: 400 }).changed, false, 'scroll restoration or an anchor before the first frame must not skip the film')
	m.event({ type: 'frame' })
	assert.equal(m.armed, true)
	assert.equal(m.event({ type: 'scroll', y: 0 }).changed, false)
	assert.equal(m.event({ type: 'scroll', y: 32 }).changed, false, '32 px exactly is not beyond')
	const r = m.event({ type: 'scroll', y: 33 })
	assert.deepEqual([r.changed, r.phase, r.cause], [true, 'site', 'scroll'])
})

test('skip, Escape and content focus go to the site; other keys and control focus do not', () => {
	const mk = () => {
		const m = P.createPhaseMachine()
		m.event({ type: 'frame' })
		return m
	}
	let r = mk().event({ type: 'skip' })
	assert.deepEqual([r.phase, r.cause, r.changed], ['site', 'skip', true])
	r = mk().event({ type: 'key', key: 'Escape' })
	assert.deepEqual([r.phase, r.cause, r.changed], ['site', 'key', true])
	r = mk().event({ type: 'key', key: ' ' })
	assert.equal(r.changed, false)
	r = mk().event({ type: 'key', key: 'ArrowDown' })
	assert.equal(r.changed, false)
	r = mk().event({ type: 'focus', content: true })
	assert.deepEqual([r.phase, r.cause, r.changed], ['site', 'focus', true])
	r = mk().event({ type: 'focus', content: false })
	assert.equal(r.changed, false, 'the skip, pause and chapter controls never switch to the site')
})

test('focus in the content works even before the first frame (keyboard users are not waiting for a render)', () => {
	const m = P.createPhaseMachine()
	assert.equal(m.event({ type: 'focus', content: true }).changed, true)
})

test('replay and goto return to the film; scrolling back to the top on the site changes nothing', () => {
	const m = P.createPhaseMachine({ phase: 'site' })
	m.event({ type: 'frame' })
	assert.equal(m.event({ type: 'scroll', y: 0 }).changed, false)
	assert.equal(m.event({ type: 'time', t: 3, playing: true }).changed, false)
	let r = m.event({ type: 'replay' })
	assert.deepEqual([r.phase, r.cause, r.changed], ['film', 'replay', true])
	m.event({ type: 'skip' })
	r = m.event({ type: 'goto', t: 10 })
	assert.deepEqual([r.phase, r.cause, r.changed], ['film', 'goto', true])
	assert.equal(m.event({ type: 'goto', t: 11 }).changed, false)
})

test('a site that started from an anchor is armed at once and never auto-returns to the film', () => {
	const m = P.createPhaseMachine({ phase: 'site' })
	for (const e of [{ type: 'frame' }, { type: 'scroll', y: 5000 }, { type: 'scroll', y: 0 }, { type: 'time', t: 1, playing: true }, { type: 'key', key: 'Escape' }]) assert.equal(m.event(e).changed, false)
	assert.equal(m.phase, 'site')
})

test('reduced-motion steps: next after the last station goes to the site', () => {
	const m = P.createPhaseMachine()
	m.event({ type: 'frame' })
	assert.equal(m.event({ type: 'step', index: 10, count: 12, dir: 1 }).changed, false)
	assert.equal(m.event({ type: 'step', index: 11, count: 12, dir: 1 }).changed, true)
	assert.equal(m.phase, 'site')
	assert.equal(m.cause, 'end')
})
