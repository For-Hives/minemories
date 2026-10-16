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

test('all ten reserved screenshots are attached to the Windows manual steps without broken image requests', () => {
	render(
		<MemoryRouter>
			<InstallationPage />
		</MemoryRouter>
	)
	const expected = [
		[
			'Installer NeoForge',
			['01-minecraft-1.21.1', '02-java-21', '03-neoforge-install-client', '04-profil-dossier-jeu'],
		],
		['Télécharger le mod', ['05-jar-telecharge']],
		['Ranger le fichier', ['06-dossier-mods']],
		['Vérifier en jeu', ['07-liste-mods', '08-menu-minemories']],
		['Créer un souvenir', ['09-premiere-capture', '10-souvenir-dans-viewer']],
	] as const
	for (const [step, files] of expected) {
		fireEvent.click(screen.getByRole('button', { name: step }))
		expect(
			[...document.querySelectorAll('figure[data-screenshot]')].map(figure => figure.getAttribute('data-screenshot'))
		).toEqual(files)
	}
	expect(screen.queryByRole('img')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'macOS' }))
	expect(document.querySelectorAll('figure[data-screenshot]').length).toBe(0)
	fireEvent.click(screen.getByRole('button', { name: 'Windows' }))
	fireEvent.click(screen.getByRole('button', { name: 'CurseForge' }))
	fireEvent.click(screen.getByRole('button', { name: 'Installer NeoForge' }))
	expect(document.querySelectorAll('figure[data-screenshot]').length).toBe(0)
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
