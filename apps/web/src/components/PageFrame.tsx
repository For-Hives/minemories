import { Component, type ReactNode, Suspense, useEffect } from 'react'
import { useLocation } from 'react-router'
import { T } from '../i18n/I18n'
import { signalPageReady } from '../lib/boot-progress'
import { reportWebFailure } from '../observability/WebObservability'

type PageKind = 'page' | 'gallery' | 'viewer' | 'home'

/** Not keyed by the path: the same boundary (and the Suspense inside it) stays mounted from one page to the next, so a navigation keeps the current page on screen while the next one's chunk arrives, instead of flashing a skeleton. A failure is cleared when the path changes. */
class PageBoundary extends Component<{ children: ReactNode; path: string }, { failed: boolean }> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch() {
		reportWebFailure('page-render')
	}
	componentDidUpdate(previous: { path: string }) {
		if (previous.path !== this.props.path && this.state.failed) this.setState({ failed: false })
	}
	render() {
		if (this.state.failed)
			return (
				<div className="mm-content" role="alert">
					<PageReady />
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
/** Tells the loading screen of index.html that the page is on screen: it is rendered inside the Suspense boundary, so it only commits once the lazy page has arrived. The landing and the viewers are left out: the landing's film says so itself (hero.js `signalReady`), once it can play, and a viewer once its 3D scene is drawn (useScenePageReady). */
function PageReady() {
	useEffect(() => signalPageReady(document.documentElement, window), [])
	return null
}
/** A viewer's page is on screen once its 3D scene is drawn, or once there is nothing left to wait for (an error, a restoration card): the loading screen then fills to 100 % and reveals it. */
export function useScenePageReady(settled: boolean) {
	useEffect(() => {
		if (settled) signalPageReady(document.documentElement, window)
	}, [settled])
}
// Only the landing and the viewers have a loading screen (index.html's chunk-loading screen, first load only; a viewer's stage shows the same one for each capture, ChunkLoader.tsx). Elsewhere (the gallery included) a page that is still arriving is an empty area of the page's height, never a
// skeleton: navigations keep the current page on screen (PageBoundary), and the public pages' chunks are fetched ahead of time (preloadWhenIdle).
function pendingPage(kind: PageKind) {
	if (kind === 'home') return <div className="landing-pending" aria-hidden="true" />
	return <div className="mm-page-pending" aria-hidden="true" />
}
export function Page({ children, kind = 'page' }: { children: ReactNode; kind?: PageKind }) {
	const { pathname } = useLocation()
	const fallback = pendingPage(kind)
	return (
		<PageBoundary path={pathname}>
			<Suspense fallback={fallback}>
				{children}
				{kind !== 'home' && kind !== 'viewer' && <PageReady />}
			</Suspense>
		</PageBoundary>
	)
}

/** Fetches page chunks once the browser is idle, so that following a link renders the next page at once. Failures are ignored: the page is then fetched on demand. */
export function preloadWhenIdle(loaders: Array<() => Promise<unknown>>) {
	const run = () => {
		for (const load of loaders) load().catch(() => undefined)
	}
	if (typeof window.requestIdleCallback === 'function') {
		const id = window.requestIdleCallback(run, { timeout: 4000 })
		return () => window.cancelIdleCallback(id)
	}
	const id = setTimeout(run, 2000)
	return () => clearTimeout(id)
}
