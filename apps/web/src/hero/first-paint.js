// First-paint set-up of <html> for the film (from the inline script of hero.html, v10/v12). SELF-CONTAINED ON PURPOSE: HeroFilm.tsx serialises this function into an
// inline <script> of the prerendered page (`(${prepareRoot})(document.documentElement, location)`), so that the phase, the layout variables and the film class are on <html>
// before the first paint, and calls it again from the client when the film mounts after a client-side navigation. It must not reference anything outside itself.
//
// It returns `restore()`, which gives <html> back its class, style and data-* attributes as they were before the film (the film's CSS is global: `html.is-scrub` locks the
// scroll of the document, so nothing of it may survive on another route). The baseline is kept on the element so that the second call (client mount) restores to the
// state before the inline script too.
export function prepareRoot(root, location) {
	if (!root.__mmBase) {
		const data = {}
		for (const { name, value } of [...root.attributes]) if (name.startsWith('data-')) data[name] = value
		let scrollRestoration = null
		try {
			scrollRestoration = history.scrollRestoration
		} catch (e) {}
		root.__mmBase = {
			className: root.className,
			style: root.getAttribute('style'),
			data,
			scrollRestoration,
			bodyRoot: Boolean(document.body?.classList.contains('mc-root')),
		}
	}
	document.body?.classList.add('mc-root') // the kit's root class (colour, font, text rendering): on <body>, which the film does not own
	const direct = /^#(hero|main|steps|share|limits|faq)$/.test(location.hash) || /[?&]nowebgl=1/.test(location.search)
	root.dataset.phase = direct ? 'site' : 'film'
	// v10: the scroll drives the film unless ?scrub=0 (the v9d behaviour). The class locks the document during the film (site.css) and is read by hero.js.
	if (!/[?&]scrub=0/.test(location.search)) root.classList.add('is-scrub')
	root.style.setProperty('--g', direct ? '1' : '0')
	// The panel's layout is written here too (same formulas as dockOf and gridOf in site.js, keep in step): a link opened cold on #steps, #share or #faq is scrolled by the
	// browser as soon as the anchor exists, long before site.js runs; with `data-dock`, `--header-h` and the strip heights known from the first paint, scroll-padding-top
	// (site.css) puts the title under the header AND the strip.
	try {
		const W = Math.round(root.getBoundingClientRect().width) || root.clientWidth || innerWidth
		const H = root.clientHeight || innerHeight
		const header = W >= 1000 ? 64 : 56
		const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
		const set = (k, v) => root.style.setProperty(k, `${v}px`)
		root.dataset.dock = W / H >= 1.15 ? 'side' : 'band'
		set('--header-h', header)
		if (W / H < 1.15) {
			const phone = 0.34 + 0.04 * clamp((H - 700) / 144, 0, 1)
			const tablet = clamp((W - 600) / 100, 0, 1) * clamp((H - 900) / 180, 0, 1)
			set('--dock-h-large', Math.round(clamp((phone + tablet * (0.46 - phone)) * H, 200, 380 + tablet * 220)))
			set('--dock-h-small', Math.round(clamp(0.2 * H, 140, 220)))
			set('--text-l', 0)
			set('--text-w', Math.min(720, W))
		} else {
			const pad = clamp(0.035 * W, 16, 64)
			const Dw = clamp(0.38 * W, 300, 680)
			const Tw = Math.min(clamp(0.5 * W, 760, 1000), W - Dw - 3 * pad)
			const e = Math.max(pad, (W - Tw - Dw) / 3)
			set('--text-l', Math.round(e))
			set('--text-w', Math.round(Tw))
			set('--dock-l', Math.round(2 * e + Tw))
			set('--dock-w', Math.round(W - e) - Math.round(2 * e + Tw))
			set('--dock-t', header + 16)
			set('--dock-h', H - 16 - (header + 16))
		}
	} catch (e) {}
	if (!/[?&]nowebgl=1/.test(location.search)) root.classList.add('scene-on')
	// Accessibility options kept on this device (same keys as the kit): applied before the first paint.
	try {
		if (localStorage.getItem('mcui-font') === '1') root.setAttribute('data-mc-font', 'read')
		if (localStorage.getItem('mcui-motion') === '1') root.setAttribute('data-mc-motion', 'reduced')
	} catch (e) {}
	try {
		history.scrollRestoration = 'manual'
	} catch (e) {}
	return function restore() {
		const base = root.__mmBase
		if (!base) return
		delete root.__mmBase
		for (const { name } of [...root.attributes])
			if (name.startsWith('data-') && !(name in base.data)) root.removeAttribute(name)
		for (const [name, value] of Object.entries(base.data)) root.setAttribute(name, value)
		root.className = base.className
		if (!base.bodyRoot) document.body?.classList.remove('mc-root')
		if (base.style === null) root.removeAttribute('style')
		else root.setAttribute('style', base.style)
		try {
			if (base.scrollRestoration) history.scrollRestoration = base.scrollRestoration
		} catch (e) {}
	}
}
