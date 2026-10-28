// Ported from the prototype's Node battery (web/mcui/tests/hotbar.test.mjs) to Vitest; the film modules are imported from this folder instead of docs/marketing.
// Unit tests of mcui/hotbar.js (pure geometry and the DOM builder on a tiny fake document).   node --test web/mcui/tests/hotbar.test.mjs
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { bindTooltips, createHotbar, FILM_HOTBAR, relabel, selectedIndex, selectionBox, selectSlot, SLOTS, slotBox } from './mcui/hotbar.js'

function fakeNode(tag) {
	const attrs = new Map()
	const classes = new Set()
	const listeners = {}
	const node = {
		tag,
		children: [],
		textContent: '',
		style: { values: {}, setProperty(k, v) { this.values[k] = v } },
		set className(value) { for (const c of value.split(/\s+/).filter(Boolean)) classes.add(c) },
		get className() { return [...classes].join(' ') },
		classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) },
		setAttribute: (k, v) => attrs.set(k, String(v)),
		getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
		hasAttribute: (k) => attrs.has(k),
		removeAttribute: (k) => attrs.delete(k),
		append(...kids) { node.children.push(...kids) },
		querySelectorAll(selector) {
			const found = []
			const walk = (n) => { for (const c of n.children) { if (selector === '.mc-hotbar__tip' && c.className.includes('mc-hotbar__tip')) found.push(c); walk(c) } }
			walk(node)
			return found
		},
		addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn) },
		removeEventListener: (type, fn) => { listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn) },
		emit: (type, event = {}) => (listeners[type] ?? []).forEach((fn) => fn(event)),
		listeners,
	}
	return node
}
const doc = { createElement: fakeNode, ...(() => { const n = fakeNode('document'); return { addEventListener: n.addEventListener, removeEventListener: n.removeEventListener, emit: n.emit, listeners: n.listeners } })() }

test('nine items in story order, with the stack counts of the film', () => {
	assert.equal(FILM_HOTBAR.length, SLOTS)
	assert.deepEqual(FILM_HOTBAR.map((i) => i.id), ['bone', 'steak', 'lead', 'campfire', 'torch', 'bread', 'compass', 'map', 'book'])
	assert.deepEqual(FILM_HOTBAR.filter((i) => i.count).map((i) => [i.id, i.count]), [['bone', 6], ['steak', 8], ['torch', 24], ['bread', 12]])
})

test('geometry follows the game sprite (slots 3 + 20 i, selection 20 i - 1)', () => {
	assert.deepEqual(slotBox(0), { x: 3, y: 3, width: 16, height: 16 })
	assert.deepEqual(slotBox(8), { x: 163, y: 3, width: 16, height: 16 })
	assert.deepEqual(selectionBox(0), { x: -1, y: -1, width: 24, height: 23 })
	assert.deepEqual(selectionBox(3), { x: 59, y: -1, width: 24, height: 23 })
	assert.equal(selectionBox(8).x + 24, 183) // the frame of slot 9 ends 1 px beyond the 182 px bar, as in the game
	assert.equal(selectedIndex(1), 0)
	assert.equal(selectedIndex(9), 8)
	assert.equal(selectedIndex(0), 0)
	assert.equal(selectedIndex(12), 8)
	assert.equal(selectedIndex('x'), 0)
})

test('createHotbar builds nine cells, counts above one, tooltips with the English key, and selects slot 4', () => {
	const bar = createHotbar({ document: doc, t: (key) => `<${key}>` })
	assert.equal(bar.getAttribute('data-hud'), 'hotbar')
	assert.equal(bar.getAttribute('aria-hidden'), 'true')
	assert.ok(bar.className.includes('mc-hotbar--sprites'))
	const cells = bar.children.slice(0, 9)
	assert.equal(bar.children.length, 10)
	assert.equal(bar.children[9].className, 'mc-hotbar__sel')
	assert.equal(cells[0].getAttribute('data-item'), 'bone')
	assert.equal(cells[0].getAttribute('data-count'), '6')
	assert.equal(cells[0].children[0].textContent, '6')
	assert.equal(cells[2].hasAttribute('data-count'), false)
	assert.equal(cells[4].getAttribute('data-count'), '24')
	assert.equal(cells[3].children.at(-1).textContent, '<Campfire>')
	assert.equal(bar.style.values['--mc-hb-sel'], '3')
	assert.equal(bar.getAttribute('data-selected'), '4')
	assert.ok(cells[3].classList.contains('is-selected'))
	assert.equal(selectSlot(bar, 1), 1)
	assert.equal(bar.style.values['--mc-hb-sel'], '0')
	assert.ok(cells[0].classList.contains('is-selected') && !cells[3].classList.contains('is-selected'))
	relabel(bar, (key) => key.toUpperCase())
	assert.equal(bar.querySelectorAll('.mc-hotbar__tip')[8].textContent, 'BOOK AND QUILL')
})

test('Escape closes the tooltips and a pointer entering the bar reopens them', () => {
	const bar = createHotbar({ document: doc })
	const unbind = bindTooltips(bar, doc)
	doc.emit('keydown', { key: 'Enter' })
	assert.equal(bar.getAttribute('data-tips'), null)
	doc.emit('keydown', { key: 'Escape' })
	assert.equal(bar.getAttribute('data-tips'), 'off')
	bar.emit('pointerover')
	assert.equal(bar.getAttribute('data-tips'), null)
	unbind()
	assert.equal(doc.listeners.keydown.length, 0)
	assert.equal(bar.listeners.pointerover.length, 0)
})
