// @vitest-environment jsdom
import { cleanup, fireEvent, render as renderUi, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { InstallationPage } from './InstallationPage'
import { ScreenshotFrame } from './WindowsScreenshot'

function render(ui: Parameters<typeof renderUi>[0]) {
	return renderUi(ui, { wrapper: I18nProvider })
}

beforeEach(() => {
	localStorage.clear()
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
})
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

function openStep(title: string, version = '1.21.1', loader = 'Je n’ai pas encore de loader de mods') {
	localStorage.clear()
	cleanup()
	vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
	render(
		<MemoryRouter>
			<InstallationPage />
		</MemoryRouter>
	)
	fireEvent.click(screen.getByRole('button', { name: /^Installation guidée/ }))
	fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
	fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${version.replaceAll('.', '\\.')}(?!\\d)`) }))
	fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
	fireEvent.click(screen.getByRole('radio', { name: loader }))
	fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
	while ((document.querySelector('.install-panel h2') as HTMLElement).textContent !== title)
		fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
}
const figures = () =>
	[...document.querySelectorAll('figure[data-screenshot]')].map(figure => figure.getAttribute('data-screenshot'))

test('all seven reserved screenshots are attached to the Windows steps, folded away, without broken image requests', () => {
	const expected = [
		[
			'Installer le loader',
			['01-minecraft-1.21.1', '02-java-21', '03-neoforge-install-client', '04-profil-dossier-jeu'],
		],
		['Télécharger le mod', ['05-jar-telecharge']],
		['Ranger le fichier', ['06-dossier-mods']],
		['Lancer le jeu', []],
		['Créer un souvenir', ['10-souvenir-dans-viewer']],
	] as const
	for (const [step, files] of expected) {
		openStep(step)
		expect(figures()).toEqual(files)
		for (const figure of document.querySelectorAll('figure[data-screenshot]'))
			expect(figure.closest('details')).toBeTruthy()
	}
	// Missing Windows screenshots stay placeholders: no request for an image that does not exist.
	expect(document.querySelector('figure[data-screenshot] img')).toBeNull()
})

test('the screenshots only show for the validated Windows NeoForge 1.21.1 walkthrough', () => {
	openStep('Ranger le fichier', '1.21.1', 'Fabric')
	expect(figures()).toEqual([])
	openStep('Installer le loader', '1.19.2')
	expect(figures()).toEqual([])
	localStorage.clear()
	cleanup()
	vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
	render(
		<MemoryRouter>
			<InstallationPage />
		</MemoryRouter>
	)
	fireEvent.click(screen.getByRole('button', { name: /^Installation guidée/ }))
	fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
	fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
	fireEvent.click(screen.getByRole('radio', { name: 'Je n’ai pas encore de loader de mods' }))
	fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
	expect((document.querySelector('.install-panel h2') as HTMLElement).textContent).toBe('Installer le loader')
	expect(figures()).toEqual([])
})

test('a supplied screenshot uses its caption as alt text, reserves image space and can be enlarged', () => {
	render(<ScreenshotFrame id="modsFolder" src="/assets/tutorial-image.png" />)
	const image = screen.getByRole('img')
	expect(image.getAttribute('alt')).toContain('Explorateur Windows')
	expect(image.getAttribute('loading')).toBe('lazy')
	expect(image.getAttribute('width')).toBe('1600')
	expect(screen.getByRole('link', { name: 'Agrandir : Déposer le JAR dans mods' }).getAttribute('href')).toBe(
		'/assets/tutorial-image.png'
	)
	expect(screen.queryByText('Capture d’écran à venir')).toBeNull()
	fireEvent.error(image)
	expect(screen.queryByRole('img')).toBeNull()
	expect(screen.getByText('Capture d’écran à venir')).toBeTruthy()
})
