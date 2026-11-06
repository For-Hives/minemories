// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { lazy, type ReactNode } from 'react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { Page, preloadWhenIdle } from './PageFrame'

vi.mock('../observability/WebObservability', () => ({ reportWebFailure: vi.fn() }))

afterEach(() => {
	cleanup()
	vi.useRealTimers()
})

function deferredPage(text: string) {
	let resolve: () => void = () => undefined
	const arrived = new Promise<void>(done => {
		resolve = done
	})
	const Component = lazy(async () => {
		await arrived
		return { default: () => <h1>{text}</h1> }
	})
	return { Component, resolve }
}

function shell(children: ReactNode, path = '/faq') {
	return render(
		<I18nProvider>
			<MemoryRouter initialEntries={[path]}>
				<Link to="/faq">faq</Link>
				<Link to="/concept">concept</Link>
				{children}
			</MemoryRouter>
		</I18nProvider>
	)
}

test('a navigation keeps the current page on screen while the next one arrives, without any skeleton', async () => {
	const faq = deferredPage('Questions')
	const concept = deferredPage('The concept')
	const { container } = shell(
		<Routes>
			<Route
				path="/faq"
				element={
					<Page>
						<faq.Component />
					</Page>
				}
			/>
			<Route
				path="/concept"
				element={
					<Page>
						<concept.Component />
					</Page>
				}
			/>
		</Routes>
	)
	// First load of a page: an empty area, not the skeleton.
	expect(container.querySelector('.mm-page-pending')).not.toBeNull()
	expect(container.querySelector('.mm-loading')).toBeNull()
	await act(async () => faq.resolve())
	expect(await screen.findByRole('heading', { name: 'Questions' })).toBeTruthy()
	expect(document.documentElement.dataset.mmReady).toBe('1')

	fireEvent.click(screen.getByRole('link', { name: 'concept' }))
	// The next page's chunk has not arrived: the current page stays, nothing else is drawn.
	expect(screen.getByRole('heading', { name: 'Questions' })).toBeTruthy()
	expect(container.querySelector('.mm-page-pending')).toBeNull()
	expect(container.querySelector('.mm-loading')).toBeNull()
	await act(async () => concept.resolve())
	expect(await screen.findByRole('heading', { name: 'The concept' })).toBeTruthy()
	expect(screen.queryByRole('heading', { name: 'Questions' })).toBeNull()
})

test('a page that fails is replaced by a reload notice, which clears on the next page', async () => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined)
	function Broken(): ReactNode {
		throw new Error('boom')
	}
	shell(
		<Routes>
			<Route
				path="/faq"
				element={
					<Page>
						<Broken />
					</Page>
				}
			/>
			<Route
				path="/concept"
				element={
					<Page>
						<h1>The concept</h1>
					</Page>
				}
			/>
		</Routes>
	)
	expect(await screen.findByRole('alert')).toBeTruthy()
	fireEvent.click(screen.getByRole('link', { name: 'concept' }))
	expect(await screen.findByRole('heading', { name: 'The concept' })).toBeTruthy()
	expect(screen.queryByRole('alert')).toBeNull()
})

test('only the landing has a loading placeholder; the app spaces stay empty', () => {
	const home = deferredPage('Home')
	const gallery = deferredPage('Gallery')
	const first = shell(
		<Page kind="home">
			<home.Component />
		</Page>
	)
	expect(first.container.querySelector('.landing-pending')).not.toBeNull()
	cleanup()
	const second = shell(
		<Page kind="gallery">
			<gallery.Component />
		</Page>
	)
	expect(second.container.querySelector('.mm-loading')).toBeNull()
	expect(second.container.querySelector('.mm-page-pending')).not.toBeNull()
})

test('page chunks are fetched once the browser is idle, and the wait can be cancelled', () => {
	vi.useFakeTimers()
	const load = vi.fn(() => Promise.reject(new Error('offline')))
	const idle = window as unknown as { requestIdleCallback?: unknown }
	const saved = idle.requestIdleCallback
	delete idle.requestIdleCallback
	preloadWhenIdle([load])
	vi.advanceTimersByTime(2000)
	expect(load).toHaveBeenCalledTimes(1)
	const cancel = preloadWhenIdle([load])
	cancel()
	vi.advanceTimersByTime(2000)
	expect(load).toHaveBeenCalledTimes(1)

	const callbacks: Array<() => void> = []
	const cancelIdle = vi.fn()
	Object.assign(window, {
		requestIdleCallback: (callback: () => void) => callbacks.push(callback),
		cancelIdleCallback: cancelIdle,
	})
	const stop = preloadWhenIdle([load])
	callbacks[0]?.()
	expect(load).toHaveBeenCalledTimes(2)
	stop()
	expect(cancelIdle).toHaveBeenCalledWith(1)
	if (saved) idle.requestIdleCallback = saved
	else delete idle.requestIdleCallback
})
