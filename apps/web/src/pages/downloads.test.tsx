// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderUi, screen, waitFor, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Route, Routes, StaticRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { modIndexFixture } from '../testing/mod-index'
import { DownloadsPage } from './DownloadsPage'
import { downloadGrid } from './downloads-grid'
import { InstallationPage } from './InstallationPage'
import { downloadUrl, latestDownloadUrl, listedMinecraft, loaderTargets, parseIndex } from './mod-releases'

function render(ui: Parameters<typeof renderUi>[0]) {
	return renderUi(ui, { wrapper: I18nProvider })
}
const serve = (data: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)))
function mount() {
	return render(
		<MemoryRouter initialEntries={['/downloads']}>
			<Routes>
				<Route path="/downloads" element={<DownloadsPage />} />
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
	document.body.innerHTML = ''
	localStorage.clear()
	vi.unstubAllGlobals()
})

test('the grid lists every Minecraft version, the experimental one last, with its Java version', () => {
	const grid = downloadGrid(parseIndex(modIndexFixture(published)))
	expect(grid.loaders.map(item => item.name)).toEqual(['NeoForge', 'Fabric', 'Forge'])
	expect(grid.rows.map(row => row.minecraft)).toEqual(listedMinecraft())
	expect(grid.rows.map(row => [row.minecraft, row.java])).toEqual([
		['1.21.11', '21'],
		['1.21.1', '21'],
		['1.20.1', '17'],
		['1.19.2', '17'],
		['1.18.2', '17'],
		['26.3', '25'],
	])
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

test('the prerendered table already links every published JAR, with the Java column and no noscript', () => {
	document.body.innerHTML = renderToString(
		<I18nProvider initialLocale="fr">
			<StaticRouter location="/downloads">
				<DownloadsPage />
			</StaticRouter>
		</I18nProvider>
	)
	expect(document.querySelector('noscript')).toBeNull()
	const page = document.body.textContent ?? ''
	expect(page).not.toContain('Vérification…')
	expect(page).not.toMatch(/validé|Most used|la plus utilisée/i)
	const links = [...document.querySelectorAll('.mm-dl-button')].map(link => link.getAttribute('href'))
	expect(links).toHaveLength(loaderTargets.length)
	expect(links).toContain(latestDownloadUrl('26.3', 'fabric'))
	const last = [...document.querySelectorAll('tbody tr')].at(-1) as HTMLElement
	expect(last.querySelector('th')?.textContent).toBe('26.3Expérimentale')
	expect(last.querySelector('.mm-dl-java')?.textContent).toBe('25')
	expect(last.textContent).toContain('Fabric 0.19.5')
	expect(page).toContain('Ça marche sur Bedrock, console ou téléphone ?')
	expect(page).toContain('1.12.2 et 1.16.5 : pas encore.')
	expect(page).toContain('son empreinte SHA-256 doit être celle affichée ici')
})

test('once the index is read, cells name the exact version, size and checksum; the others say why they are empty', async () => {
	serve(modIndexFixture(published))
	mount()
	const table = screen.getByRole('table', {
		name: 'Téléchargements de Minemories par version de Minecraft et loader de mods',
	})
	expect(
		within(table)
			.getAllByRole('columnheader')
			.map(header => header.textContent)
	).toEqual(['Minecraft', 'Java', 'NeoForge', 'Fabric+ Fabric API', 'Forge'])
	const link = await within(table).findByRole('link', {
		name: 'Télécharger Minemories pour Minecraft 1.21.1 avec NeoForge (0.2.0)',
	})
	expect(link.getAttribute('href')).toBe(downloadUrl('neoforge-mc1.21.1', '0.2.0'))
	expect(link.textContent).toBe('Télécharger')
	const row = link.closest('tr') as HTMLElement
	expect(within(row).getByRole('rowheader').textContent).toBe('1.21.1La plus testée')
	expect(screen.getByText('MINEMORIES · TÉLÉCHARGEMENTS')).toBeTruthy()
	expect(within(row).getAllByText(/0\.2\.0 · 0,29 MiB/)).toHaveLength(2)
	expect(within(row).getByText('a'.repeat(64))).toBeTruthy()
	expect(within(row).getAllByText('SHA-256')[0]?.closest('details')).toBeTruthy()
	expect(within(row).getByText('Pas encore publié')).toBeTruthy()
	const recent = screen.getByRole('rowheader', { name: /1\.21\.11/ }).closest('tr') as HTMLElement
	expect(within(recent).getByRole('rowheader').textContent).toBe('1.21.11')
	expect(within(recent).getByText(/0\.3\.0-beta\.1 · 5 MiB/)).toBeTruthy()
	expect(within(recent).getAllByText('Pas encore publié')).toHaveLength(2)
	const old = screen.getByRole('rowheader', { name: /1\.18\.2/ }).closest('tr') as HTMLElement
	expect(within(old).getAllByText('Non disponible pour cette version')).toHaveLength(2)
	expect(screen.getByText(/Installe Fabric API à part/).textContent).toContain('Quilt 0.30.1')
	expect(screen.getByRole('link', { name: 'Les nouveautés de Minemories' }).getAttribute('href')).toBe('/versions')
	expect(screen.getByRole('link', { name: 'Pas sûr ? Le guide te pose deux questions.' }).getAttribute('href')).toBe(
		'/installation'
	)
	// The "which versions?" answer links to /downloads: on /downloads itself that link is left out.
	expect(screen.getByRole('heading', { name: 'Quelles versions ?' })).toBeTruthy()
	expect(screen.queryByRole('link', { name: 'Téléchargements →' })).toBeNull()
})

test('every published cell opens the guide with its version and loader already picked', async () => {
	serve(modIndexFixture(published))
	mount()
	const recent = screen.getByRole('rowheader', { name: /1\.21\.11/ }).closest('tr') as HTMLElement
	await within(recent).findByRole('link', { name: /\(0\.3\.0-beta\.1\)/ })
	const guided = within(recent).getByRole('link', { name: 'Installation guidée' })
	expect(guided.getAttribute('href')).toBe('/installation?minecraft=1.21.11&loader=fabric')
	fireEvent.click(guided)
	await screen.findByRole('heading', { name: 'Installer Minemories' })
	expect(screen.getByRole('radio', { name: /^1\.21\.11/ })).toHaveProperty('checked', true)
	expect(screen.getByRole('radio', { name: 'Fabric' })).toHaveProperty('checked', true)
})

test('while the index loads or fails, the cells keep the newest-JAR links, and a failure offers a retry', async () => {
	vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)))
	mount()
	expect(screen.getByRole('table').closest('div')?.getAttribute('aria-busy')).toBe('true')
	expect(
		screen
			.getByRole('link', { name: 'Télécharger Minemories pour Minecraft 1.21.1 avec NeoForge' })
			.getAttribute('href')
	).toBe(latestDownloadUrl('1.21.1', 'neoforge'))
	cleanup()
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))
	mount()
	expect(await screen.findByRole('alert')).toBeTruthy()
	expect(screen.getAllByRole('link', { name: /^Télécharger Minemories pour Minecraft/ })).toHaveLength(
		loaderTargets.length
	)
	serve(modIndexFixture(published))
	fireEvent.click(screen.getByRole('button', { name: 'Réessayer le téléchargement' }))
	await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
	expect(
		await screen.findByRole('link', { name: 'Télécharger Minemories pour Minecraft 1.21.1 avec NeoForge (0.2.0)' })
	).toBeTruthy()
})

test.each([403, 500])('HTTP %s offers a retry', async status => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status }))
			.mockResolvedValueOnce(Response.json(modIndexFixture({ 'neoforge-mc1.21.1': ['0.1.0'] })))
	)
	mount()
	await screen.findByRole('alert')
	fireEvent.click(screen.getByRole('button', { name: 'Réessayer le téléchargement' }))
	await screen.findByRole('link', { name: /avec NeoForge \(0\.1\.0\)$/ })
	expect(screen.queryByRole('alert')).toBeNull()
})

test.each([null, { message: 'oops' }, { schema: 1, generatedAt: 'x' }])(
	'malformed API responses are errors, not empty successes',
	async data => {
		serve(data)
		mount()
		await screen.findByRole('alert')
		expect(screen.queryByText('Pas encore publié')).toBeNull()
	}
)

test('a timed out response cannot overwrite a successful retry, and unmount aborts requests', async () => {
	vi.useFakeTimers()
	let finish: (response: Response) => void = () => undefined
	const fetchMock = vi
		.fn()
		.mockImplementationOnce(
			() =>
				new Promise<Response>(resolve => {
					finish = resolve
				})
		)
		.mockResolvedValueOnce(Response.json(modIndexFixture({ 'neoforge-mc1.21.1': ['0.1.0'] })))
	vi.stubGlobal('fetch', fetchMock)
	const view = mount()
	try {
		await act(async () => {
			await vi.advanceTimersByTimeAsync(15000)
		})
		expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true)
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Réessayer le téléchargement' }))
		})
		expect(screen.getByRole('link', { name: /avec NeoForge \(0\.1\.0\)$/ })).toBeTruthy()
		await act(async () => {
			finish(Response.json(modIndexFixture({ 'neoforge-mc1.21.1': ['9.9.9'] })))
		})
		expect(screen.queryByRole('link', { name: /\(9\.9\.9\)$/ })).toBeNull()
		view.unmount()
		expect(fetchMock.mock.calls[1]?.[1].signal.aborted).toBe(true)
	} finally {
		vi.useRealTimers()
	}
})
