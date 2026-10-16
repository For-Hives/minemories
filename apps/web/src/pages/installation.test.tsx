// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { InstallationPage } from './InstallationPage'
import { guideStorageKey, readGuide, resetGuide, saveGuide } from './installation-state'

beforeEach(() => {
	localStorage.clear()
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
})
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})
function mountGuide() {
	return render(
		<MemoryRouter>
			<InstallationPage />
		</MemoryRouter>
	)
}
function step(name: string) {
	fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
}

test('guides a beginner from exact loader versions through a local first capture', async () => {
	mountGuide()
	expect(screen.getByText('Minecraft Java Edition 1.21.1 + NeoForge 21.1.248')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'C’est fait, on continue' }))
	expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Installer NeoForge')
	expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3 }))
	expect(screen.getByRole('link', { name: 'l’installateur NeoForge 21.1.248' }).getAttribute('href')).toContain(
		'/21.1.248/'
	)
	expect(screen.getByText('%APPDATA%\\.minecraft-minemories')).toBeTruthy()
	step('Télécharger le mod')
	await screen.findByRole('button', { name: 'Réessayer le téléchargement' })
	step('Ranger le fichier')
	expect(screen.getByText(/icône de dossier/)).toBeTruthy()
	expect(screen.getByLabelText('Emplacement du fichier').textContent).toContain('minemories-neoforge-mc1.21.1.jar')
	step('Vérifier en jeu')
	expect(screen.getAllByText(/Options → Contrôles/).length).toBeGreaterThan(0)
	step('Créer un souvenir')
	expect(screen.getByText('/minemories export 16')).toBeTruthy()
	expect(screen.getByText('%USERPROFILE%\\export')).toBeTruthy()
	expect(screen.getByText(/relie Minecraft à ta galerie privée/)).toBeTruthy()
	expect(screen.getByText(/Les captures AFK sont actives par défaut/)).toBeTruthy()
})

test('personalizes, resumes checked steps and resets all choices', () => {
	const view = mountGuide()
	fireEvent.change(screen.getByLabelText('Ton prénom (facultatif)'), { target: { value: 'Mae' } })
	fireEvent.click(screen.getByRole('button', { name: 'macOS' }))
	fireEvent.click(screen.getByLabelText('Réduire les animations'))
	fireEvent.click(screen.getByRole('button', { name: 'C’est fait, on continue' }))
	expect(screen.getByText('À toi de jouer, Mae')).toBeTruthy()
	expect(screen.getByText('~/Library/Application Support/minecraft-minemories')).toBeTruthy()
	expect(screen.getByRole('progressbar').getAttribute('value')).toBe('1')
	view.unmount()
	mountGuide()
	expect(screen.getByLabelText<HTMLInputElement>('Ton prénom (facultatif)').value).toBe('Mae')
	expect(screen.getByRole('button', { name: 'macOS' }).getAttribute('aria-pressed')).toBe('true')
	expect(screen.getByLabelText<HTMLInputElement>('Réduire les animations').checked).toBe(true)
	expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Installer NeoForge')
	fireEvent.click(screen.getByRole('button', { name: 'Recommencer et effacer mes choix' }))
	expect(screen.getByLabelText<HTMLInputElement>('Ton prénom (facultatif)').value).toBe('')
	expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0')
})

test.each([
	['CurseForge', /Create Custom Profile/, /Open Folder/],
	['Modrinth App', /compte Minecraft/, /icône de dossier/],
	['Un autre launcher', /Prism Launcher/, /dossier de l’instance/],
] as const)(
	'adapts local JAR installation to %s without claiming catalogue publication',
	(launcher, loaderText, folderText) => {
		mountGuide()
		fireEvent.click(screen.getByRole('button', { name: launcher }))
		step('Installer NeoForge')
		expect(screen.getByText(loaderText)).toBeTruthy()
		step('Ranger le fichier')
		expect(screen.getByText(folderText)).toBeTruthy()
		fireEvent.click(screen.getByRole('button', { name: 'Minecraft Launcher' }))
		expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0')
	}
)

test('copies the first capture command and gives a manual fallback when clipboard access fails', async () => {
	const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'))
	Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
	mountGuide()
	fireEvent.click(screen.getByRole('button', { name: 'Linux' }))
	step('Créer un souvenir')
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: 'Copier la commande de première capture' }))
	})
	expect(writeText).toHaveBeenCalledWith('/minemories export 16')
	expect(screen.getByText('Copié !')).toBeTruthy()
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: 'Copier le dossier du premier souvenir' }))
	})
	expect(screen.getByText('Sélectionne le texte ci-dessus pour le copier.')).toBeTruthy()
	expect(writeText).toHaveBeenLastCalledWith('~/export')
})

test('completion is explicit and revisiting a step does not count it twice', () => {
	mountGuide()
	for (let index = 0; index < 5; index++)
		fireEvent.click(screen.getByRole('button', { name: 'C’est fait, on continue' }))
	fireEvent.click(screen.getByRole('button', { name: 'Mon souvenir s’ouvre en 3D' }))
	expect(screen.getByRole('progressbar').getAttribute('value')).toBe('6')
	expect(screen.getByRole('heading', { name: 'Ton premier souvenir est là.' })).toBeTruthy()
	step('Préparer')
	fireEvent.click(screen.getByRole('button', { name: 'C’est fait, on continue' }))
	expect(screen.getByRole('progressbar').getAttribute('value')).toBe('6')
	fireEvent.click(screen.getByRole('button', { name: '← Précédent' }))
	expect(screen.getByRole('button', { name: '← Précédent' }).hasAttribute('disabled')).toBe(true)
})

test('ignores malformed stored state and remains usable if storage is blocked', () => {
	localStorage.setItem(guideStorageKey, '{broken')
	expect(readGuide().step).toBe(0)
	localStorage.setItem(
		guideStorageKey,
		JSON.stringify({
			system: 'other',
			launcher: 'other',
			step: 90,
			name: false,
			done: [0, 0, -1, '1', 5, 6],
			reduceMotion: true,
		})
	)
	expect(readGuide()).toMatchObject({
		system: 'windows',
		launcher: 'manuel',
		step: 0,
		name: '',
		done: [0, 5],
		reduceMotion: true,
	})
	vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	const state = readGuide()
	expect(() => saveGuide(state)).not.toThrow()
	expect(resetGuide().done).toEqual([])
	mountGuide()
	fireEvent.click(screen.getByRole('button', { name: 'Recommencer et effacer mes choix' }))
	expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Préparer')
})
