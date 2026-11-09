import { Suspense } from 'react'
import { renderToString } from 'react-dom/server'
import { Route, Routes, StaticRouter } from 'react-router'
import { AppContext } from './app-context'
import { firstPaintScript } from './components/HeroFilm'
import { SiteLayout } from './components/SiteLayout'
import { I18nProvider } from './i18n/I18n'
import { ArticlePage, BlogPage, LegalPage, NotFoundPage } from './pages/ContentPages'
import { DiscoveryPage, ExplorerPage, MarketingPage } from './pages/DiscoveryPages'
import { DownloadsPage } from './pages/DownloadsPage'
import { HomePage } from './pages/HomePage'
import { ConceptPage, FaqPage, HowItWorksPage } from './pages/InfoPages'
import { InstallationPage } from './pages/InstallationPage'
import { ReleasesPage } from './pages/ReleasesPage'
import { RoadmapPage } from './pages/RoadmapPage'
import { publicMetadata, siteOrigin, socialImage } from './route-metadata'
import { structuredDataFor } from './structured-data'

export { publicMetadata, siteOrigin, socialImage, structuredDataFor }
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
		case '/changelog':
			content = <ReleasesPage changelog />
			break
		case '/roadmap':
			content = <RoadmapPage />
			break
		case '/faq':
			content = <FaqPage />
			break
		case '/blog':
			content = <BlogPage />
			break
		case '/discover':
			content = <DiscoveryPage />
			break
		case '/explore':
			content = <ExplorerPage />
			break
		case '/ranking':
			content = <ExplorerPage ranking />
			break
		case '/open-source':
		case '/nostalgia':
		case '/sharing':
			content = <MarketingPage />
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
		default:
			if (path.startsWith('/blog/')) content = <ArticlePage />
	}
	// Routes supply article params consistently with the browser router.
	return renderToString(
		<I18nProvider initialLocale="fr">
			<AppContext.Provider value={context}>
				<StaticRouter location={path}>
					<SiteLayout>
						<Suspense>{path.startsWith('/blog/') ? <StaticArticle path={path} /> : content}</Suspense>
					</SiteLayout>
				</StaticRouter>
			</AppContext.Provider>
		</I18nProvider>
	)
}

function StaticArticle({ path }: { path: string }) {
	return (
		<Routes location={path}>
			<Route path="/blog/:slug" element={<ArticlePage />} />
		</Routes>
	)
}
