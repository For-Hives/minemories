// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderUi, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { InstallationPage } from './InstallationPage'
import {
	defaults,
	guideLink,
	guideStorageKey,
	loadersFor,
	presetFromSearch,
	readGuide,
	recommendedLoader,
	resetGuide,
	saveGuide,
	stepsFor,
	targetFor,
} from './installation-state'

function render(ui: Parameters<typeof renderUi>[0]) {
	return renderUi(ui, { wrapper: I18nProvider })
}

function Where() {
	return <output data-testid="where">{useLocation().pathname + useLocation().search}</output>
}
function mountGuide(entry = '/installation') {
	return render(
		<MemoryRouter initialEntries={[entry]}>
			<Where />
			<Routes>
				<Route path="/installation" element={<InstallationPage />} />
				<Route path="/downloads" element={<p>Downloads page</p>} />
			</Routes>
		</MemoryRouter>
	)
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const start = () => click(/^Installation guidée/)
const panel = () => document.querySelector('.install-panel h2') as HTMLElement
const next = () => click('Continuer')
const title = () => panel().textContent
const stored = () => JSON.parse(localStorage.getItem(guideStorageKey) ?? '{}')
function platform(name: string, userAgent = '') {
	vi.spyOn(navigator, 'platform', 'get').mockReturnValue(name)
	vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
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

test('the welcome screen detects the system and offers only the two ways in, a way to correct the guess and the help', () => {
	platform('MacIntel')
	mountGuide()
	expect(screen.getByText(/On dirait que tu es sur/).textContent).toContain('macOS')
	const choices = screen.getAllByRole('button').map(button => button.textContent)
	expect(choices).toHaveLength(2)
	expect(choices[0]).toBe('Ce n’est pas ça ? Changer')
	expect(choices[1]).toMatch(/^Installation guidée/)
	expect(screen.getByRole('link', { name: /Voir tous les téléchargements/ }).getAttribute('href')).toBe('/downloads')
	expect(screen.getByRole('link', { name: 'Besoin d’aide ?' }).getAttribute('href')).toBe('#aide')
	expect(document.getElementById('aide')).toBeTruthy()
	expect(screen.queryByLabelText('Réduire les animations')).toBeNull()
	expect(screen.queryByRole('progressbar')).toBeNull()
	click('Ce n’est pas ça ? Changer')
	expect(screen.getByRole('button', { name: 'Ce n’est pas ça ? Changer' }).getAttribute('aria-expanded')).toBe('true')
	fireEvent.click(screen.getByRole('button', { name: 'Linux' }))
	expect(screen.getByText(/On dirait que tu es sur/).textContent).toContain('Linux')
	expect(screen.queryByRole('button', { name: 'Windows' })).toBeNull()
	expect(stored().system).toBe('linux')
})

test('an unrecognised browser falls back to Windows and the other link opens the download table', () => {
	platform('Plan 9')
	mountGuide()
	expect(screen.getByText(/On dirait que tu es sur/).textContent).toContain('Windows')
	fireEvent.click(screen.getByRole('link', { name: /Voir tous les téléchargements/ }))
	expect(screen.getByText('Downloads page')).toBeTruthy()
})

test('the guided installation asks three light questions, then walks through the installation one screen at a time', async () => {
	platform('Win32')
	mountGuide()
	start()
	expect(title()).toBe('Sur quel ordinateur joues-tu ?')
	expect(document.activeElement).toBe(panel())
	expect(screen.getByText('Étape 1 sur 7')).toBeTruthy()
	expect(screen.getByRole('progressbar').getAttribute('max')).toBe('7')
	expect(screen.getByRole('radio', { name: 'Windows' })).toHaveProperty('checked', true)
	expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Continuer', '← Retour'])
	next()
	expect(title()).toBe('À quelle version de Minecraft joues-tu ?')
	// Only the version itself: no loader list, and a badge only on a version not validated in game yet.
	expect(screen.getByRole('radio', { name: /^1\.21\.11(?!\d)/ }).closest('label')?.textContent).toBe('1.21.11')
	expect(screen.getByRole('radio', { name: /^26\.3/ }).closest('label')?.textContent).toBe(
		'26.3Expérimental · pas encore validé en jeu'
	)
	fireEvent.click(screen.getByRole('radio', { name: /^1\.21\.11(?!\d)/ }))
	next()
	expect(title()).toBe('Quel loader de mods utilises-tu ?')
	// Only the loader names, then a last choice for visitors who have none.
	expect(screen.getAllByRole('radio').map(radio => radio.closest('label')?.textContent)).toEqual([
		'Fabric',
		'NeoForge',
		'Forge',
		'Je n’ai pas encore de loader de mods',
	])
	expect(screen.getByText(/Pas encore de loader, ou pas sûr \?/)).toBeTruthy()
	fireEvent.click(screen.getByRole('radio', { name: 'Fabric' }))
	next()
	// A visitor who already has a loader goes straight to the mod.
	expect(title()).toBe('Télécharger le mod')
	expect(screen.getByText('Étape 4 sur 7')).toBeTruthy()
	await screen.findByRole('button', { name: 'Réessayer le téléchargement' })
	expect(screen.getByRole('link', { name: /Fabric API 0\.141\.6\+1\.21\.11/ })).toBeTruthy()
	next()
	expect(title()).toBe('Ranger le fichier')
	expect(screen.getByText('%APPDATA%\\.minecraft\\mods')).toBeTruthy()
	expect(screen.getByText(/Windows \+ R/)).toBeTruthy()
	expect(screen.getByLabelText('Emplacement du fichier').textContent).toContain('minemories-fabric-mc1.21.11-X.Y.Z.jar')
	expect(screen.getByLabelText('Emplacement du fichier').textContent).toContain('fabric-api-0.141.6+1.21.11.jar')
	expect(screen.getByText(/CurseForge, Modrinth App ou un autre launcher/).closest('details')).toBeTruthy()
	next()
	expect(title()).toBe('Lancer le jeu')
	expect(screen.getAllByText(/en haut à droite du menu pause/).length).toBeGreaterThan(0)
	expect(screen.getByRole('img', { name: /Le menu pause de Minecraft/ }).getAttribute('src')).toContain(
		'guide-pause-menu'
	)
	expect(screen.getAllByText(/Options → Contrôles/).length).toBeGreaterThan(0)
	next()
	expect(title()).toBe('Créer un souvenir')
	expect(screen.getByRole('heading', { name: 'Avec le menu' })).toBeTruthy()
	expect(screen.getByRole('heading', { name: 'Avec une commande' })).toBeTruthy()
	expect(screen.getByText('/minemories export 16')).toBeTruthy()
	expect(screen.getByText(/de 2 à 128/)).toBeTruthy()
	expect(screen.getByText('%USERPROFILE%\\export')).toBeTruthy()
	expect(screen.getByText(/relie Minecraft à ta galerie privée/)).toBeTruthy()
	expect(screen.getByText(/Les captures AFK sont actives par défaut/)).toBeTruthy()
	click('Mon souvenir s’ouvre en 3D')
	expect(title()).toBe('Ton premier souvenir est là.')
	expect(document.activeElement).toBe(panel())
	expect(screen.queryByRole('progressbar')).toBeNull()
	expect(screen.getByRole('link', { name: /Explorer les captures/ }).getAttribute('href')).toBe('/how-it-works')
	expect(stored()).toMatchObject({ step: 'done', minecraft: '1.21.11', loader: 'fabric', needsLoader: false })
	click('Recommencer et effacer mes choix')
	expect(screen.getByRole('button', { name: /^Installation guidée/ })).toBeTruthy()
	expect(stored()).toMatchObject({ active: false, step: 'system', minecraft: '1.21.1', loader: 'neoforge' })
})

test('without a loader, the guide installs the recommended one in a dedicated folder and places the mod there', () => {
	platform('Win32')
	mountGuide()
	start()
	next()
	fireEvent.click(screen.getByRole('radio', { name: /^1\.21\.11(?!\d)/ }))
	next()
	fireEvent.click(screen.getByRole('radio', { name: 'Je n’ai pas encore de loader de mods' }))
	expect(stored()).toMatchObject({ needsLoader: true, loader: 'fabric' })
	next()
	expect(title()).toBe('Installer le loader')
	expect(screen.getByText('Étape 4 sur 8')).toBeTruthy()
	expect(screen.getAllByRole('link', { name: 'l’installateur Fabric 0.20.1' })[0]?.getAttribute('href')).toBe(
		'https://fabricmc.net/use/installer/'
	)
	const installerLine = screen.getAllByRole('link', { name: 'l’installateur Fabric 0.20.1' })[0]?.parentElement
	expect(installerLine?.textContent).toContain('Télécharge l’installateur Fabric 0.20.1. Ouvre-le avec Java, choisis')
	expect(document.body.textContent).toContain('Ouvre CurseForge, choisis Minecraft, puis clique sur')
	expect(document.body.textContent).toContain('Ouvre Modrinth App et connecte-toi')
	expect(document.body.textContent).not.toContain('À examiner')
	expect(screen.getAllByRole('link', { name: 'Java 21 (Temurin, site officiel)' }).length).toBeGreaterThan(0)
	expect(screen.getAllByText('%APPDATA%\\.minecraft-minemories').length).toBeGreaterThan(0)
	expect(screen.getByText('Pas à pas détaillé avec le Minecraft Launcher').closest('details')).toBeTruthy()
	next()
	next()
	expect(title()).toBe('Ranger le fichier')
	expect(screen.getByText('%APPDATA%\\.minecraft-minemories\\mods')).toBeTruthy()
	click('← Retour')
	click('← Retour')
	click('← Retour')
	expect(screen.getByRole('radio', { name: 'Je n’ai pas encore de loader de mods' })).toHaveProperty('checked', true)
	fireEvent.click(screen.getByRole('radio', { name: 'NeoForge' }))
	expect(stored()).toMatchObject({ needsLoader: false, loader: 'neoforge' })
	next()
	expect(title()).toBe('Télécharger le mod')
})

test('Back returns one screen, and from the first screen to the welcome screen', () => {
	mountGuide()
	start()
	next()
	next()
	expect(title()).toBe('Quel loader de mods utilises-tu ?')
	click('← Retour')
	expect(title()).toBe('À quelle version de Minecraft joues-tu ?')
	click('← Retour')
	click('← Retour')
	expect(screen.getByRole('button', { name: /^Installation guidée/ })).toBeTruthy()
	expect(stored().active).toBe(false)
})

test('a version with a single loader still asks, to offer the no-loader choice', () => {
	mountGuide()
	start()
	next()
	fireEvent.click(screen.getByRole('radio', { name: /^1\.18\.2(?!\d)/ }))
	next()
	expect(title()).toBe('Quel loader de mods utilises-tu ?')
	expect(screen.getAllByRole('radio')).toHaveLength(2)
	fireEvent.click(screen.getByRole('radio', { name: 'Je n’ai pas encore de loader de mods' }))
	next()
	expect(title()).toBe('Installer le loader')
	expect(screen.getAllByRole('link', { name: 'l’installateur Forge 40.3.12' })[0]?.getAttribute('href')).toBe(
		'https://maven.minecraftforge.net/net/minecraftforge/forge/1.18.2-40.3.12/forge-1.18.2-40.3.12-installer.jar'
	)
	click('← Retour')
	expect(title()).toBe('Quel loader de mods utilises-tu ?')
})

test('a mac guide suggests its folders and a loader missing for a newly chosen version falls back', () => {
	platform('MacIntel')
	mountGuide()
	start()
	next()
	fireEvent.click(screen.getByRole('radio', { name: /^1\.19\.2(?!\d)/ }))
	next()
	fireEvent.click(screen.getByRole('radio', { name: 'Fabric' }))
	click('← Retour')
	fireEvent.click(screen.getByRole('radio', { name: /^1\.18\.2(?!\d)/ }))
	expect(stored()).toMatchObject({ minecraft: '1.18.2', loader: 'forge' })
	next()
	fireEvent.click(screen.getByRole('radio', { name: 'Je n’ai pas encore de loader de mods' }))
	next()
	expect(title()).toBe('Installer le loader')
	expect(screen.getAllByText('~/Library/Application Support/minecraft-minemories').length).toBeGreaterThan(0)
	expect(screen.getAllByRole('link', { name: 'l’installateur Forge 40.3.12' })[0]).toBeTruthy()
	next()
	next()
	expect(screen.getByText('~/Library/Application Support/minecraft-minemories/mods')).toBeTruthy()
	expect(screen.getByText(/Aller au dossier/)).toBeTruthy()
})

test('progress is saved and the guide resumes on the same screen after a reload without stealing focus', () => {
	const view = mountGuide()
	start()
	next()
	fireEvent.click(screen.getByRole('radio', { name: /^1\.19\.2(?!\d)/ }))
	next()
	fireEvent.click(screen.getByRole('radio', { name: 'Je n’ai pas encore de loader de mods' }))
	next()
	expect(title()).toBe('Installer le loader')
	view.unmount()
	mountGuide()
	expect(title()).toBe('Installer le loader')
	expect(screen.getByText('Étape 4 sur 8')).toBeTruthy()
	expect(screen.getAllByRole('link', { name: 'l’installateur Fabric 0.20.1' })[0]).toBeTruthy()
	expect(document.activeElement).not.toBe(panel())
	click('← Retour')
	expect(screen.getByRole('radio', { name: 'Je n’ai pas encore de loader de mods' })).toHaveProperty('checked', true)
})

test('a link from the download table pre-selects the version and loader and skips those two questions', () => {
	mountGuide(guideLink(targetFor('1.21.11', 'fabric')))
	expect(screen.getByTestId('where').textContent).toBe('/installation')
	expect(title()).toBe('Sur quel ordinateur joues-tu ?')
	expect(screen.getByText('Étape 1 sur 5')).toBeTruthy()
	expect(stored()).toMatchObject({ minecraft: '1.21.11', loader: 'fabric', preset: true, active: true })
	next()
	expect(title()).toBe('Télécharger le mod')
	click('← Retour')
	click('← Retour')
	start()
	expect(screen.getByText('Étape 1 sur 7')).toBeTruthy()
})

test('an unknown pre-selection in the link is ignored', () => {
	mountGuide('/installation?minecraft=9.9&loader=fabric')
	expect(screen.getByRole('button', { name: /^Installation guidée/ })).toBeTruthy()
	expect(presetFromSearch(new URLSearchParams('minecraft=1.18.2&loader=fabric'))).toBeNull()
	expect(presetFromSearch(new URLSearchParams('minecraft=1.18.2&loader=forge'))).toEqual({
		minecraft: '1.18.2',
		loader: 'forge',
	})
})

test('copies the first capture command and gives a manual fallback when clipboard access fails', async () => {
	const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'))
	Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
	platform('Linux x86_64')
	mountGuide()
	start()
	for (let index = 0; index < 6; index++) next()
	expect(title()).toBe('Créer un souvenir')
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

test('the help stays reachable at the bottom of every screen', () => {
	mountGuide()
	const help = document.getElementById('aide') as HTMLElement
	expect(within(help).getByRole('heading', { name: 'Si une étape coince' })).toBeTruthy()
	start()
	expect(document.getElementById('aide')).toBe(help)
})

test('the state helpers know which screens a choice needs', () => {
	expect(stepsFor({ preset: false, needsLoader: true })).toHaveLength(8)
	expect(stepsFor({ preset: false, needsLoader: false })).not.toContain('install')
	expect(stepsFor({ preset: false, needsLoader: false })).toContain('loader')
	expect(stepsFor({ preset: true, needsLoader: false })).toEqual(['system', 'download', 'place', 'verify', 'memory'])
	expect(recommendedLoader('1.21.11')).toBe('fabric')
	expect(recommendedLoader('1.21.1')).toBe('neoforge')
	expect(recommendedLoader('1.18.2')).toBe('forge')
	expect(loadersFor('1.18.2').map(item => item.loader)).toEqual(['forge'])
	expect(guideLink({ minecraft: '1.21.1', loader: 'neoforge' })).toBe('/installation?minecraft=1.21.1&loader=neoforge')
})

test('ignores malformed stored state and remains usable if storage is blocked', () => {
	localStorage.setItem(guideStorageKey, '{broken')
	expect(readGuide()).toBeNull()
	localStorage.setItem(guideStorageKey, 'null')
	expect(readGuide()).toBeNull()
	localStorage.setItem(
		guideStorageKey,
		JSON.stringify({ system: 'other', minecraft: '1.2.3', loader: 'other', step: 'nowhere', active: 'yes', preset: 1 })
	)
	expect(readGuide()).toEqual({ ...defaults, minecraft: '1.21.1', loader: 'neoforge' })
	localStorage.setItem(
		guideStorageKey,
		JSON.stringify({ system: 'mac', minecraft: '1.18.2', loader: 'fabric', step: 'install' })
	)
	// The loader screen only exists for a visitor who said they have no loader.
	expect(readGuide()).toMatchObject({ system: 'mac', minecraft: '1.18.2', loader: 'forge', step: 'system' })
	localStorage.setItem(guideStorageKey, JSON.stringify({ minecraft: '1.18.2', step: 'install', needsLoader: true }))
	expect(readGuide()).toMatchObject({ step: 'install', needsLoader: true })
	localStorage.setItem(
		guideStorageKey,
		JSON.stringify({ system: 'linux', minecraft: '1.21.1', loader: 'forge', step: 'done', active: true })
	)
	expect(readGuide()).toMatchObject({ system: 'linux', loader: 'forge', step: 'done', active: true, preset: false })
	vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	expect(readGuide()).toBeNull()
	expect(() => saveGuide(defaults)).not.toThrow()
	expect(resetGuide('mac')).toEqual({ ...defaults, system: 'mac' })
	mountGuide()
	start()
	next()
	expect(title()).toBe('À quelle version de Minecraft joues-tu ?')
	click('← Retour')
	click('← Retour')
	expect(screen.getByRole('button', { name: /^Installation guidée/ })).toBeTruthy()
})
