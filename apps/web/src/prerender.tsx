import { Suspense } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { AppContext } from './app-context'
import { firstPaintScript } from './components/HeroFilm'
import { SiteLayout } from './components/SiteLayout'
import { I18nProvider } from './i18n/I18n'
import { LegalPage, NotFoundPage } from './pages/ContentPages'
import { ExplorerPage } from './pages/DiscoveryPages'
import { DownloadsPage } from './pages/DownloadsPage'
import { HomePage } from './pages/HomePage'
import { ConceptPage, FaqPage, HowItWorksPage } from './pages/InfoPages'
import { InstallationPage } from './pages/InstallationPage'
import { ReleasesPage } from './pages/ReleasesPage'
import { RoadmapPage } from './pages/RoadmapPage'
import { SharingPage } from './pages/SharingPage'
import { appShell, publicMetadata, siteOrigin, socialImage } from './route-metadata'
import { structuredDataFor } from './structured-data'

export { appShell, publicMetadata, siteOrigin, socialImage, structuredDataFor }
/** Inline scripts that run before the markup of a prerendered page paints (the home page's film sets <html> up there). */
export const firstPaintScripts: Record<string, string> = { '/': firstPaintScript }

const context = {
	session: null,
	isPending: true,
	refreshSession: async () => undefined,
	viewerFile: null,
	setViewerFile: () => undefined,
	notify: () => undefined,
}
export function renderPage(path: string) {
	let content = <NotFoundPage />
	switch (path) {
		case '/':
			content = <HomePage />
			break
		case '/concept':
			content = <ConceptPage />
			break
		case '/how-it-works':
			content = <HowItWorksPage />
			break
		case '/installation':
			content = <InstallationPage />
			break
		case '/downloads':
			content = <DownloadsPage />
			break
		case '/versions':
			content = <ReleasesPage />
			break
		case '/roadmap':
			content = <RoadmapPage />
			break
		case '/faq':
			content = <FaqPage />
			break
		case '/explore':
			content = <ExplorerPage />
			break
		case '/sharing':
			content = <SharingPage />
			break
		case '/privacy':
			content = <LegalPage kind="privacy" />
			break
		case '/terms':
			content = <LegalPage kind="terms" />
			break
		case '/legal':
			content = <LegalPage kind="legal" />
			break
	}
	return renderToString(
		<I18nProvider initialLocale="fr">
			<AppContext.Provider value={context}>
				<StaticRouter location={path}>
					<SiteLayout>
						<Suspense>{content}</Suspense>
					</SiteLayout>
				</StaticRouter>
			</AppContext.Provider>
		</I18nProvider>
	)
}
