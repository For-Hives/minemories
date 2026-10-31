import { Component, lazy, type ReactNode, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import { RouteMetadata } from './components/RouteMetadata'
import { I18nProvider, T } from './i18n/I18n'
import { reportWebFailure, WebObservability } from './observability/WebObservability'

const HomePage = lazy(() => import('./pages/HomePage').then(module => ({ default: module.HomePage })))
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
function Page({ children, kind = 'page' }: { children: ReactNode; kind?: 'page' | 'home' }) {
	const { pathname } = useLocation()
	// The landing never shows a grey skeleton: while its chunk arrives the page is the night colour (index.html's loading screen covers the first load).
	const fallback = <div className="landing-pending" aria-hidden="true" />
	return (
		<PageBoundary key={pathname}>
			<Suspense fallback={fallback}>
				{children}
				{kind !== 'home' && <PageReady />}
			</Suspense>
		</PageBoundary>
	)
}
export function App() {
	return (
		<I18nProvider detectLocale>
			<BrowserRouter>
				<RouteMetadata />
				<WebObservability />
				<Routes>
					<Route
						index
						element={
							<Page kind="home">
								<HomePage />
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
				</Routes>
			</BrowserRouter>
		</I18nProvider>
	)
}
