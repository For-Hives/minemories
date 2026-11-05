// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderUi, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { InstallationPage } from './InstallationPage'
import { guideStorageKey, readGuide, resetGuide, saveGuide } from './installation-state'

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
	expect(screen.queryByLabelText('Ton prénom (facultatif)')).toBeNull()
	expect(screen.queryByLabelText('Réduire les animations')).toBeNull()
	expect(screen.queryByRole('button', { name: 'CurseForge' })).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'C’est fait, on continue' }))
	expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Installer le loader')
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

test('the version and loader choices rewrite every step and resume after a reload', () => {
	const view = mountGuide()
	fireEvent.click(screen.getByRole('button', { name: 'macOS' }))
	fireEvent.click(screen.getByRole('button', { name: '1.19.2' }))
	expect(screen.getByText('Minecraft Java Edition 1.19.2 + Forge 43.5.2')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Fabric' }))
	expect(screen.getByText('Minecraft Java Edition 1.19.2 + Fabric 0.20.1')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'C’est fait, on continue' }))
	expect(screen.getByRole('link', { name: 'Java 17 (Temurin, site officiel)' })).toBeTruthy()
	expect(screen.getByRole('link', { name: 'l’installateur Fabric 0.20.1' }).getAttribute('href')).toBe(
		'https://fabricmc.net/use/installer/'
	)
	expect(screen.getByText(/Fabric Loader 0\.20\.1/)).toBeTruthy()
	expect(screen.getByText('~/Library/Application Support/minecraft-minemories')).toBeTruthy()
	expect(screen.getByText(/CurseForge, Modrinth App ou un autre launcher/)).toBeTruthy()
	step('Télécharger le mod')
	expect(screen.getByText(/pas encore publié dans les catalogues CurseForge et Modrinth/)).toBeTruthy()
	expect(screen.getByRole('link', { name: /Fabric API 0\.77\.0\+1\.19\.2/ })).toBeTruthy()
	step('Ranger le fichier')
	expect(screen.getByLabelText('Emplacement du fichier').textContent).toContain('minemories-fabric-mc1.19.2.jar')
	expect(screen.getByLabelText('Emplacement du fichier').textContent).toContain('fabric-api-0.77.0+1.19.2.jar')
	expect(screen.getByRole('progressbar').getAttribute('value')).toBe('1')
	view.unmount()
	mountGuide()
	expect(screen.getByRole('button', { name: 'macOS' }).getAttribute('aria-pressed')).toBe('true')
	expect(screen.getByRole('button', { name: '1.19.2' }).getAttribute('aria-pressed')).toBe('true')
	expect(screen.getByRole('button', { name: 'Fabric' }).getAttribute('aria-pressed')).toBe('true')
	fireEvent.click(screen.getByRole('button', { name: 'Recommencer et effacer mes choix' }))
	expect(screen.getByText('Minecraft Java Edition 1.21.1 + NeoForge 21.1.248')).toBeTruthy()
	expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0')
})

test('a Forge guide links its own installer and a loader missing for a version falls back', () => {
	mountGuide()
	fireEvent.click(screen.getByRole('button', { name: '1.18.2' }))
	expect(screen.getByText('Minecraft Java Edition 1.18.2 + Forge 40.3.12')).toBeTruthy()
	expect(screen.queryByRole('button', { name: 'Fabric' })).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'C’est fait, on continue' }))
	expect(screen.getByRole('link', { name: 'l’installateur Forge 40.3.12' }).getAttribute('href')).toBe(
		'https://maven.minecraftforge.net/net/minecraftforge/forge/1.18.2-40.3.12/forge-1.18.2-40.3.12-installer.jar'
	)
})

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
		JSON.stringify({ system: 'other', minecraft: '1.2.3', loader: 'other', step: 90, done: [0, 0, -1, '1', 5, 6] })
	)
	expect(readGuide()).toMatchObject({
		system: 'windows',
		minecraft: '1.21.1',
		loader: 'neoforge',
		step: 0,
		done: [0, 5],
	})
	localStorage.setItem(guideStorageKey, JSON.stringify({ minecraft: '1.18.2', loader: 'fabric' }))
	expect(readGuide()).toMatchObject({ minecraft: '1.18.2', loader: 'forge' })
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
