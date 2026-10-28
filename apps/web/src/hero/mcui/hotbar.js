// hotbar.js · builds and drives the real hotbar of the film (CSS: mcui.css, "REAL HOTBAR"). Dependency-free ES module, loads in Node (tests).
// The host (hud.js) only calls selectSlot(bar, hudAt(t).hotbar.selected) and toggles .is-on; names come from the catalogues (t).
//
//   import { createHotbar, selectSlot, relabel, bindTooltips, FILM_HOTBAR } from './mcui/hotbar.js'
//   const bar = createHotbar({ t: i18n.t })        // <div class="mc-hotbar mc-hotbar--film mc-hotbar--sprites" data-hud="hotbar">
//   film.append(bar); selectSlot(bar, 4)           // slot numbers are the game's number keys: 1 to 9
//   i18n.onChange(() => relabel(bar, i18n.t))      // tooltips follow the language
//   const unbind = bindTooltips(bar)               // Escape closes the tooltips (WCAG 1.4.13); a pointer entering another slot reopens them

export const SLOTS = 9
/** The nine objects of the film, in the order of the story (decisions-v9 section 5.1). `name` is the English i18n key (the game's own name). */
export const FILM_HOTBAR = Object.freeze([
	Object.freeze({ id: 'bone', name: 'Bone', count: 6 }),
	Object.freeze({ id: 'steak', name: 'Steak', count: 8 }),
	Object.freeze({ id: 'lead', name: 'Lead' }),
	Object.freeze({ id: 'campfire', name: 'Campfire' }),
	Object.freeze({ id: 'torch', name: 'Torch', count: 24 }),
	Object.freeze({ id: 'bread', name: 'Bread', count: 12 }),
	Object.freeze({ id: 'compass', name: 'Compass' }),
	Object.freeze({ id: 'map', name: 'Map' }),
	Object.freeze({ id: 'book', name: 'Book and Quill' }),
])

/** Slot number (1 to 9) to the zero-based index used by --mc-hb-sel; clamps. */
export function selectedIndex(slot) {
	const n = Math.round(Number(slot))
	return Math.min(SLOTS, Math.max(1, Number.isFinite(n) ? n : 1)) - 1
}
/** Geometry in sprite pixels, as in the game: slots at x = 3 + 20 i, y = 3 (16 x 16); selection frame (24 x 23) at x = 20 i - 1, y = -1. */
export const slotBox = (index) => ({ x: 3 + 20 * index, y: 3, width: 16, height: 16 })
export const selectionBox = (index) => ({ x: 20 * index - 1, y: -1, width: 24, height: 23 })

function element(doc, tag, className) {
	const node = doc.createElement(tag)
	if (className) node.className = className
	return node
}

export function createHotbar({ items = FILM_HOTBAR, t = (key) => key, selected = 4, document: doc = globalThis.document } = {}) {
	const bar = element(doc, 'div', 'mc-hotbar mc-hotbar--film mc-hotbar--sprites')
	bar.setAttribute('data-hud', 'hotbar')
	bar.setAttribute('aria-hidden', 'true')
	items.slice(0, SLOTS).forEach((item) => {
		const cell = element(doc, 'span', 'mc-hotbar__cell')
		cell.setAttribute('data-item', item.id)
		if (item.count > 1) {
			cell.setAttribute('data-count', String(item.count))
			const count = element(doc, 'span', 'mc-hotbar__count')
			count.textContent = String(item.count)
			cell.append(count)
		}
		const tip = element(doc, 'span', 'mc-hotbar__tip')
		tip.setAttribute('role', 'tooltip')
		tip.setAttribute('data-name', item.name)
		tip.textContent = t(item.name)
		cell.append(tip)
		bar.append(cell)
	})
	const frame = element(doc, 'i', 'mc-hotbar__sel')
	bar.append(frame)
	selectSlot(bar, selected)
	return bar
}

/** Moves the selection frame. A pure attribute and variable write: safe to call every frame. */
export function selectSlot(bar, slot) {
	const index = selectedIndex(slot)
	bar.style.setProperty('--mc-hb-sel', String(index))
	bar.setAttribute('data-selected', String(index + 1))
	const cells = bar.children
	for (let i = 0; i < SLOTS && i < cells.length; i++) {
		const cell = cells[i]
		if (!cell.classList || !cell.hasAttribute?.('data-item')) continue
		cell.classList.toggle('is-selected', i === index)
	}
	return index + 1
}

/** Rewrites the tooltips in the current language (call from i18n.onChange). */
export function relabel(bar, t) {
	for (const tip of bar.querySelectorAll('.mc-hotbar__tip')) tip.textContent = t(tip.getAttribute('data-name'))
}

/** Escape closes the tooltips until the pointer enters another slot. Returns an unbind function. */
export function bindTooltips(bar, doc = globalThis.document) {
	const onKey = (event) => {
		if (event.key === 'Escape') bar.setAttribute('data-tips', 'off')
	}
	const onEnter = () => bar.removeAttribute('data-tips')
	doc.addEventListener('keydown', onKey)
	bar.addEventListener('pointerover', onEnter)
	return () => {
		doc.removeEventListener('keydown', onKey)
		bar.removeEventListener('pointerover', onEnter)
	}
}
