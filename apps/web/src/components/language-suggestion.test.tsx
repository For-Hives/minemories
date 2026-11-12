// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { loadLocale } from '../i18n/catalog'
import { I18nProvider, useI18n } from '../i18n/I18n'
import { LanguageSuggestion } from './LanguageSuggestion'
import { RouteMetadata } from './RouteMetadata'

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.restoreAllMocks()
	for (const element of document.head.querySelectorAll('meta,link,script[data-page-schema]')) element.remove()
})
function Heading() {
	const { t } = useI18n()
	return <h1>{t('Sign in')}</h1>
}
function page(path: string, languages: string[]) {
	vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages)
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
	return render(
		<I18nProvider suggestLocale>
			<MemoryRouter initialEntries={[path]}>
				<RouteMetadata />
				<LanguageSuggestion />
				<main id="main-content" tabIndex={-1}>
					<Heading />
				</main>
			</MemoryRouter>
		</I18nProvider>
	)
}
const suggestion = () => screen.findByRole('region', { name: 'Language suggestion' })

test('an English browser on a public page keeps the page in French and is offered English, out of snippets', async () => {
	page('/installation', ['en-US', 'en'])
	const card = await suggestion()
	expect(screen.getByRole('heading', { name: 'Se connecter' })).toBeTruthy()
	expect(document.title).toBe('Installer Minemories sur Fabric, Forge ou NeoForge')
	expect(document.documentElement.lang).toBe('fr-FR')
	// the link preview is in English on every page, whatever the page's language
	expect(document.querySelector<HTMLMetaElement>('meta[property="og:locale"]')?.content).toBe('en_US')
	expect(JSON.parse(document.querySelector('[data-page-schema]')?.textContent ?? '{}')['@graph'][0].inLanguage).toBe(
		'fr'
	)
	expect(card.getAttribute('lang')).toBe('en-US')
	expect(card.hasAttribute('data-nosnippet')).toBe(true)
	expect(card.textContent).toContain('Read Minemories in English?')
	expect(card.contains(document.activeElement)).toBe(false)
})

test('accepting switches the whole page to the suggested language and saves it as a choice', async () => {
	const view = page('/installation', ['en-US'])
	await suggestion()
	fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))
	expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
	expect(document.title).toBe('Install Minemories on Fabric, Forge or NeoForge')
	expect(document.querySelector<HTMLMetaElement>('meta[property="og:locale"]')?.content).toBe('en_US')
	expect(screen.queryByRole('region', { name: 'Language suggestion' })).toBeNull()
	expect(localStorage.getItem('minemories-locale')).toBe('en')
	view.unmount()
	page('/', ['en-US'])
	await screen.findByRole('heading', { name: 'Sign in' })
	expect(screen.queryByRole('region')).toBeNull()
})

test('declining keeps French and is remembered on the next visit', async () => {
	const view = page('/', ['en-US'])
	await suggestion()
	fireEvent.click(screen.getByRole('button', { name: 'No thanks' }))
	expect(screen.queryByRole('region')).toBeNull()
	expect(screen.getByRole('heading', { name: 'Se connecter' })).toBeTruthy()
	expect(localStorage.getItem('minemories-locale-suggestion-dismissed')).toBe('en')
	expect(localStorage.getItem('minemories-locale')).toBeNull()
	view.unmount()
	page('/', ['en-US'])
	await new Promise(resolve => setTimeout(resolve, 0))
	expect(screen.queryByRole('region')).toBeNull()
})

test('a declined language loaded on demand stays declined once its catalogue is here', async () => {
	const view = page('/faq', ['de-DE'])
	await screen.findByRole('region', { name: 'Sprachvorschlag' }, { timeout: 10000 })
	fireEvent.click(screen.getByRole('button', { name: 'Nein, danke' }))
	expect(localStorage.getItem('minemories-locale-suggestion-dismissed')).toBe('de')
	view.unmount()
	page('/faq', ['de-AT', 'de'])
	await loadLocale('de')
	await new Promise(resolve => setTimeout(resolve, 50))
	expect(screen.queryByRole('region')).toBeNull()
	expect(screen.getByRole('heading', { name: 'Se connecter' })).toBeTruthy()
})

test('the suggestion speaks its own language once that catalogue has loaded', async () => {
	page('/faq', ['de-DE'])
	const card = await screen.findByRole('region', { name: 'Sprachvorschlag' }, { timeout: 10000 })
	expect(card.getAttribute('lang')).toBe('de-DE')
	expect(card.textContent).toContain('Minemories auf Deutsch lesen?')
	expect(screen.getByRole('heading', { name: 'Se connecter' })).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Auf Deutsch umstellen' }))
	await waitFor(() => expect(document.documentElement.lang).toBe('de-DE'), { timeout: 10000 })
	expect(document.querySelector<HTMLMetaElement>('meta[property="og:locale"]')?.content).toBe('en_US')
})

test('a saved choice wins over the page language, with nothing to suggest', async () => {
	localStorage.setItem('minemories-locale', 'en')
	page('/installation', ['de-DE'])
	await screen.findByRole('heading', { name: 'Sign in' })
	await new Promise(resolve => setTimeout(resolve, 0))
	expect(screen.queryByRole('region')).toBeNull()
	expect(document.title).toBe('Install Minemories on Fabric, Forge or NeoForge')
})

test('private app routes follow the same rule: French until the visitor chooses, English only suggested', async () => {
	page('/gallery', ['en-US'])
	await suggestion()
	expect(screen.getByRole('heading', { name: 'Se connecter' })).toBeTruthy()
	expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex,nofollow')
})

test('a French browser, Canadian or not, sees no suggestion', async () => {
	const view = page('/', ['fr-FR'])
	await new Promise(resolve => setTimeout(resolve, 0))
	expect(screen.queryByRole('region')).toBeNull()
	view.unmount()
	page('/concept', ['fr-CA', 'en-CA'])
	await new Promise(resolve => setTimeout(resolve, 0))
	expect(screen.queryByRole('region')).toBeNull()
	expect(screen.getByRole('heading', { name: 'Se connecter' })).toBeTruthy()
})

test('blocked storage still shows and dismisses the suggestion for this visit', async () => {
	vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	page('/', ['en-US'])
	await suggestion()
	fireEvent.click(screen.getByRole('button', { name: 'No thanks' }))
	expect(screen.queryByRole('region')).toBeNull()
})

test('a catalogue that fails to load means no suggestion rather than one in the wrong language', async () => {
	const catalog = await import('../i18n/catalog')
	const load = vi.spyOn(catalog, 'loadLocale').mockRejectedValue(new Error('offline'))
	page('/', ['ja-JP'])
	await waitFor(() => expect(load).toHaveBeenCalledWith('ja'))
	await new Promise(resolve => setTimeout(resolve, 0))
	expect(screen.queryByRole('region')).toBeNull()
})
