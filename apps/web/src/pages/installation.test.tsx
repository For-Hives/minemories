// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderUi, screen, waitFor, within } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Route, Routes, StaticRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { modIndexFixture } from '../testing/mod-index'
import { InstallationPage } from './InstallationPage'
import { catalogs, installerUrl } from './installation-loaders'
import { guideLink, guideStorageKey, versionBadge } from './installation-state'
import { type LoaderTarget, latestDownloadUrl, loaderTargets } from './mod-releases'

function Where() {
	return <output data-testid="where">{useLocation().pathname + useLocation().search}</output>
}
function mountGuide(entry = '/installation', locale: 'fr' | 'en' = 'fr') {
	return renderUi(
		<I18nProvider initialLocale={locale}>
			<MemoryRouter initialEntries={[entry]}>
				<Where />
				<Routes>
					<Route path="/installation" element={<InstallationPage />} />
				</Routes>
			</MemoryRouter>
		</I18nProvider>
	)
}
const prerendered = (locale: 'fr' | 'en' = 'fr') =>
	renderToString(
		<I18nProvider initialLocale={locale}>
			<StaticRouter location="/installation">
				<InstallationPage />
			</StaticRouter>
		</I18nProvider>
	)
const radio = (name: string | RegExp) => screen.getByRole('radio', { name }) as HTMLInputElement
const version = (value: string) => radio(new RegExp(`^${value.replaceAll('.', '\\.')}(?![\\d.])`))
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const continueButton = () => button(/^(Continuer|Continue)$/)
const heading = () => document.querySelector('.install-panel h2')
const panelTitle = () => document.querySelector('.install-panel h2')?.textContent
const counter = () => document.querySelector('.install-progress [role="status"]')?.textContent
const stored = () => JSON.parse(localStorage.getItem(guideStorageKey) ?? '{}')
const text = () => document.querySelector('article')?.textContent ?? ''
const helpOrder = () => [...document.querySelectorAll('#aide summary')].map(item => item.textContent)
const target = (minecraft: string, loader: string) =>
	loaderTargets.find(item => item.minecraft === minecraft && item.loader === loader) as LoaderTarget
const start = () => fireEvent.click(screen.getByRole('button', { name: /^(Installation guidée|Guided installation)/ }))
const next = () => fireEvent.click(continueButton())
/** From the welcome screen to the screen after the way question. */
function answer(minecraft: string, loader: string, way: string) {
	start()
	fireEvent.click(version(minecraft))
	next()
	fireEvent.click(radio(loader))
	next()
	fireEvent.click(radio(new RegExp(way)))
	next()
}

beforeEach(() => {
	localStorage.clear()
	// jsdom names the test machine's own system in its user agent: the guide is tested on Windows unless a test says otherwise.
	vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
})
afterEach(() => {
	cleanup()
	document.body.innerHTML = ''
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

test('the prerendered page is the welcome screen, then the whole guide and its help: no step counter, nothing chosen', () => {
	document.body.innerHTML = prerendered()
	expect(document.querySelector('noscript, progress')).toBeNull()
	expect(document.querySelector('[role="status"]')).toBeNull()
	expect(document.querySelectorAll('input')).toHaveLength(0)
	expect([...document.querySelectorAll('h1, h2')].map(item => item.textContent)).toEqual([
		'Installer Minemories',
		'À quelle version de Minecraft joues-tu\u00a0?',
		'Quel loader de mods utilises-tu\u00a0?',
		'Comment tu ajoutes tes mods\u00a0?',
		'Installe le loader',
		'Installe-le avec l’app CurseForge',
		'Télécharge le mod',
		'Mets-le dans le dossier mods',
		'Vérifie que ça marche',
		'Connecte le jeu',
		'Ton premier souvenir',
		'Si une étape coince',
	])
	// The welcome screen comes first, so hydration does not move what is above the fold.
	expect(document.querySelector('.installation')?.firstElementChild?.className).toBe('install-hero')
	expect(document.querySelector('a.install-way--main')?.getAttribute('href')).toBe('#etape-version')
	expect(document.querySelector('a[href="#aide"]')).toBeTruthy()
	const rows = [...document.querySelectorAll('.install-table tbody tr')].map(row => row.textContent)
	expect(rows).toEqual([
		'1.21.11Fabric, NeoForge, Forge21',
		'1.21.1La plus testéeNeoForge, Fabric, Forge21',
		'1.20.1Forge, Fabric17',
		'1.19.2Forge, Fabric17',
		'1.18.2Forge17',
		'26.3ExpérimentaleFabric25',
	])
	const page = document.body.textContent ?? ''
	// Before hydration the system is a guess: its line keeps its room but is hidden, from screen readers too.
	expect(page).toContain('On dirait que tu es sur Windows.')
	expect(document.querySelector('.install-detected')?.getAttribute('aria-hidden')).toBe('true')
	expect(page).toContain('Seulement si tu n’as pas encore de loader.')
	expect(page).toContain('Minecraft 1.18.2\u00a0: l’installeur Forge 40.3.12, avec Java 17.')
	expect(page).toContain('%APPDATA%\\.minecraft\\mods')
	// The colon after a label follows French typography.
	expect(page).toContain('Avec l’app CurseForge\u00a0: ')
	expect(page).toContain('Windows\u00a0: %APPDATA%')
	expect(page).toContain('~/Library/Application Support/minecraft/mods')
	expect(page).toContain('M → tape le code → Se connecter')
	expect(page).toContain('M → Mes souvenirs → Envoyer ce souvenir.')
	expect(page).toContain('C:\\Users\\<toi>\\export')
	expect(page).toContain('Il est aussi dans Options (l’icône Minemories).')
	// The guide no longer points at the pause menu, which lost its Minemories button, nor at the export command.
	expect(page).not.toMatch(/pause|Échap|\/minemories/i)
	expect(page).not.toMatch(/validé|Most used|la plus utilisée|1\.18\.2 → 1\.21\.11/)
	expect(document.querySelector('a[href="https://www.curseforge.com/minecraft/mc-mods/minemories"]')).toBeTruthy()
	expect(document.querySelector(`a[href="${installerUrl(target('1.18.2', 'forge'))}"]`)).toBeTruthy()
	expect(document.querySelector('a[href="/gallery"]')?.textContent).toBe('Ouvrir ma galerie')
	expect(document.querySelector('#connecter')).toBeTruthy()
	// "Si une étape coince": what can break, in the order it can happen.
	expect(helpOrder()).toEqual([
		'L’installeur du loader ne s’ouvre pas\u00a0?',
		'Le mod n’apparaît pas\u00a0?',
		'M ouvre autre chose\u00a0?',
		'Le jeu plante au lancement\u00a0?',
		'Le code ne marche pas\u00a0?',
		'Une partie de la construction manque\u00a0?',
	])
	// Connecting comes before the first memory: pairing does not send memories taken earlier.
	expect(page.indexOf('M → tape le code')).toBeLessThan(page.indexOf('M → Mes souvenirs'))
})

test('hydrating the prerendered page matches it, then leaves the welcome screen and the help', async () => {
	const container = document.createElement('div')
	container.innerHTML = prerendered()
	document.body.append(container)
	const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
	const recovered = vi.fn()
	await act(async () => {
		hydrateRoot(
			container,
			<I18nProvider initialLocale="fr">
				<MemoryRouter initialEntries={['/installation']}>
					<InstallationPage />
				</MemoryRouter>
			</I18nProvider>,
			{ onRecoverableError: recovered }
		)
	})
	expect(recovered).not.toHaveBeenCalled()
	expect(errors).not.toHaveBeenCalled()
	expect(container.querySelector('.install-static')).toBeNull()
	expect(container.querySelector('.install-hero')).toBeTruthy()
	expect(container.querySelector('#aide')).toBeTruthy()
	expect(container.querySelector('progress')).toBeNull()
	// The link to the static guide became the button that starts the stepper.
	expect(container.querySelector('button.install-way--main')).toBeTruthy()
	expect(container.querySelector('.install-detected')?.hasAttribute('aria-hidden')).toBe(false)
})

test('the welcome screen guesses the computer, lets the visitor correct it and offers two ways in', () => {
	vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
	mountGuide()
	expect(text()).toContain('On dirait que tu es sur macOS.')
	fireEvent.click(button('Ce n’est pas ça\u00a0? Changer'))
	fireEvent.click(button('Linux'))
	expect(text()).toContain('On dirait que tu es sur Linux.')
	// The chosen button disappears with the list: focus returns to the toggle, not to the top of the page.
	expect(document.activeElement).toBe(button('Ce n’est pas ça\u00a0? Changer'))
	expect(stored().system).toBe('linux')
	expect(screen.getByRole('link', { name: /^Voir tous les téléchargements/ }).getAttribute('href')).toBe('/downloads')
	expect(screen.getByRole('link', { name: 'Besoin d’aide\u00a0?' }).getAttribute('href')).toBe('#aide')
	expect(document.querySelector('progress, .install-static')).toBeNull()
})

test('the guided installation, version first: Windows, 1.21.11, Fabric, the file added by hand', async () => {
	mountGuide()
	start()
	expect(counter()).toBe('Étape 1 sur 8')
	expect(document.activeElement).toBe(heading())
	expect(panelTitle()).toBe('À quelle version de Minecraft joues-tu\u00a0?')
	// Nothing is chosen for the visitor: Continue waits for an answer.
	expect(continueButton().disabled).toBe(true)
	expect(text()).toContain('Choisis une réponse pour continuer.')
	const cards = within(screen.getByRole('group', { name: 'À quelle version de Minecraft joues-tu\u00a0?' }))
	expect(cards.getAllByRole('radio').map(item => (item as HTMLInputElement).value)).toEqual([
		'1.21.11',
		'1.21.1',
		'1.20.1',
		'1.19.2',
		'1.18.2',
		'26.3',
	])
	expect(version('1.21.1').closest('label')?.textContent).toBe('1.21.1Java 21La plus testée')
	expect(version('26.3').closest('label')?.textContent).toBe('26.3Java 25Expérimentale')
	fireEvent.click(version('1.21.11'))
	expect(text()).not.toContain('pas encore essayée en jeu')
	next()
	expect(counter()).toBe('Étape 2 sur 8')
	expect(document.activeElement).toBe(heading())
	const loaders = within(screen.getByRole('group', { name: 'Quel loader de mods utilises-tu\u00a0?' }))
	expect(loaders.getAllByRole('radio').map(item => (item as HTMLInputElement).value)).toEqual([
		'fabric',
		'neoforge',
		'forge',
		'none',
	])
	expect(loaders.getAllByRole('radio').some(item => (item as HTMLInputElement).checked)).toBe(false)
	expect(continueButton().disabled).toBe(true)
	fireEvent.click(radio('Fabric'))
	expect(screen.getByRole('link', { name: 'Fabric API' }).getAttribute('href')).toContain('g=1.21.11')
	expect(text()).not.toContain('Quilt')
	next()
	expect(panelTitle()).toBe('Comment tu ajoutes tes mods\u00a0?')
	fireEvent.click(radio(/^J’ajoute le fichier moi-même/))
	next()
	expect(counter()).toBe('Étape 4 sur 8')
	expect(panelTitle()).toBe('Télécharge le mod')
	expect(screen.getByRole('link', { name: 'Télécharger pour Minecraft 1.21.11 · Fabric' }).getAttribute('href')).toBe(
		latestDownloadUrl('1.21.11', 'fabric')
	)
	// The index answers 404: the static link to the newest JAR stays, with a retry.
	await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
	expect(screen.getByRole('link', { name: /^Télécharger pour Minecraft/ })).toBeTruthy()
	fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }))
	await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2))
	expect(screen.getByRole('link', { name: 'Fabric API 0.141.6+1.21.11' }).getAttribute('href')).toContain('g=1.21.11')
	next()
	expect(panelTitle()).toBe('Mets-le dans le dossier mods')
	expect(text()).toContain('%APPDATA%\\.minecraft\\mods')
	expect(text()).toContain('Appuie sur Windows + R, colle ce chemin, puis appuie sur Entrée.')
	expect(screen.getByRole('figure', { name: 'Emplacement du fichier' }).textContent).toBe(
		'%APPDATA%\\.minecraft\\mods└─ minemories-fabric-mc1.21.11-….jar└─ fabric-api-0.141.6+1.21.11.jar'
	)
	expect(helpOrder()[0]).toBe('Le mod n’apparaît pas\u00a0?')
	next()
	expect(panelTitle()).toBe('Vérifie que ça marche')
	expect(text()).toContain('Lance Minecraft avec le profil Fabric, puis ouvre un monde')
	expect(screen.getByRole('img', { name: 'Le menu Minemories avec le bouton Prendre un souvenir' })).toBeTruthy()
	// The help of the screen comes first, the rest follows.
	expect(helpOrder().slice(0, 3)).toEqual([
		'M ouvre autre chose\u00a0?',
		'Le mod n’apparaît pas\u00a0?',
		'Le jeu plante au lancement\u00a0?',
	])
	expect(helpOrder()).toHaveLength(6)
	next()
	expect(panelTitle()).toBe('Connecte le jeu')
	expect(helpOrder()[0]).toBe('Le code ne marche pas\u00a0?')
	next()
	expect(panelTitle()).toBe('Ton premier souvenir')
	expect(counter()).toBe('Étape 8 sur 8')
	expect(text()).not.toMatch(/pause|Échap|\/minemories/i)
	fireEvent.click(button('Mon souvenir s’ouvre en 3D'))
	expect(panelTitle()).toBe('Ton premier souvenir est là.')
	expect(document.activeElement).toBe(heading())
	expect(document.querySelector('progress')).toBeNull()
	expect(screen.getByRole('link', { name: /^Découvre les captures/ }).getAttribute('href')).toBe('/how-it-works')
	expect(stored()).toMatchObject({ minecraft: '1.21.11', loader: 'fabric', way: 'file', step: 'done', active: true })
	fireEvent.click(button('Recommencer et effacer mes choix'))
	expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Installation guidée/ }))
	expect(stored()).toEqual({
		minecraft: '',
		loader: '',
		way: '',
		preset: false,
		step: 'version',
		active: false,
		system: 'windows',
	})
})

test('the download step reads the index: the exact version and size, or not published yet', async () => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockImplementation(async () =>
				Response.json(modIndexFixture({ 'fabric-mc1.21.1': [{ version: '0.38.1-beta.1', bytes: 2_500_000 }] }))
			)
	)
	mountGuide('/installation?minecraft=1.21.1&loader=fabric')
	expect(await screen.findByText(/^Minemories 0\.38\.1-beta\.1 · 2,5\sMo$/)).toBeTruthy()
	cleanup()
	localStorage.clear()
	mountGuide('/installation?minecraft=1.20.1&loader=forge')
	expect(await screen.findByText('Pas encore publié')).toBeTruthy()
	expect(screen.queryByRole('link', { name: /^Télécharger pour Minecraft/ })).toBeNull()
})

test('a version with a single loader selects it; without a loader the guide installs the version’s own', () => {
	mountGuide()
	start()
	fireEvent.click(version('1.18.2'))
	next()
	expect(radio('Forge').checked).toBe(true)
	expect(continueButton().disabled).toBe(false)
	fireEvent.click(radio(/^Je n’ai pas encore de loader/))
	expect(radio(/^Je n’ai pas encore de loader/).closest('label')?.textContent).toContain('On installe Forge ensemble.')
	next()
	fireEvent.click(radio(/^J’ajoute le fichier/))
	next()
	expect(counter()).toBe('Étape 4 sur 9')
	expect(panelTitle()).toBe('Installe le loader')
	expect(screen.getByRole('link', { name: 'l’installeur Forge 40.3.12' }).getAttribute('href')).toBe(
		installerUrl(target('1.18.2', 'forge'))
	)
	expect(screen.getByRole('link', { name: 'Temurin, une version gratuite de Java' }).getAttribute('href')).toBe(
		'https://adoptium.net/temurin/releases/?version=17'
	)
	expect(text()).toContain('Installe Java 17 si tu ne l’as pas')
	expect(text()).toContain('choisis Install client, puis valide.')
	expect(helpOrder()[0]).toBe('L’installeur du loader ne s’ouvre pas\u00a0?')
	// Back keeps the answers.
	fireEvent.click(button('← Retour'))
	fireEvent.click(button('← Retour'))
	expect(radio(/^Je n’ai pas encore de loader/).checked).toBe(true)
	// A version that has Fabric installs Fabric, with its own installer sentence; "no loader" is kept.
	fireEvent.click(button('← Retour'))
	fireEvent.click(version('1.21.11'))
	next()
	expect(radio(/^Je n’ai pas encore de loader/).checked).toBe(true)
	next()
	next()
	// The Fabric installer installs any Fabric Loader: its link names no version.
	expect(screen.getByRole('link', { name: 'l’installeur Fabric' }).getAttribute('href')).toBe(
		'https://fabricmc.net/use/installer/'
	)
	expect(text()).toContain('choisis Minecraft 1.21.11 et Fabric Loader 0.20.1, puis clique sur Install.')
})

test('the version change keeps a loader the new version has and clears one it lacks', () => {
	mountGuide()
	start()
	// An experimental version says so, and its single loader is selected.
	fireEvent.click(version('26.3'))
	expect(text()).toContain('Expérimentale\u00a0: pas encore essayée en jeu.')
	next()
	expect(radio('Fabric').checked).toBe(true)
	fireEvent.click(button('← Retour'))
	fireEvent.click(version('1.21.1'))
	next()
	expect(radio('Fabric').checked).toBe(true)
	fireEvent.click(radio('NeoForge'))
	expect(text()).toContain('Quilt\u00a0: prends le JAR Fabric.')
	fireEvent.click(button('← Retour'))
	fireEvent.click(version('1.21.11'))
	next()
	expect(radio('NeoForge').checked).toBe(true)
	fireEvent.click(button('← Retour'))
	fireEvent.click(version('1.20.1'))
	next()
	expect(screen.getAllByRole('radio').some(item => (item as HTMLInputElement).checked)).toBe(false)
	expect(continueButton().disabled).toBe(true)
})

test('with the CurseForge app there is nothing to download or place, and Fabric API is named only on Fabric', () => {
	mountGuide()
	answer('1.21.11', 'Fabric', '^Avec l’app CurseForge')
	expect(counter()).toBe('Étape 4 sur 7')
	expect(panelTitle()).toBe('Installe-le avec l’app CurseForge')
	expect(text()).toContain('Crée un profil Minecraft 1.21.11 avec Fabric, ou ouvre le tien.')
	expect(text()).toContain('Sur Fabric, l’app ajoute aussi Fabric API.')
	expect(screen.getByRole('link', { name: 'Minemories sur CurseForge' }).getAttribute('href')).toBe(
		'https://www.curseforge.com/minecraft/mc-mods/minemories'
	)
	next()
	expect(panelTitle()).toBe('Vérifie que ça marche')
	cleanup()
	localStorage.clear()
	mountGuide()
	answer('1.20.1', 'Forge', '^Avec l’app CurseForge')
	expect(text()).toContain('Crée un profil Minecraft 1.20.1 avec Forge')
	expect(document.querySelector('.install-panel')?.textContent).not.toContain('Fabric API')
})

test('without any catalog the way question disappears', () => {
	const curseforge = catalogs[0] as { url: string | null }
	const url = curseforge.url
	curseforge.url = null
	try {
		mountGuide()
		start()
		expect(counter()).toBe('Étape 1 sur 7')
		fireEvent.click(version('1.20.1'))
		next()
		fireEvent.click(radio('Fabric'))
		next()
		expect(panelTitle()).toBe('Télécharge le mod')
	} finally {
		curseforge.url = url
	}
})

test('a link from the download table opens on the download, keeps its query string and resumes after a reload', () => {
	const entry = '/installation?minecraft=1.20.1&loader=fabric&src=downloads'
	mountGuide(entry)
	expect(counter()).toBe('Étape 1 sur 5')
	expect(panelTitle()).toBe('Télécharge le mod')
	expect(document.activeElement).toBe(document.body)
	expect(screen.getByTestId('where').textContent).toBe(entry)
	expect(guideLink({ minecraft: '1.20.1', loader: 'fabric' })).toBe('/installation?minecraft=1.20.1&loader=fabric')
	next()
	expect(panelTitle()).toBe('Mets-le dans le dossier mods')
	cleanup()
	mountGuide(entry)
	expect(panelTitle()).toBe('Mets-le dans le dossier mods')
	expect(document.activeElement).toBe(document.body)
	// Back from the first screen returns to the welcome screen without the link's answers or query string, so a new
	// start asks the questions again and a reload does not bring the preset back.
	fireEvent.click(button('← Retour'))
	fireEvent.click(button('← Retour'))
	expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Installation guidée/ }))
	expect(screen.getByTestId('where').textContent).toBe('/installation')
	expect(stored()).toMatchObject({ minecraft: '', loader: '', preset: false, active: false })
	start()
	expect(counter()).toBe('Étape 1 sur 8')
	expect(version('1.20.1').checked).toBe(false)
	expect(continueButton().disabled).toBe(true)
	// An unknown pair is ignored.
	cleanup()
	localStorage.clear()
	mountGuide('/installation?minecraft=1.20.4&loader=fabric')
	expect(screen.getByRole('button', { name: /^Installation guidée/ })).toBeTruthy()
})

test('saved answers: a v4 choice is kept, a v3 guide is dropped, damaged or blocked storage leaves the guide working', () => {
	// A v4 save has no system: the one detected in this browser fills it.
	vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
	localStorage.setItem('minemories-installation-v4', JSON.stringify({ minecraft: '1.20.1', loader: 'forge' }))
	localStorage.setItem('minemories-installation-v3', JSON.stringify({ minecraft: '1.21.1', loader: 'neoforge' }))
	mountGuide()
	expect(localStorage.getItem('minemories-installation-v4')).toBeNull()
	expect(localStorage.getItem('minemories-installation-v3')).toBeNull()
	expect(stored()).toMatchObject({ minecraft: '1.20.1', loader: 'forge', active: false, system: 'mac' })
	start()
	expect(version('1.20.1').checked).toBe(true)
	cleanup()
	localStorage.setItem(guideStorageKey, '{broken')
	localStorage.setItem('minemories-installation-v4', 'null')
	mountGuide()
	expect(screen.getByRole('button', { name: /^Installation guidée/ })).toBeTruthy()
	cleanup()
	vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	mountGuide()
	start()
	fireEvent.click(version('1.21.1'))
	expect(version('1.21.1').checked).toBe(true)
})

test('the mods folder follows the computer, and the path copies or says how to copy it', async () => {
	const writeText = vi.fn().mockResolvedValue(undefined)
	Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
	mountGuide('/installation?minecraft=1.21.1&loader=forge')
	next()
	fireEvent.click(button('Ce n’est pas ça\u00a0? Changer'))
	fireEvent.click(button('macOS'))
	expect(text()).toContain('~/Library/Application Support/minecraft/mods')
	expect(text()).toContain('Dans le Finder, choisis Aller → Aller au dossier (Maj + Cmd + G)')
	expect(screen.getByRole('figure', { name: 'Emplacement du fichier' }).textContent).toBe(
		'~/Library/Application Support/minecraft/mods└─ minemories-forge-mc1.21.1-….jar'
	)
	fireEvent.click(button('Copier le chemin du dossier mods'))
	expect(await screen.findByText(/^Copié\s!$/)).toBeTruthy()
	expect(writeText).toHaveBeenCalledWith('~/Library/Application Support/minecraft/mods')
	writeText.mockRejectedValue(new Error('denied'))
	fireEvent.click(button('Copier le chemin du dossier mods'))
	expect(await screen.findByText('Sélectionne le texte ci-dessus pour le copier.')).toBeTruthy()
})

test('in English the guide has no accented text and quotes the mod’s own labels', () => {
	document.body.innerHTML = prerendered('en')
	expect(document.body.textContent).not.toMatch(/[àâçéèêëîïôùûü]/i)
	expect(document.body.textContent).toContain('Press M → Take a memory. It then goes to your gallery on its own.')
	document.body.innerHTML = ''
	mountGuide('/installation', 'en')
	start()
	fireEvent.click(version('1.21.1'))
	next()
	fireEvent.click(radio('Fabric'))
	expect(text()).toContain('Quilt: take the Fabric JAR.')
	next()
	fireEvent.click(radio(/^I add the file myself/))
	next()
	expect(text()).not.toMatch(/[àâçéèêëîïôùûü]/i)
	expect(versionBadge('1.21.1')).toBe('Most tested')
	expect(versionBadge('26.3')).toBe('Experimental')
	expect(versionBadge('1.21.11')).toBeNull()
})
