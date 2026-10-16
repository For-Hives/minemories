import { Component, lazy, type ReactNode, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { AppContext, type AppContextValue, useAppContext } from './app-context'
import { authClient } from './auth-client'
import { LoadingSkeleton } from './components/Loading'
import { RouteMetadata } from './components/RouteMetadata'
import { SiteLayout } from './components/SiteLayout'
import { I18nProvider, T } from './i18n/I18n'
import { reportWebFailure, WebObservability } from './observability/WebObservability'

const HomePage = lazy(() => import('./pages/HomePage').then(module => ({ default: module.HomePage })))
const AuthPage = lazy(() => import('./pages/AuthPage').then(module => ({ default: module.AuthPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then(module => ({ default: module.AdminPage })))
const AccountPage = lazy(() => import('./pages/AccountPage').then(module => ({ default: module.AccountPage })))
const GalleryPage = lazy(() => import('./pages/GalleryPage').then(module => ({ default: module.GalleryPage })))
const ViewerPage = lazy(() => import('./pages/ViewerPage').then(module => ({ default: module.ViewerPage })))
const SharePage = lazy(() => import('./pages/SharePage').then(module => ({ default: module.SharePage })))
const ModerationPage = lazy(() =>
	import('./pages/PublicDiscovery').then(module => ({ default: module.ModerationPage }))
)
const DiagnosticsPage = lazy(() =>
	import('./pages/DiagnosticsPage').then(module => ({ default: module.DiagnosticsPage }))
)
const InfoPages = () => import('./pages/InfoPages')
const ConceptPage = lazy(() => InfoPages().then(module => ({ default: module.ConceptPage })))
const HowItWorksPage = lazy(() => InfoPages().then(module => ({ default: module.HowItWorksPage })))
const FaqPage = lazy(() => InfoPages().then(module => ({ default: module.FaqPage })))
const InstallationPage = lazy(() =>
	import('./pages/InstallationPage').then(module => ({ default: module.InstallationPage }))
)
const ReleasesPage = lazy(() => import('./pages/ReleasesPage').then(module => ({ default: module.ReleasesPage })))
const ContentPages = () => import('./pages/ContentPages')
const BlogPage = lazy(() => ContentPages().then(module => ({ default: module.BlogPage })))
const ArticlePage = lazy(() => ContentPages().then(module => ({ default: module.ArticlePage })))
const PricingPage = lazy(() => import('./pages/PricingPage').then(module => ({ default: module.PricingPage })))
const DiscoveryPages = () => import('./pages/DiscoveryPages')
const DiscoveryPage = lazy(() => DiscoveryPages().then(module => ({ default: module.DiscoveryPage })))
const MarketingPage = lazy(() => DiscoveryPages().then(module => ({ default: module.MarketingPage })))
const ExplorerPage = lazy(() => DiscoveryPages().then(module => ({ default: module.ExplorerPage })))
const LegalPage = lazy(() => ContentPages().then(module => ({ default: module.LegalPage })))
const NotFoundPage = lazy(() => ContentPages().then(module => ({ default: module.NotFoundPage })))

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch() {
		reportWebFailure('page-render')
	}
	render() {
		if (this.state.failed)
			return (
				<div className="mm-content" role="alert">
					<h1>
						<T message="Page loading interrupted" />
					</h1>
					<p>
						<T message="The page could not be loaded. Reload it to try again." />
					</p>
					<button className="mm-button" type="button" onClick={() => window.location.reload()}>
						<T message="Reload the page" />
					</button>
				</div>
			)
		return this.props.children
	}
}
function Page({ children, kind = 'page' }: { children: ReactNode; kind?: 'page' | 'gallery' | 'viewer' }) {
	const { pathname } = useLocation()
	return (
		<PageBoundary key={pathname}>
			<Suspense fallback={<LoadingSkeleton kind={kind} />}>{children}</Suspense>
		</PageBoundary>
	)
}
function RequireSession() {
	const { session, isPending } = useAppContext()
	const location = useLocation()
	if (isPending) return <LoadingSkeleton kind="gallery" label="Loading your space…" />
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
	useEffect(() => {
		if (!notice) return
		const timeout = window.setTimeout(() => setNotice(''), 5200)
		return () => window.clearTimeout(timeout)
	}, [notice])
	return (
		<I18nProvider>
			<AppContext.Provider value={context}>
				<BrowserRouter>
					<RouteMetadata />
					<WebObservability />
					<Routes>
						<Route element={<SiteLayout notice={notice} />}>
							<Route
								path="/decouvrir"
								element={
									<Page>
										<DiscoveryPage />
									</Page>
								}
							/>
							<Route
								path="/explorer"
								element={
									<Page>
										<ExplorerPage />
									</Page>
								}
							/>
							<Route
								path="/classement"
								element={
									<Page>
										<ExplorerPage ranking />
									</Page>
								}
							/>
							{['/open-source', '/nostalgie', '/partager'].map(path => (
								<Route
									key={path}
									path={path}
									element={
										<Page>
											<MarketingPage />
										</Page>
									}
								/>
							))}
							<Route
								index
								element={
									<Page>
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
								path="/fonctionnement"
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
								path="/versions"
								element={
									<Page>
										<ReleasesPage />
									</Page>
								}
							/>
							<Route
								path="/changelog"
								element={
									<Page>
										<ReleasesPage changelog />
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
							<Route
								path="/blog"
								element={
									<Page>
										<BlogPage />
									</Page>
								}
							/>
							<Route
								path="/blog/:slug"
								element={
									<Page>
										<ArticlePage />
									</Page>
								}
							/>
							<Route
								path="/pricing"
								element={
									<Page>
										<PricingPage />
									</Page>
								}
							/>
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
									path="/admin"
									element={
										<Page>
											<AdminPage />
										</Page>
									}
								/>
								<Route
									path="/account"
									element={
										<Page>
											<AccountPage />
										</Page>
									}
								/>
								<Route
									path="/admin/diagnostics"
									element={
										<Page>
											<DiagnosticsPage />
										</Page>
									}
								/>
								<Route
									path="/moderation"
									element={
										<Page>
											<ModerationPage />
										</Page>
									}
								/>
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
				</BrowserRouter>
			</AppContext.Provider>
		</I18nProvider>
	)
}
