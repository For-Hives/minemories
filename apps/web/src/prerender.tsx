import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { firstPaintScript } from './components/HeroFilm'
import { I18nProvider } from './i18n/I18n'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { publicMetadata, siteOrigin, structuredDataFor } from './route-metadata'

export { publicMetadata, siteOrigin, structuredDataFor }
/** Inline scripts that run before the markup of a prerendered page paints (the home page's film sets <html> up there). */
export const firstPaintScripts: Record<string, string> = { '/': firstPaintScript }

export function renderPage(path: string) {
	return renderToString(
		<I18nProvider initialLocale="fr">
			<StaticRouter location={path}>{path === '/' ? <HomePage /> : <NotFoundPage />}</StaticRouter>
		</I18nProvider>
	)
}
