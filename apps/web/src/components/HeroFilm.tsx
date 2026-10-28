import { useEffect, useLayoutEffect, useMemo } from 'react'
import filmCss from '../hero/film.css?raw'
import { prepareRoot } from '../hero/first-paint.js'
import { useI18n } from '../i18n/I18n'
import { createHeroI18n } from '../lib/hero-i18n'
import { reportWebFailure } from '../observability/WebObservability'
import { HeroMarkup } from './HeroMarkup'

/** Folder of the GLB captures (static files, apps/web/public/hero/captures). */
export const capturesUrl = '/hero/captures/'
/** Inline script of the prerendered `/` (scripts/prerender-web.mjs puts it before the app's markup): the phase, the layout variables and the film class are on <html> before the page is drawn. */
export const firstPaintScript = `(${prepareRoot.toString()})(document.documentElement, location)`

/**
 * The home page's film: a Three.js scene driven by the scroll, the game's own interface over it, then the site. Everything is client-only: the prerender holds the markup
 * (and so the story in words and the whole site), the film code is a separate chunk loaded after the first render, and without WebGL the site stays as the page.
 * The film's CSS is global (it styles <html>, <body>, main...): it lives in a <style> of this component, so it exists only while the home page does.
 */
export function HeroFilm() {
	const { locale } = useI18n()
	const i18n = useMemo(() => createHeroI18n(locale), [])
	useLayoutEffect(() => prepareRoot(document.documentElement, window.location), [])
	useEffect(() => {
		let cancelled = false
		let dispose: (() => void) | undefined
		import('../hero/hero.js')
			.then(({ mountHero }) => {
				if (!cancelled) dispose = mountHero({ i18n, capturesUrl })
			})
			.catch(() => reportWebFailure('page-render'))
		return () => {
			cancelled = true
			dispose?.()
		}
	}, [i18n])
	useEffect(() => i18n.set(locale), [i18n, locale])
	return (
		<>
			<style dangerouslySetInnerHTML={{ __html: filmCss }} />
			<HeroMarkup />
		</>
	)
}
