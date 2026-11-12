import { createRoot, hydrateRoot } from 'react-dom/client'
import { App, loadPrerenderedPage } from './App'
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

const container = document.getElementById('app')
if (!container) throw new Error('Application root not found.')

const initialPath = window.location.pathname.replace(/\/$/, '') || '/'
// A prerendered page is hydrated once its chunk is loaded (the HTML stays on screen meanwhile): see loadPrerenderedPage.
if (container.dataset.prerendered === 'true' && container.dataset.route === initialPath) {
	const hydrate = () => hydrateRoot(container, <App />)
	const pageChunk = loadPrerenderedPage(initialPath)
	if (pageChunk) void pageChunk.then(hydrate)
	else hydrate()
} else createRoot(container).render(<App />)
