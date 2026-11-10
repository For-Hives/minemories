// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, StaticRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { modIndexFixture } from '../testing/mod-index'
import {
	compareMinecraft,
	downloadFor,
	isExperimentalMinecraft,
	loaderTargets,
	minecraftVersions,
	parseIndex,
	selectLatestRelease,
	supportedMinecraft,
} from './mod-releases'
import { ReleasesPage } from './ReleasesPage'
import { releases as history } from './release-history'

const serve = (data: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)))
function mount(locale: 'fr' | 'en' = 'fr') {
	return render(
		<I18nProvider initialLocale={locale}>
			<MemoryRouter initialEntries={['/versions']}>
				<ReleasesPage />
			</MemoryRouter>
		</I18nProvider>
	)
}
afterEach(() => {
	cleanup()
	document.body.innerHTML = ''
	vi.unstubAllGlobals()
})

test('the notes of mod/release-notes are bundled newest first', () => {
	expect(history.map(release => release.version)).toEqual([
		'0.37.0-beta.1',
		'0.36.5-beta.1',
		'0.36.4-beta.1',
		'0.36.1-beta.1',
	])
})

test('the prerendered page says what changes, in player words, without waiting for the API', () => {
	document.body.innerHTML = renderToString(
		<I18nProvider initialLocale="fr">
			<StaticRouter location="/versions">
				<ReleasesPage />
			</StaticRouter>
		</I18nProvider>
	)
	const latest = document.getElementById('v0.37.0-beta.1') as HTMLElement
	expect(latest.querySelector('h2')?.textContent).toBe('Minemories 0.37.0-beta.1')
	expect(latest.textContent).toContain('Dernière version')
	expect(latest.querySelector('h3')?.textContent).toBe('Ce qui change pour toi')
	const notes = [...latest.querySelectorAll('li')].map(item => item.textContent)
	expect(notes).toHaveLength(3)
	expect(notes[0]).toMatch(/^Nouveau : Minemories pour Minecraft 26\.3 sur Fabric/)
	expect(notes[2]).toMatch(/^Corrigé : sur Minecraft 26\.3, les textures gardent leurs vraies couleurs/)
	expect(latest.querySelector('a')?.getAttribute('href')).toBe('/downloads')
	expect(latest.querySelector('a')?.textContent).toBe('Télécharger')
	const older = [...document.querySelectorAll('.mm-release-older li')]
	expect(older.map(item => item.id)).toEqual(['v0.36.5-beta.1', 'v0.36.4-beta.1', 'v0.36.1-beta.1'])
	expect(older[2]?.textContent).toContain('Corrigé : « Où trouver mon code ? » ouvre de nouveau la galerie')
	expect(document.querySelector('[lang="en"]')).toBeNull()
	expect(document.querySelector('noscript')).toBeNull()
	expect(document.querySelector('time')).toBeNull()
	// One note per older version: the 0.36.1 line naming a version range never reaches the page.
	expect(document.body.textContent).not.toMatch(/1\.18\.2 (?:to|à) 1\.21\.11/)
})

test('dates come from the downloads index once loaded, for the versions it still keeps', async () => {
	serve(
		modIndexFixture({
			'neoforge-mc1.21.1': [
				{ version: '0.37.0-beta.1', builtAt: '2026-11-09T10:00:00Z' },
				{ version: '0.36.5-beta.1', builtAt: '2026-11-04T10:00:00Z' },
			],
		})
	)
	mount()
	const date = await screen.findByText('9 novembre 2026')
	expect(date.getAttribute('dateTime')).toBe('2026-11-09T10:00:00.000Z')
	expect(screen.getByText('4 novembre 2026')).toBeTruthy()
	expect(document.querySelectorAll('time')).toHaveLength(2)
})

test('in English the notes read as written, with no other language marked', () => {
	serve(modIndexFixture({}))
	mount('en')
	const latest = within(document.getElementById('v0.37.0-beta.1') as HTMLElement)
	expect(latest.getByText(/^New: End portals and End gateways are saved/)).toBeTruthy()
	expect(screen.getByRole('heading', { name: 'Previous versions' })).toBeTruthy()
	expect(document.querySelector('[lang="en"]')).toBeNull()
})

test('parsing groups loader JARs per version, shows only the retained versions and ignores unknown targets', () => {
	const index = modIndexFixture({
		'neoforge-mc1.21.1': ['0.5.0', '0.4.0', '0.3.0', '0.2.0'],
		'fabric-mc1.21.1': ['0.5.0'],
		'quilt-mc1.21.1': ['9.9.9'],
	})
	const releases = parseIndex(index)
	expect(releases.map(release => release.version)).toEqual(['0.5.0', '0.4.0', '0.3.0'])
	expect(releases[0]?.downloads.map(download => download.target.id)).toEqual(['neoforge-mc1.21.1', 'fabric-mc1.21.1'])
	expect(selectLatestRelease(index)?.version).toBe('0.5.0')
	expect(selectLatestRelease(modIndexFixture({}))).toBeNull()
	expect(() => parseIndex({ schema: 1 })).toThrow('Invalid downloads index')
	const [odd] = parseIndex(
		modIndexFixture({ 'neoforge-mc1.21.1': [{ version: '1.0.0', builtAt: 'not a date', commit: 'x y z' }] })
	)
	expect(odd).toMatchObject({ published: 0, commitUrl: null, prerelease: false })
})

test('release matrix follows the enabled targets of mod/targets.json', () => {
	expect(loaderTargets.map(target => [target.id, target.loaderVersion])).toEqual([
		['neoforge-mc1.21.1', '21.1.248'],
		['fabric-mc1.21.1', '0.19.5'],
		['forge-mc1.21.1', '52.1.19'],
		['fabric-mc1.21.11', '0.20.1'],
		['neoforge-mc1.21.11', '21.11.48'],
		['forge-mc1.21.11', '61.2.5'],
		['forge-mc1.20.1', '47.4.26'],
		['fabric-mc1.20.1', '0.19.5'],
		['forge-mc1.19.2', '43.5.2'],
		['fabric-mc1.19.2', '0.20.1'],
		['forge-mc1.18.2', '40.3.12'],
		['fabric-mc26.3', '0.19.5'],
	])
	expect(loaderTargets.find(target => target.loader === 'fabric')?.fabricApi).toBe('0.116.17+1.21.1')
	expect(minecraftVersions()).toEqual(['26.3', '1.21.11', '1.21.1', '1.20.1', '1.19.2', '1.18.2'])
	expect(isExperimentalMinecraft('26.3')).toBe(true)
	expect(isExperimentalMinecraft('1.21.1')).toBe(false)
	expect(isExperimentalMinecraft('1.20.4')).toBe(false)
	expect(supportedMinecraft()).toEqual({ versions: '1.18.2, 1.19.2, 1.20.1, 1.21.1, 1.21.11', experimental: '26.3' })
	expect(loaderTargets.find(target => target.loader === 'forge')?.fabricApi).toBeNull()
})

test('downloadFor selects by loader and optionally by Minecraft version', () => {
	const [release] = parseIndex(modIndexFixture({ 'fabric-mc1.21.1': ['0.3.0'], 'fabric-mc1.19.2': ['0.3.0'] }))
	if (!release) throw new Error('release expected')
	expect(downloadFor(release, 'fabric')?.target.minecraft).toBe('1.21.1')
	expect(downloadFor(release, 'fabric', '1.19.2')?.target.id).toBe('fabric-mc1.19.2')
	expect(downloadFor(release, 'forge')).toBeNull()
	expect(downloadFor(release, 'fabric', '1.8')).toBeNull()
})

test('Minecraft versions compare from the major number, so 26.3 is the newest and a missing part counts as zero', () => {
	expect(['1.21.1', '26.3', '1.9', '1.21.11', '1.21'].sort(compareMinecraft)).toEqual([
		'1.9',
		'1.21',
		'1.21.1',
		'1.21.11',
		'26.3',
	])
	expect(compareMinecraft('1.21', '1.21.0')).toBe(0)
	const validated = loaderTargets.filter(target => target.validated)
	expect(supportedMinecraft(validated)).toEqual({
		versions: '1.18.2, 1.19.2, 1.20.1, 1.21.1, 1.21.11',
		experimental: '',
	})
})
