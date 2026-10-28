// Minemories · the phases of the page. A tiny pure module: no DOM, no timers, importable under Node.
// v10 (decisions-v10 section 3.1): the page has a POSITION { t, g } (film time, glide 0 to 1) owned by the clock (scrub.js) and three phases that follow from it: `film` (g = 0), `glide` (0 < g < 1)
// and `site` (g = 1). `phaseOfPosition` is the whole rule. The event machine below is the v9 one (decisions-v9 section 11.1), kept for `?scrub=0`, which brings back the v9d behaviour:
// there the host (hero.js) feeds it events and applies the result: `html[data-phase]`, the `mm:phase` event, the scene's `setSitePhase`, the content fade.
//
//   const phases = createPhaseMachine({ phase: startPhase({ hash, webgl }) })
//   const { changed, phase, cause } = phases.event({ type: 'scroll', y: scrollY })
//
// Events:
//   { type: 'frame' }                      the first frame of the film was rendered: arms the scroll threshold
//   { type: 'time', t, playing }           film time while it plays: crossing `siteStart` ends the film
//   { type: 'scroll', y }                  document scroll position
//   { type: 'skip' }                       the "Skip the film" button
//   { type: 'key', key }                   Escape
//   { type: 'focus', content }             keyboard focus moved; `content` is true inside the site content (never for the film's own controls)
//   { type: 'step', index, count, dir }    reduced-motion "Next" on the last station
//   { type: 'replay' }                     "Watch the film again"
//   { type: 'goto', t }                    a test (or a chapter key) travelled in the film while the site was shown
// Causes (the `mm:phase` detail): end, skip, key, scroll, focus, replay (and goto for tests).

/** v10: the phase of a position. The glide only exists at the site start (g > 0 only when t is there). */
export const phaseOfPosition = ({ g = 0 } = {}) => (g >= 1 ? 'site' : g > 0 ? 'glide' : 'film')
export const PHASES = Object.freeze(['film', 'glide', 'site'])
/** v10: causes of a phase change (`mm:phase` detail.cause). */
export const CAUSES = Object.freeze(['end', 'scroll', 'skip', 'key', 'focus', 'rewind', 'replay', 'goto', 'start', 'fallback', 'chapter', 'home', 'station'])

/** Scrolling further than this (px), once the first frame is rendered, hands over to the site. */
export const SCROLL_THRESHOLD = 32
/** The film hands over to the site at this film time (STORY.site.start in the scene: the page reads the real value). */
export const DEFAULT_SITE_START = 55.5
/** Anchors that start directly on the site (the film is not played, the model is already in place). */
export const SITE_HASHES = Object.freeze(['hero', 'main', 'steps', 'share', 'limits', 'faq'])

/** A URL anchor naming a site section, or a browser without WebGL 2, starts on the site. */
export function startPhase({ hash = '', webgl = true } = {}) {
	if (!webgl) return 'site'
	return SITE_HASHES.includes(String(hash).replace(/^#/, '')) ? 'site' : 'film'
}

export function createPhaseMachine({ siteStart = DEFAULT_SITE_START, threshold = SCROLL_THRESHOLD, phase = 'film' } = {}) {
	let current = phase
	let cause = phase === 'site' ? 'start' : null
	// A site that starts from an anchor is armed at once: nothing is left to skip.
	let armed = phase === 'site'
	const stay = () => ({ changed: false, phase: current, cause })
	const go = (next, why) => {
		if (current === next) return stay()
		current = next
		cause = why
		return { changed: true, phase: current, cause }
	}
	return {
		get phase() {
			return current
		},
		get cause() {
			return cause
		},
		get armed() {
			return armed
		},
		event(e) {
			switch (e.type) {
				case 'frame':
					armed = true
					return stay()
				case 'time':
					return current === 'film' && e.playing && e.t >= siteStart - 1e-9 ? go('site', 'end') : stay()
				case 'scroll':
					return current === 'film' && armed && e.y > threshold ? go('site', 'scroll') : stay()
				case 'skip':
					return current === 'film' ? go('site', 'skip') : stay()
				case 'key':
					return current === 'film' && e.key === 'Escape' ? go('site', 'key') : stay()
				case 'focus':
					return current === 'film' && e.content ? go('site', 'focus') : stay()
				case 'step':
					return current === 'film' && e.dir > 0 && e.index >= e.count - 1 ? go('site', 'end') : stay()
				case 'replay':
					// The next film must be rendered before scrolling can skip it again.
					if (current === 'site') armed = false
					return current === 'site' ? go('film', 'replay') : stay()
				case 'goto':
					return current === 'site' ? go('film', 'goto') : stay()
				default:
					return stay()
			}
		},
	}
}
