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
test('all launchers and steps use English copy, preserving filenames, versions and command payloads', async () => {
	mount(<InstallationPage />)
	for (const launcher of ['Minecraft Launcher', 'CurseForge', 'Modrinth App', 'Another launcher']) {
		fireEvent.click(screen.getByRole('button', { name: launcher }))
		for (const step of [
			'Prepare',
			'Install NeoForge',
			'Download the mod',
			'Place the file',
			'Check in game',
			'Create a memory',
		]) {
			fireEvent.click(screen.getByRole('button', { name: step }))
			expect(document.querySelector('article')?.textContent).not.toMatch(/[àâçéèêëîïôùûü]/i)
		}
	}
	expect(screen.getByText('/minemories export 16')).toBeTruthy()
	await waitFor(() => expect(localStorage.getItem(guideStorageKey)).toContain('"launcher":"autre"'))
	expect(localStorage.getItem(guideStorageKey)).not.toContain('Another launcher')
})
test('switching language preserves checked steps, launcher and personalized name', async () => {
	mount(<InstallationPage />, 'fr')
	fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Mae' } })
	fireEvent.click(screen.getByRole('button', { name: 'CurseForge' }))
	fireEvent.click(screen.getByRole('button', { name: 'C’est fait, on continue' }))
	expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Installer NeoForge')
	fireEvent.click(screen.getByRole('button', { name: 'Switch language' }))
	expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Install NeoForge')
	expect(screen.getByText('Your turn, Mae')).toBeTruthy()
	expect(screen.getByRole('button', { name: 'CurseForge' }).getAttribute('aria-pressed')).toBe('true')
	await waitFor(() => expect(JSON.parse(localStorage.getItem(guideStorageKey) ?? '{}').done).toEqual([0]))
})
