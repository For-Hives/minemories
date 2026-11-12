import { Suspense } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { AppContext } from './app-context'
import { firstPaintScript } from './components/HeroFilm'
import { SiteLayout } from './components/SiteLayout'
import { loadLocale } from './i18n/catalog'
import { I18nProvider } from './i18n/I18n'
import { localeOptions } from './i18n/locales'
import { ogLocale } from './lib/link-language'
import { LegalPage, NotFoundPage } from './pages/ContentPages'
import { ExplorerPage } from './pages/DiscoveryPages'
import { DownloadsPage } from './pages/DownloadsPage'
import { BlenderGuidePage, SafetyPage, ServerClosingPage } from './pages/GuidePages'
import { HomePage } from './pages/HomePage'
import { ConceptPage, FaqPage, HowItWorksPage } from './pages/InfoPages'
import { InstallationPage } from './pages/InstallationPage'
import { ReleasesPage } from './pages/ReleasesPage'
import { RoadmapPage } from './pages/RoadmapPage'
import { SharingPage } from './pages/SharingPage'
import { headFor, publicMetadata, sharedLinkPath, siteOrigin, socialImage } from './route-metadata'
import { structuredDataFor } from './structured-data'

export { headFor, publicMetadata, sharedLinkPath, siteOrigin, socialImage, structuredDataFor }
/** English is the default head; every other language gets its own head variant, served for `?lang=<id>`. */
export const previewLanguages = localeOptions
	.filter(option => option.id !== 'en')
	.map(option => ({ id: option.id, ogLocale: ogLocale(option.id) }))
export async function loadPreviewLanguages() {
	await Promise.all(previewLanguages.map(language => loadLocale(language.id)))
}
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
		case '/server-closing':
			content = <ServerClosingPage />
			break
		case '/safety':
			content = <SafetyPage />
			break
		case '/guides/minecraft-blender':
			content = <BlenderGuidePage />
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
