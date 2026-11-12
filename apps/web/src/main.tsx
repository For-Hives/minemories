import { createRoot, hydrateRoot } from 'react-dom/client'
import { App, loadPrerenderedPage } from './App'
import { loadLocale } from './i18n/catalog'
import { resolveLocale } from './i18n/locales'
import { savedLanguageRedirect, splitLocalePath } from './lib/locale-path'
import { savedLocaleKey } from './lib/locale-suggestion'
import './theme.css'
import './pages/installation.css'
import './album.css'
import './pages/auth.css'
// The landing design system on every page: tokens, then the game kit (fonts, colours, buttons, panels), then the app pages' styling.
import './hero/tokens.css'
import './hero/kit.css'
import './charter-app.css'
// The site's bar (SiteNav), on every page and the landing: after the kit, so its rules win over the kit's buttons and icons.
import './components/site-nav.css'
// The explainers' pictograms and diagrams (concept, how it works, FAQ, guides, sharing, legal): in the first stylesheet, so a prerendered page does not paint them unstyled and then jump when its chunk's CSS arrives.
// Last, as when they came with their page's chunk: their rules (the FAQ and question headings among them) must keep winning over charter-app.css.
import './components/explainers.css'

function savedLocale() {
	try {
		return resolveLocale(localStorage.getItem(savedLocaleKey) ?? '')
	} catch {
		/* Preferences are optional. */
		return null
	}
}
const trailingSlash = /\/$/
async function start(container: HTMLElement) {
	const { locale, path } = splitLocalePath(window.location.pathname)
	// The page's language must be here before the first render, or hydration would mismatch the static HTML.
	await loadLocale(locale).catch(() => undefined)
	const initialPath = path.replace(trailingSlash, '') || '/'
	const route = window.location.pathname.replace(trailingSlash, '') || '/'
	// A prerendered page is hydrated once its chunk is loaded (the HTML stays on screen meanwhile): see loadPrerenderedPage.
	if (container.dataset.prerendered === 'true' && container.dataset.route === route) {
		const hydrate = () => hydrateRoot(container, <App />)
		const pageChunk = loadPrerenderedPage(initialPath)
		if (pageChunk) void pageChunk.then(hydrate)
		else hydrate()
	} else createRoot(container).render(<App />)
}

const container = document.getElementById('app')
if (!container) throw new Error('Application root not found.')
// A saved language opens its own page (/fr/faq for /faq) before anything renders; a prefixed URL is never redirected.
const redirect = savedLanguageRedirect(window.location, savedLocale())
if (redirect) window.location.replace(redirect)
else void start(container)
