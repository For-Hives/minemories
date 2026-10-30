// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { HeroLanguage } from '../components/HeroParts'
import { metadataFor, publicMetadata } from '../route-metadata'
import { loadLocale } from './catalog'
import { I18nProvider, useI18n } from './I18n'
import { localeOptions, localeTag } from './locales'

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.restoreAllMocks()
})
function Example() {
	const { t, locale, setLocale } = useI18n()
	return (
		<>
			<p>{t('Sign in')}</p>
			<p>{t('Share by link')}</p>
			<p>{[t('Rain'), t('Snow')].join(' / ')}</p>
			<output>{locale}</output>
			<button type="button" onClick={() => setLocale('fr')}>
				Reset
			</button>
		</>
	)
}
function page(detectLocale = false) {
	return render(
		<I18nProvider detectLocale={detectLocale}>
			<MemoryRouter>
				<HeroLanguage />
				<Example />
			</MemoryRouter>
		</I18nProvider>
	)
}

test('the actual selector changes editorial and shared text, persists the preference and restores it', async () => {
	const view = page()
	fireEvent.change(screen.getByRole('combobox', { name: 'Langue' }), { target: { value: 'ja' } })
	await screen.findByText('リンクで共有', {}, { timeout: 10000 })
	expect(screen.getByText('雨 / 雪')).toBeTruthy()
	expect(localStorage.getItem('minemories-locale')).toBe('ja')
	await waitFor(() => expect(document.documentElement.lang).toBe('ja-JP'))
	view.unmount()
	page()
	await screen.findByText('リンクで共有', {}, { timeout: 10000 })
	fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
	expect(screen.getByText('Partager par lien')).toBeTruthy()
})

test('browser preference respects priority while a saved choice always takes precedence', async () => {
	vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ko-KR', 'en-US'])
	const view = page(true)
	await screen.findByText('링크로 공유', {}, { timeout: 10000 })
	view.unmount()
	localStorage.setItem('minemories-locale', 'fr')
	page(true)
	expect(screen.getByText('Partager par lien')).toBeTruthy()
})

test('switching countries preserves the metadata language and known technical strings', async () => {
	await Promise.all(localeOptions.map(option => loadLocale(option.id)))
	for (const { id } of localeOptions) {
		for (const page of publicMetadata) {
			const metadata = metadataFor(page.path, id)
			expect(metadata.title).toBeTruthy()
			expect(metadata.description).toBeTruthy()
			expect(metadata.language).toBe(id === 'fr' || id === 'en' ? id : localeTag(id))
		}
	}
})

test('legacy regional preferences are recognized even when preference writes are blocked', async () => {
	localStorage.setItem('minemories-locale', 'pt_BR')
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	page()
	await screen.findByText('Compartilhar por link', {}, { timeout: 10000 })
	fireEvent.change(screen.getByRole('combobox', { name: 'Idioma' }), { target: { value: 'pl' } })
	await waitFor(() => expect(document.documentElement.lang).toBe('pl-PL'))
	expect(screen.getByText('Udostępnij przez link')).toBeTruthy()
})
