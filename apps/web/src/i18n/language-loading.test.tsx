// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider, useI18n } from './I18n'

const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('./catalog', () => ({ loadLocale: mocks.load, translate: (locale: string, key: string) => `${locale}:${key}` }))
beforeEach(() => {
	mocks.load.mockReset()
	localStorage.clear()
})
afterEach(cleanup)
function deferred() {
	let resolve!: () => void
	let reject!: (error: Error) => void
	const promise = new Promise<void>((yes, no) => {
		resolve = yes
		reject = no
	})
	return { promise, resolve, reject }
}
function Example() {
	const { locale, pendingLocale, localeError, setLocale } = useI18n()
	return (
		<>
			<output>{locale}</output>
			<p>{pendingLocale ?? 'ready'}</p>
			{localeError && <p role="alert">Unavailable</p>}
			<button type="button" onClick={() => setLocale('ja')}>
				Japanese
			</button>
			<button type="button" onClick={() => setLocale('ru')}>
				Russian
			</button>
		</>
	)
}
test('a failed catalogue keeps the previous language and can be retried without losing the session preference', async () => {
	const first = deferred()
	mocks.load.mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined)
	render(
		<I18nProvider>
			<Example />
		</I18nProvider>
	)
	fireEvent.click(screen.getByRole('button', { name: 'Japanese' }))
	first.reject(new Error('offline'))
	await screen.findByRole('alert')
	expect(screen.getByRole('status').textContent).toBe('fr')
	expect(localStorage.getItem('minemories-locale')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Japanese' }))
	await waitFor(() => expect(screen.getByRole('status').textContent).toBe('ja'))
	expect(screen.queryByRole('alert')).toBeNull()
	expect(localStorage.getItem('minemories-locale')).toBe('ja')
})
test('a late language download cannot overwrite a more recent selection', async () => {
	const japanese = deferred(),
		russian = deferred()
	mocks.load.mockImplementation((locale: string) => (locale === 'ja' ? japanese.promise : russian.promise))
	render(
		<I18nProvider>
			<Example />
		</I18nProvider>
	)
	fireEvent.click(screen.getByRole('button', { name: 'Japanese' }))
	fireEvent.click(screen.getByRole('button', { name: 'Russian' }))
	russian.resolve()
	await waitFor(() => expect(screen.getByRole('status').textContent).toBe('ru'))
	japanese.resolve()
	await Promise.resolve()
	expect(screen.getByRole('status').textContent).toBe('ru')
	expect(localStorage.getItem('minemories-locale')).toBe('ru')
})
test('leaving the provider cancels the effect of pending language responses', async () => {
	const pending = deferred()
	mocks.load.mockReturnValueOnce(pending.promise)
	const view = render(
		<I18nProvider>
			<Example />
		</I18nProvider>
	)
	fireEvent.click(screen.getByRole('button', { name: 'Japanese' }))
	view.unmount()
	pending.resolve()
	await Promise.resolve()
	expect(localStorage.getItem('minemories-locale')).toBeNull()
})

test('an unavailable initial catalogue falls back to correctly identified English content', async () => {
	mocks.load.mockRejectedValueOnce(new Error('offline'))
	render(
		<I18nProvider initialLocale="ja">
			<Example />
		</I18nProvider>
	)
	await screen.findByRole('alert')
	expect(screen.getByRole('status').textContent).toBe('en')
	expect(document.documentElement.lang).toBe('en-US')
})
