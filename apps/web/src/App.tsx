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
import { WebObservability } from './observability/WebObservability'

const HomePage = lazy(() => import('./pages/HomePage').then(module => ({ default: module.HomePage })))
const AuthPage = lazy(() => import('./pages/AuthPage').then(module => ({ default: module.AuthPage })))
const AccountPage = lazy(() => import('./pages/AccountPage').then(module => ({ default: module.AccountPage })))
const GalleryPage = lazy(() => import('./pages/GalleryPage').then(module => ({ default: module.GalleryPage })))
const ViewerPage = lazy(() => import('./pages/ViewerPage').then(module => ({ default: module.ViewerPage })))
const SharePage = lazy(() => import('./pages/SharePage').then(module => ({ default: module.SharePage })))
const InfoPages = () => import('./pages/InfoPages')
const ConceptPage = lazy(() => InfoPages().then(module => ({ default: module.ConceptPage })))
const HowItWorksPage = lazy(() => InfoPages().then(module => ({ default: module.HowItWorksPage })))
const FaqPage = lazy(() => InfoPages().then(module => ({ default: module.FaqPage })))
const InstallationPage = lazy(() =>
	import('./pages/InstallationPage').then(module => ({ default: module.InstallationPage }))
)
const DownloadsPage = lazy(() => import('./pages/DownloadsPage').then(module => ({ default: module.DownloadsPage })))
const ReleasesPage = lazy(() => import('./pages/ReleasesPage').then(module => ({ default: module.ReleasesPage })))
const RoadmapPage = lazy(() => import('./pages/RoadmapPage').then(module => ({ default: module.RoadmapPage })))
const GuidePages = () => import('./pages/GuidePages')
const ServerClosingPage = lazy(() => GuidePages().then(module => ({ default: module.ServerClosingPage })))
const SafetyPage = lazy(() => GuidePages().then(module => ({ default: module.SafetyPage })))
const BlenderGuidePage = lazy(() => GuidePages().then(module => ({ default: module.BlenderGuidePage })))
const ContentPages = () => import('./pages/ContentPages')
// Pricing is disabled for now (page kept in pages/PricingPage.tsx): re-enable this import and its route, the header/footer links and the metadata entry.
// const PricingPage = lazy(() => import('./pages/PricingPage').then(module => ({ default: module.PricingPage })))
const DiscoveryPages = () => import('./pages/DiscoveryPages')
const ExplorerPage = lazy(() => DiscoveryPages().then(module => ({ default: module.ExplorerPage })))
const SharingPage = lazy(() => import('./pages/SharingPage').then(module => ({ default: module.SharingPage })))
const LegalPage = lazy(() => ContentPages().then(module => ({ default: module.LegalPage })))
const NotFoundPage = lazy(() => ContentPages().then(module => ({ default: module.NotFoundPage })))
/** The pages reachable from the header and the footer: fetched once the browser is idle, so that a link opens its page without waiting. */
const publicPageChunks = [
	() => import('./pages/HomePage'),
	InfoPages,
	ContentPages,
	DiscoveryPages,
	() => import('./pages/InstallationPage'),
	() => import('./pages/DownloadsPage'),
	() => import('./pages/ReleasesPage'),
	() => import('./pages/RoadmapPage'),
	() => import('./pages/SharingPage'),
	GuidePages,
	() => import('./pages/AuthPage'),
]

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
