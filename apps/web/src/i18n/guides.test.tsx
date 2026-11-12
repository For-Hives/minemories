// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ConceptPage, FaqPage, HowItWorksPage } from '../pages/InfoPages'
import { InstallationPage } from '../pages/InstallationPage'
import { guideStorageKey } from '../pages/installation-state'
import { I18nProvider, useI18n } from './I18n'

beforeEach(() => {
	localStorage.clear()
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
})
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})
function Switch() {
	const { locale, setLocale } = useI18n()
	return (
		<button type="button" onClick={() => setLocale(locale === 'en' ? 'fr' : 'en')}>
			Switch language
		</button>
	)
}
function mount(page: React.ReactNode, locale: 'en' | 'fr' = 'en') {
	return render(
		<I18nProvider initialLocale={locale}>
			<MemoryRouter>
				<Switch />
				{page}
			</MemoryRouter>
		</I18nProvider>
	)
}
test.each([ConceptPage, HowItWorksPage, FaqPage])(
	'detailed guide %s has English body, headings and navigation',
	Page => {
		mount(<Page />)
		expect(document.querySelector('article')?.lang).toBe('en')
		// Bréval is a name (who makes Minemories), not French copy left untranslated.
		expect(document.querySelector('article')?.textContent?.replaceAll('Bréval', '')).not.toMatch(/[àâçéèêëîïôùûü]/i)
		expect(screen.getAllByRole('link', { name: 'Install the mod' }).length).toBeGreaterThan(0)
		fireEvent.click(screen.getByRole('button', { name: 'Switch language' }))
		expect(document.querySelector('article')?.lang).toBe('fr')
		expect(screen.getAllByRole('link', { name: 'Installer le mod' }).length).toBeGreaterThan(0)
	}
)
const radio = (name: string | RegExp) => screen.getByRole('radio', { name }) as HTMLInputElement
const versionRadio = (version: string) => radio(new RegExp(`^${version.replaceAll('.', '\\.')}(?![\\d.])`))
test('every version and loader of the installation guide uses English copy', () => {
	mount(<InstallationPage />)
	fireEvent.click(screen.getByRole('button', { name: /^Guided installation/ }))
	for (const version of ['1.21.11', '1.21.1', '1.20.1', '1.19.2', '1.18.2', '26.3']) {
		fireEvent.click(versionRadio(version))
		fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
		for (const loader of screen.getAllByRole('radio').filter(item => (item as HTMLInputElement).name === 'loader')) {
			fireEvent.click(loader)
			expect(document.querySelector('article')?.textContent).not.toMatch(/[àâçéèêëîïôùûü]/i)
		}
		fireEvent.click(screen.getByRole('button', { name: '← Back' }))
	}
})
test('switching language keeps the chosen version and loader', async () => {
	mount(<InstallationPage />, 'fr')
	fireEvent.click(screen.getByRole('button', { name: /^Installation guidée/ }))
	fireEvent.click(versionRadio('1.19.2'))
	fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
	fireEvent.click(radio('Fabric'))
	expect(screen.getByRole('heading', { name: 'Quel loader de mods utilises-tu\u00a0?' })).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Switch language' }))
	expect(screen.getByRole('heading', { name: 'Which mod loader do you use?' })).toBeTruthy()
	expect(radio('Fabric')).toHaveProperty('checked', true)
	await waitFor(() =>
		expect(JSON.parse(localStorage.getItem(guideStorageKey) ?? '{}')).toMatchObject({
			minecraft: '1.19.2',
			loader: 'fabric',
			step: 'loader',
		})
	)
})
