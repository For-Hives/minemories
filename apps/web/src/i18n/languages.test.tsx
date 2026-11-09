// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { AppContext } from '../app-context'
import { LanguageSuggestion } from '../components/LanguageSuggestion'
import { SiteLayout } from '../components/SiteLayout'
import { formatRelativeDate } from '../lib/dates'
import { formatFileSize } from '../lib/glb'
import { metadataFor, publicMetadata } from '../route-metadata'
import { loadLocale } from './catalog'
import { I18nProvider, useI18n } from './I18n'
import { localeOptions, localeTag } from './locales'

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.restoreAllMocks()
})
const context = {
	session: null,
	isPending: false,
	refreshSession: async () => undefined,
	viewerFile: null,
	setViewerFile: () => undefined,
	notify: () => undefined,
}
function Example() {
	const { t, locale, setLocale } = useI18n()
	return (
		<>
			<p>{t('Sign in')}</p>
			<p>{t('Postcard')}</p>
			<p>{[t('Rain'), t('Snow')].join(' / ')}</p>
			<output>{locale}</output>
			<button type="button" onClick={() => setLocale('fr')}>
				Reset
			</button>
		</>
	)
}
function page(suggestLocale = false) {
	return render(
		<I18nProvider suggestLocale={suggestLocale}>
			<AppContext.Provider value={context}>
				<MemoryRouter initialEntries={['/faq']}>
					<SiteLayout>
						<Example />
					</SiteLayout>
					<LanguageSuggestion />
				</MemoryRouter>
			</AppContext.Provider>
		</I18nProvider>
	)
}

test('the actual selector changes editorial and shared text, persists the preference and restores it', async () => {
	const view = page()
	fireEvent.change(screen.getByRole('combobox', { name: 'Langue' }), { target: { value: 'ja' } })
	await screen.findByText('ポストカード', {}, { timeout: 10000 })
	expect(screen.getByText('雨 / 雪')).toBeTruthy()
	expect(localStorage.getItem('minemories-locale')).toBe('ja')
	await waitFor(() => expect(document.documentElement.lang).toBe('ja-JP'))
	view.unmount()
	page()
	await screen.findByText('ポストカード', {}, { timeout: 10000 })
	fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
	expect(screen.getByText('Carte postale')).toBeTruthy()
})

test('browser preference is only suggested, in its priority order, while a saved choice silences it', async () => {
	vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ko-KR', 'en-US'])
	const view = page(true)
	await screen.findByRole('region', { name: '언어 제안' }, { timeout: 10000 })
	expect(screen.getByText('Carte postale')).toBeTruthy()
	expect(document.documentElement.lang).toBe('fr-FR')
	view.unmount()
	localStorage.setItem('minemories-locale', 'ja')
	page(true)
	await screen.findByText('ポストカード', {}, { timeout: 10000 })
	expect(screen.queryByRole('region', { name: '언어 제안' })).toBeNull()
})

test('switching countries preserves numeric/date formatting, metadata language and known technical strings', async () => {
	await Promise.all(localeOptions.map(option => loadLocale(option.id)))
	for (const { id } of localeOptions) {
		const dayAgo = formatRelativeDate('2026-10-18T12:00:00Z', Date.parse('2026-10-19T12:00:00Z'), id)
		expect(dayAgo).toBe(new Intl.RelativeTimeFormat(id, { numeric: 'always' }).format(-1, 'day'))
		expect(formatFileSize(1536, id)).toBe(`${new Intl.NumberFormat(id, { maximumFractionDigits: 1 }).format(1.5)} KiB`)
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
	await screen.findByText('Cartão postal', {}, { timeout: 10000 })
	fireEvent.change(screen.getByRole('combobox', { name: 'Idioma' }), { target: { value: 'pl' } })
	await waitFor(() => expect(document.documentElement.lang).toBe('pl-PL'))
	expect(screen.getByText('Pocztówka')).toBeTruthy()
})
