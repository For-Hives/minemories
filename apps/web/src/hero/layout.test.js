// @vitest-environment jsdom
// The panel's layout is computed twice on purpose: by site.js (dockOf, gridOf) and by the first-paint function (first-paint.js, inline in the prerendered page), "keep in step".
// This test is that step: the CSS variables written before the first paint equal the ones the film's own functions return, at the sizes that matter.
import { expect, test } from 'vitest'
import { prepareRoot } from './first-paint.js'
import { dockOf, formatOf, gridOf, headerHeight, keyAction, largeBandOf, smallBandOf, textMaxOf, widenedRect } from './site.js'

const SIZES = [
	[390, 844],
	[360, 640],
	[768, 1024],
	[820, 1180],
	[1024, 768],
	[1280, 800],
	[1440, 900],
	[1920, 1080],
	[2560, 1440],
]
const px = (root, name) => Number.parseFloat(root.style.getPropertyValue(name))

function rootOf(W, H) {
	const root = document.createElement('html')
	Object.defineProperty(root, 'clientHeight', { value: H })
	root.getBoundingClientRect = () => ({ width: W })
	return root
}

test('the first-paint variables equal dockOf / gridOf at every size', () => {
	for (const [W, H] of SIZES) {
		const root = rootOf(W, H)
		prepareRoot(root, { hash: '', search: '' })
		const dock = dockOf(W, H)
		expect(root.dataset.dock, `${W}x${H}`).toBe(dock.layout)
		expect(px(root, '--header-h'), `${W}x${H}`).toBe(headerHeight(W))
		expect(px(root, '--text-w'), `${W}x${H}`).toBe(dock.text.w)
		expect(px(root, '--text-l'), `${W}x${H}`).toBe(dock.text.l)
		if (dock.layout === 'side') {
			expect(px(root, '--dock-l'), `${W}x${H}`).toBe(dock.rect.l)
			expect(px(root, '--dock-w'), `${W}x${H}`).toBe(dock.rect.r - dock.rect.l)
			expect(px(root, '--dock-t'), `${W}x${H}`).toBe(dock.rect.t)
			expect(px(root, '--dock-h'), `${W}x${H}`).toBe(dock.rect.b - dock.rect.t)
		} else {
			expect(px(root, '--dock-h-large'), `${W}x${H}`).toBe(largeBandOf(H, W))
			expect(px(root, '--dock-h-small'), `${W}x${H}`).toBe(smallBandOf(H))
		}
	}
})

test('the layout rules of the panel', () => {
	expect(formatOf(390, 844)).toBe('phone')
	expect(formatOf(1440, 900)).toBe('wide')
	expect(formatOf(1100, 700)).toBe('tablet')
	expect(headerHeight(999)).toBe(56)
	expect(headerHeight(1000)).toBe(64)
	expect(textMaxOf(100)).toBe(760)
	expect(textMaxOf(4000)).toBe(1000)
	const grid = gridOf(1440)
	expect(grid.panelR).toBe(1440 - grid.e)
	expect(grid.textR + grid.e).toBeCloseTo(grid.panelL, 6)
	expect(dockOf(390, 844, { small: true }).rect.b - dockOf(390, 844, { small: true }).rect.t).toBe(smallBandOf(844))
	expect(keyAction('ArrowLeft')).not.toBeNull()
})

test('an anchor or ?nowebgl=1 starts on the site, and the root is restored to what it was', () => {
	const root = rootOf(1440, 900)
	root.className = 'kept'
	root.setAttribute('data-theme', 'x')
	root.setAttribute('style', 'color: red')
	document.body.classList.remove('mc-root')
	const restore = prepareRoot(root, { hash: '#faq', search: '' })
	expect(root.dataset.phase).toBe('site')
	expect(root.style.getPropertyValue('--g')).toBe('1')
	expect(root.classList.contains('is-scrub')).toBe(true)
	expect(document.body.classList.contains('mc-root')).toBe(true)
	// a second call (the client mount after the inline script) keeps the first baseline
	const again = prepareRoot(root, { hash: '', search: '?scrub=0' })
	expect(root.dataset.phase).toBe('film')
	expect(root.classList.contains('scene-on')).toBe(true)
	again()
	expect(root.className).toBe('kept')
	expect(root.getAttribute('style')).toBe('color: red')
	expect(root.getAttribute('data-theme')).toBe('x')
	expect(root.dataset.phase).toBeUndefined()
	expect(document.body.classList.contains('mc-root')).toBe(false)
	restore() // already restored: nothing happens
	const plain = rootOf(1440, 900)
	const undo = prepareRoot(plain, { hash: '', search: '?nowebgl=1&scrub=0' })
	expect(plain.classList.contains('scene-on')).toBe(false)
	expect(plain.classList.contains('is-scrub')).toBe(false)
	undo()
	expect(plain.getAttribute('style')).toBeNull()
})

test('the stored accessibility options are applied before the first paint', () => {
	localStorage.setItem('mcui-font', '1')
	localStorage.setItem('mcui-motion', '1')
	const root = rootOf(1440, 900)
	const restore = prepareRoot(root, { hash: '', search: '' })
	expect(root.getAttribute('data-mc-font')).toBe('read')
	expect(root.getAttribute('data-mc-motion')).toBe('reduced')
	restore()
	expect(root.getAttribute('data-mc-font')).toBeNull()
	localStorage.clear()
})

test('the panel takes the room the text leaves, never less than the grid gives it', () => {
	const rect = dockOf(1440, 900).rect
	expect(widenedRect(rect, { W: 1440 })).toBe(rect) // nothing measured: untouched
	expect(widenedRect(rect, { W: 1440, contentRight: Number.NaN })).toBe(rect)
	const narrow = widenedRect(rect, { W: 1440, contentRight: 610 }) // a short hero lead
	expect(narrow.l).toBeLessThan(rect.l)
	expect(narrow.l).toBeGreaterThanOrEqual(Math.round(1440 * 0.36)) // never past 36 % of the screen
	expect(narrow.r).toBe(rect.r)
	expect(narrow.t).toBe(rect.t)
	expect(narrow.b).toBe(rect.b)
	expect(widenedRect(rect, { W: 1440, contentRight: 793 }).l).toBe(832) // text as wide as its column: almost the grid's panel (842), 39 px of air
	expect(widenedRect(rect, { W: 1440, contentRight: 830 })).toBe(rect) // no room to gain: the grid's panel
	for (const right of [300, 500, 610, 700, 793]) expect(widenedRect(rect, { W: 1440, contentRight: right }).l - right).toBeGreaterThanOrEqual(24) // always 24 px of air
	expect(widenedRect(rect, { W: 1440, contentRight: 2000 })).toBe(rect)
	expect(widenedRect(rect, { W: 1440, contentRight: 100 }).l).toBe(Math.round(1440 * 0.36)) // very narrow text: the floor
	// quantised: two measures a few pixels apart give the same panel (no re-framing while scrolling)
	expect(widenedRect(rect, { W: 1440, contentRight: 611 }).l).toBe(widenedRect(rect, { W: 1440, contentRight: 615 }).l)
})
