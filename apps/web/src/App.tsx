import { lazy, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { adminRoutes } from './admin-routes'
import { AppContext, type AppContextValue, useAppContext } from './app-context'
import { authClient } from './auth-client'
import { LanguageSuggestion } from './components/LanguageSuggestion'
import { Page, preloadWhenIdle } from './components/PageFrame'
import { RouteMetadata } from './components/RouteMetadata'
import { SiteLayout } from './components/SiteLayout'
import { legacyPaths } from './content/legacy-paths'
import { I18nProvider } from './i18n/I18n'
import { lazyExport, type PageChunk, pageChunk } from './lib/page-chunk'
import { WebObservability } from './observability/WebObservability'

const HomePage = lazy(() => import('./pages/HomePage').then(module => ({ default: module.HomePage })))
const AuthPage = lazy(() => import('./pages/AuthPage').then(module => ({ default: module.AuthPage })))
const AccountPage = lazy(() => import('./pages/AccountPage').then(module => ({ default: module.AccountPage })))
const GalleryPage = lazy(() => import('./pages/GalleryPage').then(module => ({ default: module.GalleryPage })))
const ViewerPage = lazy(() => import('./pages/ViewerPage').then(module => ({ default: module.ViewerPage })))
const SharePage = lazy(() => import('./pages/SharePage').then(module => ({ default: module.SharePage })))
// The prerendered pages but the landing: once their chunk is loaded they render without suspending (lib/page-chunk.ts).
const InfoPages = pageChunk(() => import('./pages/InfoPages'))
const ConceptPage = lazy(lazyExport(InfoPages, module => module.ConceptPage))
const HowItWorksPage = lazy(lazyExport(InfoPages, module => module.HowItWorksPage))
const FaqPage = lazy(lazyExport(InfoPages, module => module.FaqPage))
const InstallationChunk = pageChunk(() => import('./pages/InstallationPage'))
const InstallationPage = lazy(lazyExport(InstallationChunk, module => module.InstallationPage))
const DownloadsChunk = pageChunk(() => import('./pages/DownloadsPage'))
const DownloadsPage = lazy(lazyExport(DownloadsChunk, module => module.DownloadsPage))
const ReleasesChunk = pageChunk(() => import('./pages/ReleasesPage'))
const ReleasesPage = lazy(lazyExport(ReleasesChunk, module => module.ReleasesPage))
const RoadmapChunk = pageChunk(() => import('./pages/RoadmapPage'))
const RoadmapPage = lazy(lazyExport(RoadmapChunk, module => module.RoadmapPage))
const GuidePages = pageChunk(() => import('./pages/GuidePages'))
const ServerClosingPage = lazy(lazyExport(GuidePages, module => module.ServerClosingPage))
const SafetyPage = lazy(lazyExport(GuidePages, module => module.SafetyPage))
const BlenderGuidePage = lazy(lazyExport(GuidePages, module => module.BlenderGuidePage))
const ContentPages = pageChunk(() => import('./pages/ContentPages'))
// Pricing is disabled for now (page kept in pages/PricingPage.tsx): re-enable this import and its route, the header/footer links and the metadata entry.
// const PricingPage = lazy(() => import('./pages/PricingPage').then(module => ({ default: module.PricingPage })))
const DiscoveryPages = pageChunk(() => import('./pages/DiscoveryPages'))
const ExplorerPage = lazy(lazyExport(DiscoveryPages, module => module.ExplorerPage))
const SharingChunk = pageChunk(() => import('./pages/SharingPage'))
const SharingPage = lazy(lazyExport(SharingChunk, module => module.SharingPage))
const LegalPage = lazy(lazyExport(ContentPages, module => module.LegalPage))
const NotFoundPage = lazy(lazyExport(ContentPages, module => module.NotFoundPage))
/** The pages reachable from the header and the footer: fetched once the browser is idle, so that a link opens its page without waiting. */
const publicPageChunks = [
	() => import('./pages/HomePage'),
	InfoPages.load,
	ContentPages.load,
	DiscoveryPages.load,
	InstallationChunk.load,
	DownloadsChunk.load,
	ReleasesChunk.load,
	RoadmapChunk.load,
	SharingChunk.load,
	GuidePages.load,
	() => import('./pages/AuthPage'),
]

/** The chunk of each prerendered page but the landing (whose film loads itself). main.tsx waits for it before hydrating, so the page hydrates in place instead of flashing its empty fallback (lib/page-chunk.ts says why). */
const prerenderedPageChunks: Record<string, PageChunk<unknown>> = {
	'/concept': InfoPages,
	'/how-it-works': InfoPages,
	'/faq': InfoPages,
	'/installation': InstallationChunk,
	'/downloads': DownloadsChunk,
	'/versions': ReleasesChunk,
	'/roadmap': RoadmapChunk,
	'/server-closing': GuidePages,
	'/safety': GuidePages,
	'/guides/minecraft-blender': GuidePages,
	'/explore': DiscoveryPages,
	'/sharing': SharingChunk,
	'/privacy': ContentPages,
	'/terms': ContentPages,
	'/legal': ContentPages,
}
/** Resolves once the chunk of a prerendered page is loaded (at once for any other path). A failed load resolves too: the page is then fetched on demand, as before. */
export function loadPrerenderedPage(pathname: string): Promise<void> {
	const chunk = prerenderedPageChunks[pathname]
	if (!chunk) return Promise.resolve()
	return chunk.load().then(
		() => undefined,
		() => undefined
	)
}

function LegacyRedirect({ to }: { to: string }) {
	const { search, hash } = useLocation()
	return <Navigate to={{ pathname: to, search, hash }} replace />
}
function RequireSession() {
	const { session, isPending } = useAppContext()
	const location = useLocation()
	if (isPending) return <div className="mm-page-pending" aria-hidden="true" />
	if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
	return <Outlet />
}
export function App() {
	const { data, isPending, refetch } = authClient.useSession()
	const [viewerFile, setViewerFile] = useState<File | null>(null)
	const [notice, setNotice] = useState('')
	const context: AppContextValue = {
		session: data,
		isPending,
		refreshSession: async () => {
			await refetch()
		},
		viewerFile,
		setViewerFile,
		notify: setNotice,
	}
	useEffect(() => preloadWhenIdle(publicPageChunks), [])
	useEffect(() => {
		if (!notice) return
		const timeout = window.setTimeout(() => setNotice(''), 5200)
		return () => window.clearTimeout(timeout)
	}, [notice])
	return (
		// Every page renders in its own language (or the visitor's saved choice); the browser's language is only suggested.
		<I18nProvider suggestLocale>
			<AppContext.Provider value={context}>
				<BrowserRouter>
					<RouteMetadata />
					<WebObservability />
					<Routes>
						<Route element={<SiteLayout notice={notice} />}>
							<Route
								path="/explore"
								element={
									<Page>
										<ExplorerPage />
									</Page>
								}
							/>
							<Route
								path="/sharing"
								element={
									<Page>
										<SharingPage />
									</Page>
								}
							/>
							<Route
								index
								element={
									<Page kind="home">
										<HomePage />
									</Page>
								}
							/>
							<Route
								path="/concept"
								element={
									<Page>
										<ConceptPage />
									</Page>
								}
							/>
							<Route
								path="/how-it-works"
								element={
									<Page>
										<HowItWorksPage />
									</Page>
								}
							/>
							<Route
								path="/installation"
								element={
									<Page>
										<InstallationPage />
									</Page>
								}
							/>
							<Route
								path="/downloads"
								element={
									<Page>
										<DownloadsPage />
									</Page>
								}
							/>
							<Route
								path="/versions"
								element={
									<Page>
										<ReleasesPage />
									</Page>
								}
							/>
							<Route
								path="/roadmap"
								element={
									<Page>
										<RoadmapPage />
									</Page>
								}
							/>
							<Route
								path="/server-closing"
								element={
									<Page>
										<ServerClosingPage />
									</Page>
								}
							/>
							<Route
								path="/safety"
								element={
									<Page>
										<SafetyPage />
									</Page>
								}
							/>
							<Route
								path="/guides/minecraft-blender"
								element={
									<Page>
										<BlenderGuidePage />
									</Page>
								}
							/>
							<Route
								path="/faq"
								element={
									<Page>
										<FaqPage />
									</Page>
								}
							/>
							{/* Pricing disabled (falls through to the 404 page):
							<Route
								path="/pricing"
								element={
									<Page>
										<PricingPage />
									</Page>
								}
							/>
							*/}
							<Route
								path="/privacy"
								element={
									<Page>
										<LegalPage kind="privacy" />
									</Page>
								}
							/>
							<Route
								path="/terms"
								element={
									<Page>
										<LegalPage kind="terms" />
									</Page>
								}
							/>
							<Route
								path="/legal"
								element={
									<Page>
										<LegalPage kind="legal" />
									</Page>
								}
							/>
							<Route
								path="/login"
								element={
									<Page>
										<AuthPage mode="login" />
									</Page>
								}
							/>
							<Route
								path="/register"
								element={
									<Page>
										<AuthPage mode="register" />
									</Page>
								}
							/>
							<Route element={<RequireSession />}>
								<Route
									path="/account"
									element={
										<Page>
											<AccountPage />
										</Page>
									}
								/>
								{adminRoutes}
								<Route
									path="/gallery"
									element={
										<Page kind="gallery">
											<GalleryPage />
										</Page>
									}
								/>
							</Route>
							<Route
								path="/viewer"
								element={
									<Page kind="viewer">
										<ViewerPage />
									</Page>
								}
							/>
							<Route
								path="/public/:id"
								element={
									<Page kind="viewer">
										<SharePage isPublic />
									</Page>
								}
							/>
							<Route
								path="/share/:token"
								element={
									<Page kind="viewer">
										<SharePage />
									</Page>
								}
							/>
							{Object.entries(legacyPaths).map(([from, to]) => (
								<Route key={from} path={from} element={<LegacyRedirect to={to} />} />
							))}
							<Route
								path="*"
								element={
									<Page>
										<NotFoundPage />
									</Page>
								}
							/>
						</Route>
					</Routes>
					{/* After the routes: drawn in a corner, it must come after the skip link and the header in the Tab order. */}
					<LanguageSuggestion />
				</BrowserRouter>
			</AppContext.Provider>
		</I18nProvider>
	)
}
