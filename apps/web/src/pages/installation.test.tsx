// @vitest-environment jsdom
import { cleanup, fireEvent, render as renderUi, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Route, Routes, StaticRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { InstallationPage } from './InstallationPage'
import { installerUrl } from './installation-loaders'
import {
	choiceStorageKey,
	chooseMinecraft,
	guideLink,
	noChoice,
	presetFromSearch,
	readChoice,
	saveChoice,
	starterLoader,
	targetFor,
	versionBadge,
} from './installation-state'
import { type LoaderTarget, latestDownloadUrl } from './mod-releases'

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
			</Routes>
		</MemoryRouter>
	)
}
const radio = (name: string | RegExp) => screen.getByRole('radio', { name }) as HTMLInputElement
const version = (value: string) => radio(new RegExp(`^${value.replaceAll('.', '\\.')}(?![\\d.])`))
const stored = () => JSON.parse(localStorage.getItem(choiceStorageKey) ?? '{}')
const text = () => document.querySelector('article')?.textContent ?? ''

beforeEach(() => localStorage.clear())
afterEach(() => {
	cleanup()
	document.body.innerHTML = ''
	vi.restoreAllMocks()
})

test('the prerendered page is the whole guide: no version chosen, every step and the loader table visible', () => {
	const html = renderToString(
		<I18nProvider initialLocale="fr">
			<StaticRouter location="/installation">
				<InstallationPage />
			</StaticRouter>
		</I18nProvider>
	)
	document.body.innerHTML = html
	expect(document.querySelector('noscript')).toBeNull()
	expect([...document.querySelectorAll('h1, h2')].map(heading => heading.textContent)).toEqual([
		'Installer Minemories',
		'Le plus simple\u00a0: l’app CurseForge',
		'À quelle version de Minecraft joues-tu\u00a0?',
		'Quel loader de mods utilises-tu\u00a0?',
		'Installer le mod',
		'Connecte le jeu',
		'Ton premier souvenir',
		'Si ça coince',
	])
	expect(document.querySelectorAll('input:checked')).toHaveLength(0)
	const rows = [...document.querySelectorAll('.install-table tbody tr')].map(row => row.textContent)
	expect(rows).toEqual([
		'1.21.11Fabric, NeoForge, Forge',
		'1.21.1La plus testéeNeoForge, Fabric, Forge',
		'1.20.1Forge, Fabric',
		'1.19.2Forge, Fabric',
		'1.18.2Forge',
		'26.3ExpérimentaleFabric',
	])
	const page = document.body.textContent ?? ''
	expect(page).toContain('Choisis d’abord ta version.')
	expect(page).toContain('Tu joues sans mods\u00a0? Installe Fabric avec son installeur officiel, puis Fabric API')
	expect(page).toContain('M → tape le code → Se connecter')
	expect(page).toContain('M → Mes souvenirs → Envoyer ce souvenir.')
	expect(page).toContain('C:\\Users\\<toi>\\export')
	expect(page).toContain('Il est aussi dans Options (l’icône Minemories).')
	// The guide no longer points at the pause menu, which lost its Minemories button, nor at the export command.
	expect(page).not.toMatch(/pause|Échap|\/minemories/i)
	expect(page).not.toMatch(/validé|Most used|la plus utilisée|1\.18\.2 → 1\.21\.11/)
	expect(document.querySelector('a[href="https://www.curseforge.com/minecraft/mc-mods/minemories"]')).toBeTruthy()
	expect(document.querySelector('a[href="/gallery"]')?.textContent).toBe('Ouvrir ma galerie')
	// "Si ça coince": the three answers of the FAQ.
	expect(page).toContain('Le jeu plante au lancement\u00a0?')
	expect(page).toContain('Le code ne marche pas\u00a0?')
	expect(page).toContain('M ouvre autre chose\u00a0?')
	// Connecting comes before the first memory: pairing does not send memories taken earlier.
	expect(page.indexOf('Connecte le jeu')).toBeLessThan(page.indexOf('Ton premier souvenir'))
})

test('the version comes first, then only its loaders; the download button follows the choice', () => {
	mountGuide()
	expect(screen.queryByRole('group', { name: 'Quel loader de mods utilises-tu\u00a0?' })).toBeNull()
	expect(screen.getAllByRole('link', { name: 'Tous les téléchargements' })[0]?.getAttribute('href')).toBe('/downloads')
	fireEvent.click(version('1.21.11'))
	const loaders = within(screen.getByRole('group', { name: 'Quel loader de mods utilises-tu\u00a0?' }))
	expect(loaders.getAllByRole('radio').map(item => (item as HTMLInputElement).value)).toEqual([
		'fabric',
		'neoforge',
		'forge',
	])
	expect(loaders.getAllByRole('radio').some(item => (item as HTMLInputElement).checked)).toBe(false)
	expect(screen.queryByRole('link', { name: /^Télécharger pour Minecraft/ })).toBeNull()
	fireEvent.click(radio('Fabric'))
	expect(screen.getByRole('link', { name: 'Télécharger pour Minecraft 1.21.11 · Fabric' }).getAttribute('href')).toBe(
		latestDownloadUrl('1.21.11', 'fabric')
	)
	expect(screen.getByRole('link', { name: 'Fabric API' }).getAttribute('href')).toContain('g=1.21.11')
	expect(text()).not.toContain('Quilt')
	// The same loader is kept on another version that has it; 1.21.1 adds the Quilt note.
	fireEvent.click(version('1.21.1'))
	expect(radio('Fabric').checked).toBe(true)
	expect(text()).toContain('Quilt\u00a0: prends le JAR Fabric.')
	// A version with a single loader selects it; without Fabric, the no-mods line installs that loader.
	fireEvent.click(version('1.18.2'))
	expect(radio('Forge').checked).toBe(true)
	expect(text()).toContain('Tu joues sans mods\u00a0? Installe Forge avec son installeur officiel, puis Minemories.')
	expect(screen.getByRole('link', { name: 'son installeur officiel' }).getAttribute('href')).toBe(
		installerUrl(targetFor('1.18.2', 'forge') as LoaderTarget)
	)
	expect(screen.queryByRole('link', { name: 'Fabric API' })).toBeNull()
	expect(stored()).toEqual({ minecraft: '1.18.2', loader: 'forge' })
	fireEvent.click(version('1.20.1'))
	expect(stored()).toEqual({ minecraft: '1.20.1', loader: 'forge' })
	fireEvent.click(version('26.3'))
	expect(stored()).toEqual({ minecraft: '26.3', loader: 'fabric' })
	fireEvent.click(version('1.21.11'))
	expect(stored()).toEqual({ minecraft: '1.21.11', loader: 'fabric' })
})

test('a link from the download table picks the version and loader and keeps its query string', () => {
	mountGuide('/installation?minecraft=1.20.1&loader=fabric&src=downloads')
	expect(version('1.20.1').checked).toBe(true)
	expect(radio('Fabric').checked).toBe(true)
	expect(screen.getByTestId('where').textContent).toBe('/installation?minecraft=1.20.1&loader=fabric&src=downloads')
	expect(guideLink({ minecraft: '1.20.1', loader: 'fabric' })).toBe('/installation?minecraft=1.20.1&loader=fabric')
})

test('the choice is restored from this browser, and unusable storage leaves the guide working', () => {
	saveChoice({ minecraft: '1.19.2', loader: 'fabric' })
	mountGuide()
	expect(version('1.19.2').checked).toBe(true)
	expect(radio('Fabric').checked).toBe(true)
	cleanup()
	localStorage.setItem(choiceStorageKey, '{broken')
	expect(readChoice()).toBeNull()
	localStorage.setItem(choiceStorageKey, JSON.stringify({ minecraft: '1.20.4', loader: 'fabric' }))
	expect(readChoice()).toBeNull()
	localStorage.setItem(choiceStorageKey, JSON.stringify({ minecraft: '1.21.1', loader: 'quilt' }))
	expect(readChoice()).toEqual({ minecraft: '1.21.1', loader: '' })
	localStorage.setItem(choiceStorageKey, 'null')
	expect(readChoice()).toBeNull()
	vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('blocked')
	})
	mountGuide()
	fireEvent.click(version('1.21.1'))
	expect(version('1.21.1').checked).toBe(true)
})

test('the state helpers pick no default and install Fabric first for a player without mods', () => {
	expect(noChoice).toEqual({ minecraft: '', loader: '' })
	expect(chooseMinecraft(noChoice, '1.21.1')).toEqual({ minecraft: '1.21.1', loader: '' })
	expect(chooseMinecraft({ minecraft: '1.21.1', loader: 'neoforge' }, '1.20.1')).toEqual({
		minecraft: '1.20.1',
		loader: '',
	})
	expect(starterLoader('1.21.1')?.loader).toBe('fabric')
	expect(starterLoader('1.18.2')?.loader).toBe('forge')
	expect(starterLoader('1.20.4')).toBeNull()
	expect(targetFor('1.20.4', 'fabric')).toBeNull()
	expect(presetFromSearch(new URLSearchParams('minecraft=1.20.4&loader=fabric'))).toBeNull()
	expect(presetFromSearch(new URLSearchParams())).toBeNull()
	expect(versionBadge('1.21.1')).toBe('Most tested')
	expect(versionBadge('26.3')).toBe('Experimental')
	expect(versionBadge('1.21.11')).toBeNull()
})

test('in English the guide quotes the mod’s own labels and the default folders', () => {
	renderUi(
		<I18nProvider initialLocale="en">
			<MemoryRouter>
				<InstallationPage />
			</MemoryRouter>
		</I18nProvider>
	)
	expect(text()).not.toMatch(/[àâçéèêëîïôùûü]/i)
	expect(text()).toContain('Press M → Take a memory. It then goes to your gallery on its own.')
	expect(text()).toContain('Memories taken before you connected? M → My memories → Send this memory.')
	expect(text()).toContain('%APPDATA%\\.minecraft\\mods')
	expect(text()).toContain('/Users/<you>/export')
	expect(screen.getByRole('img', { name: 'The Minemories menu with the Take a memory button' })).toBeTruthy()
})
