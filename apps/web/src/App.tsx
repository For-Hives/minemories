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
const AccountPage = lazy(() => import('./pages/AccountPage').then(module => ({ default: module.AccountPage })))
const GalleryPage = lazy(() => import('./pages/GalleryPage').then(module => ({ default: module.GalleryPage })))
const ViewerPage = lazy(() => import('./pages/ViewerPage').then(module => ({ default: module.ViewerPage })))
const SharePage = lazy(() => import('./pages/SharePage').then(module => ({ default: module.SharePage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(module => ({ default: module.NotFoundPage })))

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
/** Tells the loading screen of index.html that the page is on screen: it is rendered inside the Suspense boundary, so it only commits once the lazy page has arrived. The landing is left out: its film says so itself (hero.js `signalReady`), once it can play. */
function PageReady() {
	useEffect(() => {
		document.documentElement.dataset.mmReady = '1'
		window.dispatchEvent(new Event('mm:ready'))
	}, [])
	return null
}
function Page({ children, kind = 'page' }: { children: ReactNode; kind?: 'page' | 'gallery' | 'viewer' | 'home' }) {
	const { pathname } = useLocation()
	// The landing never shows a grey skeleton: while its chunk arrives the page is the night colour (index.html's loading screen covers the first load).
	const fallback =
		kind === 'home' ? <div className="landing-pending" aria-hidden="true" /> : <LoadingSkeleton kind={kind} />
	return (
		<PageBoundary key={pathname}>
			<Suspense fallback={fallback}>
				{children}
				{kind !== 'home' && <PageReady />}
			</Suspense>
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
		<I18nProvider detectLocale>
			<AppContext.Provider value={context}>
				<BrowserRouter>
					<RouteMetadata />
					<WebObservability />
					<Routes>
						<Route element={<SiteLayout notice={notice} />}>
							<Route
								index
								element={
									<Page kind="home">
										<HomePage />
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
