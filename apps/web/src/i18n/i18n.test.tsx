// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider, T, translate, useI18n } from './I18n'

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.restoreAllMocks()
})
function LanguageExample() {
	const { locale, setLocale } = useI18n()
	return (
		<>
			<T message="Sign in" />
			<button type="button" onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}>
				Switch
			</button>
		</>
	)
}
test('switches language, persists it and restores it after remounting', () => {
	const view = render(
		<I18nProvider>
			<LanguageExample />
		</I18nProvider>
	)
	expect(screen.getByText('Se connecter')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
	expect(screen.getByText('Sign in')).toBeTruthy()
	expect(localStorage.getItem('minemories-locale')).toBe('en')
	view.unmount()
	render(
		<I18nProvider>
			<LanguageExample />
		</I18nProvider>
	)
	expect(screen.getByText('Sign in')).toBeTruthy()
})
test('keeps unknown messages readable and interpolates zero values without dropping placeholders', () => {
	expect(translate('fr', 'Unknown')).toBe('Unknown')
	expect(translate('en', '{count} captures for {name}', { count: 0 })).toBe('0 captures for {name}')
})
test('the selector works when local storage is unavailable', () => {
	vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	render(
		<I18nProvider>
			<LanguageExample />
		</I18nProvider>
	)
	fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
	expect(screen.getByText('Sign in')).toBeTruthy()
})

test('catalog fallback rejects inherited object keys', () => {
	for (const locale of ['fr', 'en'] as const)
		for (const key of ['constructor', '__proto__', 'toString']) expect(translate(locale, key)).toBe(key)
})
