import { Suspense } from 'react'
import { renderToString } from 'react-dom/server'
import { Route, Routes, StaticRouter } from 'react-router'
import { AppContext } from './app-context'
import { SiteLayout } from './components/SiteLayout'
import { I18nProvider } from './i18n/I18n'
import { ArticlePage, BlogPage, LegalPage, NotFoundPage } from './pages/ContentPages'
import { DiscoveryPage, ExplorerPage, MarketingPage } from './pages/DiscoveryPages'
import { HomePage } from './pages/HomePage'
import { ConceptPage, FaqPage, HowItWorksPage } from './pages/InfoPages'
import { InstallationPage } from './pages/InstallationPage'
import { PricingPage } from './pages/PricingPage'
import { ReleasesPage } from './pages/ReleasesPage'
import { publicMetadata, siteOrigin, structuredDataFor } from './route-metadata'

export { publicMetadata, siteOrigin, structuredDataFor }

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
		case '/fonctionnement':
			content = <HowItWorksPage />
			break
		case '/installation':
			content = <InstallationPage />
			break
		case '/versions':
			content = <ReleasesPage />
			break
		case '/changelog':
			content = <ReleasesPage changelog />
			break
		case '/faq':
			content = <FaqPage />
			break
		case '/blog':
			content = <BlogPage />
			break
		case '/decouvrir':
			content = <DiscoveryPage />
			break
		case '/explorer':
			content = <ExplorerPage />
			break
		case '/classement':
			content = <ExplorerPage ranking />
			break
		case '/open-source':
		case '/nostalgie':
		case '/partager':
			content = <MarketingPage />
			break
		case '/pricing':
			content = <PricingPage />
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
