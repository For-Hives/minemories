// @vitest-environment jsdom
import { cleanup, fireEvent, render as renderUi, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { modIndexFixture } from '../testing/mod-index'
import { DownloadsPage } from './DownloadsPage'
import { downloadGrid } from './downloads-grid'
import { InstallationPage } from './InstallationPage'
import { downloadUrl, loaderTargets, minecraftVersions, parseIndex } from './mod-releases'

function render(ui: Parameters<typeof renderUi>[0]) {
	return renderUi(ui, { wrapper: I18nProvider })
}
const serve = (data: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)))
function mount() {
	return render(
		<MemoryRouter initialEntries={['/telechargements']}>
			<Routes>
				<Route path="/telechargements" element={<DownloadsPage />} />
				<Route path="/installation" element={<InstallationPage />} />
				<Route path="/versions" element={<p>Versions page</p>} />
			</Routes>
		</MemoryRouter>
	)
}
const published = {
	'neoforge-mc1.21.1': ['0.2.0', '0.1.0'],
	'fabric-mc1.21.1': ['0.2.0'],
	'fabric-mc1.21.11': [{ version: '0.3.0-beta.1', bytes: 5 * 1048576 }],
}

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.unstubAllGlobals()
})

test('the grid lists every Minecraft version newest first against NeoForge, Fabric and Forge', () => {
	const grid = downloadGrid(parseIndex(modIndexFixture(published)))
	expect(grid.loaders.map(item => item.name)).toEqual(['NeoForge', 'Fabric', 'Forge'])
	expect(grid.rows.map(row => row.minecraft)).toEqual(minecraftVersions())
	expect(grid.rows[0]?.minecraft).toBe('1.21.11')
	const row = (version: string) => grid.rows.find(item => item.minecraft === version)?.cells ?? []
	expect(row('1.21.1').map(cell => cell.download?.url)).toEqual([
		downloadUrl('neoforge-mc1.21.1', '0.2.0'),
		downloadUrl('fabric-mc1.21.1', '0.2.0'),
		undefined,
	])
	expect(row('1.21.1')[2]?.target?.id).toBe('forge-mc1.21.1')
	expect(row('1.21.1')[2]?.download).toBeNull()
	expect(row('1.21.11')[1]?.release?.version).toBe('0.3.0-beta.1')
	expect(row('1.18.2')[1]?.target).toBeNull()
	expect(
		downloadGrid(
			[],
			loaderTargets.filter(target => target.loader === 'forge')
		).loaders
	).toHaveLength(1)
})

test('published cells offer the download, size and checksum; the others say why they are grayed', async () => {
	serve(modIndexFixture(published))
	mount()
	const table = await screen.findByRole('table', {
		name: 'Téléchargements de Minemories par version de Minecraft et loader de mods',
	})
	expect(
		within(table)
			.getAllByRole('columnheader')
			.map(header => header.textContent)
	).toEqual(['Minecraft', 'NeoForge', 'Fabric+ Fabric API', 'Forge'])
	const link = await within(table).findByRole('link', {
		name: 'Télécharger Minemories 0.2.0 pour Minecraft 1.21.1 avec NeoForge',
	})
	expect(link.getAttribute('href')).toBe(downloadUrl('neoforge-mc1.21.1', '0.2.0'))
	expect(link.textContent).toBe('Télécharge')
	const row = link.closest('tr') as HTMLElement
	expect(within(row).getByRole('rowheader').textContent).toContain('1.21.1')
	expect(within(row).getByRole('rowheader').textContent).toContain('Validée en jeu')
	expect(within(row).getAllByText(/0\.2\.0 · 0,29 MiB/)).toHaveLength(2)
	expect(within(row).getByText('a'.repeat(64))).toBeTruthy()
	expect(within(row).getAllByText('SHA-256')[0]?.closest('details')).toBeTruthy()
	expect(within(row).getByText('Pas encore publié')).toBeTruthy()
	const recent = screen.getByRole('rowheader', { name: /1\.21\.11/ }).closest('tr') as HTMLElement
	expect(within(recent).getByText('La plus utilisée')).toBeTruthy()
	expect(within(recent).getByText(/0\.3\.0-beta\.1 · 5 MiB/)).toBeTruthy()
	expect(within(recent).getAllByText('Pas encore publié')).toHaveLength(2)
	const old = screen.getByRole('rowheader', { name: /1\.18\.2/ }).closest('tr') as HTMLElement
	expect(within(old).getAllByText('Non disponible pour cette version')).toHaveLength(2)
	expect(screen.getByText(/Installe Fabric API à part/).textContent).toContain('Quilt 0.30.1')
	expect(screen.getByRole('link', { name: 'Versions précédentes et nouveautés' }).getAttribute('href')).toBe(
		'/versions'
	)
})

test('every published cell links to the guided installation with its version and loader pre-selected', async () => {
	serve(modIndexFixture(published))
	mount()
	const recent = (await screen.findByRole('rowheader', { name: /1\.21\.11/ })).closest('tr') as HTMLElement
	await within(recent).findByRole('link', { name: /Télécharger Minemories 0\.3\.0-beta\.1/ })
	const guided = within(recent).getByRole('link', { name: 'Installation guidée' })
	expect(guided.getAttribute('href')).toBe('/installation?minecraft=1.21.11&loader=fabric')
	fireEvent.click(guided)
	expect(await screen.findByText('Étape 1 sur 6')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
	expect(screen.getAllByRole('link', { name: 'l’installateur Fabric 0.20.1' }).length).toBeGreaterThan(0)
})

test('while the index loads the cells say so, and a failure offers a retry instead of empty promises', async () => {
	const fetchMock = vi.fn().mockReturnValue(new Promise(() => undefined))
	vi.stubGlobal('fetch', fetchMock)
	mount()
	expect(screen.getAllByText('Vérification…').length).toBeGreaterThan(0)
	expect(screen.getByRole('table').closest('div')?.getAttribute('aria-busy')).toBe('true')
	cleanup()
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))
	mount()
	expect(await screen.findByRole('alert')).toBeTruthy()
	expect(screen.getAllByText('Indisponible pour le moment').length).toBeGreaterThan(0)
	serve(modIndexFixture(published))
	fireEvent.click(screen.getByRole('button', { name: 'Réessayer le téléchargement' }))
	await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
	expect(
		await screen.findByRole('link', { name: /Télécharger Minemories 0\.2\.0 pour Minecraft 1\.21\.1 avec NeoForge/ })
	).toBeTruthy()
})
