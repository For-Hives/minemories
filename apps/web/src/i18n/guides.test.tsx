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
		expect(document.querySelector('article')?.textContent).not.toMatch(/[àâçéèêëîïôùûü]/i)
		expect(screen.getAllByRole('link', { name: 'Install the mod' }).length).toBeGreaterThan(0)
		fireEvent.click(screen.getByRole('button', { name: 'Switch language' }))
		expect(document.querySelector('article')?.lang).toBe('fr')
		expect(screen.getAllByRole('link', { name: 'Installer le mod' }).length).toBeGreaterThan(0)
	}
)
test('every platform, version, loader and step uses English copy, preserving filenames and command payloads', async () => {
	mount(<InstallationPage />)
	fireEvent.click(screen.getByRole('button', { name: /^Guided installation/ }))
	fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
	for (const version of ['1.21.11', '1.18.2']) {
		fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${version.replaceAll('.', '\\.')}(?!\\d)`) }))
		fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
		// The last loader choice adds the loader installation screen, so all five installation screens are checked.
		fireEvent.click(screen.getByRole('radio', { name: 'I have no mod loader yet' }))
		fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
		for (let step = 0; step < 5; step++) {
			expect(document.querySelector('article')?.textContent).not.toMatch(/[àâçéèêëîïôùûü]/i)
			fireEvent.click(screen.getByRole('button', { name: step === 4 ? 'My memory opens in 3D' : 'Continue' }))
		}
		expect(document.querySelector('article')?.textContent).not.toMatch(/[àâçéèêëîïôùûü]/i)
		fireEvent.click(screen.getByRole('button', { name: 'Start again and clear my choices' }))
		fireEvent.click(screen.getByRole('button', { name: /^Guided installation/ }))
		fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
	}
	await waitFor(() => expect(localStorage.getItem(guideStorageKey)).toContain('"active":true'))
})
test('switching language preserves the chosen version, loader and screen', async () => {
	mount(<InstallationPage />, 'fr')
	fireEvent.click(screen.getByRole('button', { name: /^Installation guidée/ }))
	fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
	fireEvent.click(screen.getByRole('radio', { name: /^1\.19\.2(?!\d)/ }))
	fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
	fireEvent.click(screen.getByRole('radio', { name: 'Je n’ai pas encore de loader de mods' }))
	fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
	expect((document.querySelector('.install-panel h2') as HTMLElement).textContent).toBe('Installer le loader')
	fireEvent.click(screen.getByRole('button', { name: 'Switch language' }))
	expect((document.querySelector('.install-panel h2') as HTMLElement).textContent).toBe('Install the loader')
	expect(screen.getByText('Step 4 of 8')).toBeTruthy()
	await waitFor(() =>
		expect(JSON.parse(localStorage.getItem(guideStorageKey) ?? '{}')).toMatchObject({
			minecraft: '1.19.2',
			loader: 'fabric',
			step: 'install',
			needsLoader: true,
		})
	)
	fireEvent.click(screen.getByRole('button', { name: '← Back' }))
	expect(screen.getByRole('radio', { name: 'I have no mod loader yet' })).toHaveProperty('checked', true)
})
