// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { preferenceKey } from './policy'
import { reportWebFailure, WebDiagnosticsPreference, WebObservability } from './WebObservability'

const provider = vi.hoisted(() => ({ create: vi.fn(), report: vi.fn(), stop: vi.fn() }))
vi.mock('./sentry', () => ({ createReporter: provider.create }))
function mount(path = '/privacy') {
	window.history.replaceState({}, '', path)
	return render(
		<I18nProvider>
			<MemoryRouter initialEntries={[path]}>
				<WebObservability />
				<WebDiagnosticsPreference />
				<Link to="/gallery">Private gallery</Link>
			</MemoryRouter>
		</I18nProvider>
	)
}
beforeEach(() => {
	localStorage.clear()
	vi.stubEnv('VITE_WEB_DIAGNOSTICS_DSN', 'https://public@ingest.example/12')
	provider.create.mockReset().mockReturnValue({ report: provider.report, stop: provider.stop })
	provider.report.mockReset()
	provider.stop.mockReset()
})
afterEach(() => {
	cleanup()
	vi.unstubAllEnvs()
	vi.restoreAllMocks()
})
test('off configuration does not offer consent or initialize the provider, even with an old preference', async () => {
	vi.stubEnv('VITE_WEB_DIAGNOSTICS_DSN', '')
	localStorage.setItem(preferenceKey, 'enabled')
	mount()
	await act(async () => Promise.resolve())
	expect(screen.queryByRole('checkbox')).toBeNull()
	expect(provider.create).not.toHaveBeenCalled()
})
test('explicit opt in starts collection of fixed categories; withdrawal stops it and clears handlers', async () => {
	mount()
	expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
	expect(provider.create).not.toHaveBeenCalled()
	fireEvent.click(screen.getByRole('checkbox'))
	await waitFor(() => expect(provider.create).toHaveBeenCalledTimes(1))
	fireEvent(
		window,
		new ErrorEvent('error', { message: 'secret@example.com token=private', filename: '/captures/private.glb' })
	)
	fireEvent(window, new Event('unhandledrejection'))
	reportWebFailure('page-render')
	expect(provider.report.mock.calls).toEqual([['runtime'], ['unhandled-promise'], ['page-render']])
	fireEvent.click(screen.getByRole('checkbox'))
	expect(provider.stop).toHaveBeenCalledTimes(1)
	provider.report.mockClear()
	fireEvent(window, new ErrorEvent('error'))
	reportWebFailure('page-render')
	expect(provider.report).not.toHaveBeenCalled()
	expect(localStorage.getItem(preferenceKey)).toBe('disabled')
})
test.each([
	'/gallery',
	'/viewer?id=secret',
	'/share/private',
	'/public/id',
	'/account',
	'/login',
	'/admin',
	'/diagnostics',
	'/anything',
])('private or unknown page %s never initializes the provider', async path => {
	localStorage.setItem(preferenceKey, 'enabled')
	mount(path)
	await act(async () => Promise.resolve())
	expect(provider.create).not.toHaveBeenCalled()
})
test('navigating to private pages or changing consent in another tab stops the active reporter', async () => {
	localStorage.setItem(preferenceKey, 'enabled')
	const view = mount()
	await waitFor(() => expect(provider.create).toHaveBeenCalledTimes(1))
	fireEvent.click(screen.getByRole('link', { name: 'Private gallery' }))
	expect(provider.stop).toHaveBeenCalledTimes(1)
	view.unmount()
	mount()
	await waitFor(() => expect(provider.create).toHaveBeenCalledTimes(2))
	localStorage.removeItem(preferenceKey)
	fireEvent(window, new StorageEvent('storage', { key: preferenceKey }))
	expect(provider.stop).toHaveBeenCalledTimes(2)
})
test('leaving before the lazy provider finishes loading cannot attach listeners', async () => {
	localStorage.setItem(preferenceKey, 'enabled')
	const view = mount()
	view.unmount()
	await act(async () => Promise.resolve())
	expect(provider.create).not.toHaveBeenCalled()
})
test('unavailable local storage fails closed and shows a recoverable preference error', async () => {
	const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	mount()
	fireEvent.click(screen.getByRole('checkbox'))
	expect(screen.getByRole('alert').textContent).toContain('interrompus')
	expect(provider.create).not.toHaveBeenCalled()
	write.mockRestore()
	fireEvent.click(screen.getByRole('checkbox'))
	await waitFor(() => expect(provider.create).toHaveBeenCalledTimes(1))
	expect(screen.queryByRole('alert')).toBeNull()
})
