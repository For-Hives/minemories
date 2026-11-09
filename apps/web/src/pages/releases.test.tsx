// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { modIndexFixture } from '../testing/mod-index'
import {
	compareMinecraft,
	downloadFor,
	downloadUrl,
	isExperimentalMinecraft,
	loaderTargets,
	minecraftVersions,
	parseIndex,
	supportedMinecraft,
} from './mod-releases'
import { ReleasesPage } from './ReleasesPage'

const digestChar: Record<string, string> = { neoforge: 'a', fabric: 'b', forge: 'c' }
const serve = (data: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)))
function mount(path = '/versions', locale: 'fr' | 'en' = 'fr') {
	return render(
		<I18nProvider initialLocale={locale}>
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path="/versions" element={<ReleasesPage />} />
					<Route path="/changelog" element={<ReleasesPage changelog />} />
					<Route path="/installation" element={<h1>Guide d’installation</h1>} />
				</Routes>
			</MemoryRouter>
		</I18nProvider>
	)
}
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
	vi.useRealTimers()
	localStorage.clear()
})

test('lists the retained versions by date with API downloads, beta status, date, size and checksum', async () => {
	serve(
		modIndexFixture({
			'neoforge-mc1.21.1': [
				{ version: '0.2.1-beta.1', builtAt: '2026-10-15T10:00:00Z' },
				{ version: '0.2.0-beta.1', builtAt: '2026-10-14T10:00:00Z' },
				{ version: '0.1.0-beta.1', builtAt: '2026-10-13T10:00:00Z' },
				{ version: '0.0.9', builtAt: '2026-10-12T10:00:00Z' },
			],
		})
	)
	mount()
	expect(screen.getByRole('status').textContent).toContain('Chargement des versions')
	const articles = await screen.findAllByRole('article', { name: /Minemories / })
	expect(articles.map(article => article.id)).toEqual(['v0.2.1-beta.1', 'v0.2.0-beta.1', 'v0.1.0-beta.1'])
	expect(within(articles[0] as HTMLElement).getByText('Dernière version')).toBeTruthy()
	expect(screen.getAllByText('Préversion')).toHaveLength(3)
	expect(screen.getByText('15 octobre 2026').getAttribute('dateTime')).toBe('2026-10-15T10:00:00.000Z')
	expect(screen.getByRole('link', { name: 'Télécharger le JAR NeoForge 0.2.1-beta.1' }).getAttribute('href')).toBe(
		downloadUrl('neoforge-mc1.21.1', '0.2.1-beta.1')
	)
	expect(screen.getAllByText('0,29 MiB')).toHaveLength(3)
	expect(screen.getAllByText('a'.repeat(64))).toHaveLength(3)
	expect(screen.queryByRole('button', { name: 'Charger les versions précédentes' })).toBeNull()
	expect(document.body.innerHTML).not.toContain('api.github.com')
	fireEvent.click(screen.getByRole('link', { name: 'Guide d’installation ↗' }))
	expect(screen.getByRole('heading', { name: 'Guide d’installation' })).toBeTruthy()
})

test('version links open the changelog at the selected older version, with its build commit', async () => {
	serve(
		modIndexFixture({
			'neoforge-mc1.21.1': [
				{ version: '0.2.0', commit: 'abc1234' },
				{ version: '0.1.0', commit: 'def5678' },
			],
		})
	)
	mount()
	const links = await screen.findAllByRole('link', { name: 'Voir les nouveautés →' })
	fireEvent.click(links[1] as HTMLElement)
	await screen.findByRole('heading', { name: 'Les nouveautés' })
	await screen.findByRole('article', { name: 'Minemories 0.1.0' })
	const commits = screen.getAllByRole('link', { name: 'Voir le commit de cette version sur GitHub' })
	expect(commits.map(link => link.getAttribute('href'))).toEqual([
		'https://github.com/For-Hives/minemories/commit/abc1234',
		'https://github.com/For-Hives/minemories/commit/def5678',
	])
})

test('the version named in the URL is scrolled to once', async () => {
	const scroll = vi.fn()
	Element.prototype.scrollIntoView = scroll
	serve(modIndexFixture({ 'neoforge-mc1.21.1': ['0.3.0', '0.2.0', '0.1.0'] }))
	mount('/changelog#v0.2.0')
	await screen.findByRole('article', { name: 'Minemories 0.2.0' })
	expect(scroll).toHaveBeenCalledTimes(1)
})

test('an unknown fragment does not scroll', async () => {
	const scroll = vi.fn()
	Element.prototype.scrollIntoView = scroll
	serve(modIndexFixture({ 'neoforge-mc1.21.1': ['0.1.0'] }))
	mount('/changelog#v9.9.9')
	await screen.findByRole('article', { name: 'Minemories 0.1.0' })
	expect(scroll).not.toHaveBeenCalled()
})

test('a stable version is not a prerelease and an unusable commit shows no link', async () => {
	serve(modIndexFixture({ 'neoforge-mc1.21.1': [{ version: '1.0.0', commit: 'not a hash' }] }))
	mount('/changelog')
	await screen.findByText('Version publiée')
	expect(screen.queryByText('Préversion')).toBeNull()
	expect(screen.queryByRole('link', { name: 'Voir le commit de cette version sur GitHub' })).toBeNull()
})

test.each([403, 500])('HTTP %s provides a retry', async status => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(new Response(null, { status }))
		.mockResolvedValueOnce(Response.json(modIndexFixture({ 'neoforge-mc1.21.1': ['0.1.0'] })))
	vi.stubGlobal('fetch', fetchMock)
	mount()
	await screen.findByRole('alert')
	expect(screen.queryByRole('link', { name: /releases sur GitHub/ })).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
	await screen.findByRole('link', { name: /Télécharger le JAR/ })
	expect(screen.queryByRole('alert')).toBeNull()
})

test('an empty index never invents a version', async () => {
	serve(modIndexFixture({}))
	mount()
	await screen.findByText('Aucune version n’est publiée pour le moment.')
	expect(screen.queryByRole('link', { name: /Télécharger le JAR/ })).toBeNull()
})

test.each([null, { message: 'oops' }, { schema: 1, generatedAt: 'x' }])(
	'malformed API responses are errors, not empty successes',
	async data => {
		serve(data)
		mount()
		await screen.findByRole('alert')
		expect(screen.queryByText('Aucune version n’est publiée pour le moment.')).toBeNull()
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
	await act(async () => {
		await vi.advanceTimersByTimeAsync(15000)
	})
	expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true)
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
	})
	expect(screen.getByRole('link', { name: /Télécharger le JAR/ })).toBeTruthy()
	await act(async () => {
		finish(Response.json(modIndexFixture({ 'neoforge-mc1.21.1': ['9.9.9'] })))
	})
	expect(screen.queryByText('Minemories 9.9.9')).toBeNull()
	view.unmount()
	expect(fetchMock.mock.calls[1]?.[1].signal.aborted).toBe(true)
})

test('English interface localizes dates and wording', async () => {
	serve(modIndexFixture({ 'neoforge-mc1.21.1': [{ version: '0.2.1-beta.1', builtAt: '2026-10-15T10:00:00Z' }] }))
	mount('/changelog', 'en')
	await screen.findByRole('link', { name: /Download NeoForge JAR/ })
	expect(screen.getByText('Latest version')).toBeTruthy()
	expect(screen.getByText('October 15, 2026')).toBeTruthy()
	expect(screen.getByText(/Direct downloads from Minemories/)).toBeTruthy()
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

test('a multi-loader version lists every loader JAR with its validated versions, size and checksum', async () => {
	serve(modIndexFixture({ 'neoforge-mc1.21.1': ['0.3.0'], 'fabric-mc1.21.1': ['0.3.0'], 'forge-mc1.21.1': ['0.3.0'] }))
	mount('/versions', 'en')
	const article = await screen.findByRole('article', { name: 'Minemories 0.3.0' })
	const view = within(article)
	for (const [name, id, loader] of [
		['NeoForge', 'neoforge-mc1.21.1', 'neoforge'],
		['Fabric', 'fabric-mc1.21.1', 'fabric'],
		['Forge', 'forge-mc1.21.1', 'forge'],
	] as const) {
		expect(view.getByRole('link', { name: `Download ${name} JAR 0.3.0` }).getAttribute('href')).toBe(
			downloadUrl(id, '0.3.0')
		)
		expect(view.getByText((digestChar[loader] as string).repeat(64))).toBeTruthy()
	}
	expect(view.getByText('Minecraft Java 1.21.1 · NeoForge 21.1.248 · Java 21')).toBeTruthy()
	expect(
		view.getByText('Minecraft Java 1.21.1 · Fabric Loader 0.19.5 + Fabric API 0.116.17+1.21.1 · Java 21')
	).toBeTruthy()
	expect(view.getByText('Minecraft Java 1.21.1 · Forge 52.1.19 · Java 21')).toBeTruthy()
	expect(view.getByText('Install Fabric API separately. This same JAR is also tested under Quilt 0.30.1.')).toBeTruthy()
	expect(view.getAllByText('0.29 MiB')).toHaveLength(3)
	expect(view.queryByRole('link', { name: 'Download checksum' })).toBeNull()
	expect(
		screen.getByText(
			/the JAR matching your Minecraft version and your loader: NeoForge, Fabric \(also used under Quilt\) or Forge/
		)
	).toBeTruthy()
})

test('a version missing some loaders only lists the JARs it actually ships', async () => {
	serve(modIndexFixture({ 'fabric-mc1.21.1': ['0.3.0'] }))
	mount('/versions', 'en')
	await screen.findByRole('link', { name: 'Download Fabric JAR 0.3.0' })
	expect(screen.queryByRole('link', { name: /Download NeoForge JAR/ })).toBeNull()
	expect(screen.queryByRole('link', { name: /Download Forge JAR/ })).toBeNull()
})

test('several Minecraft versions of the same loader get distinct entries', async () => {
	serve(modIndexFixture({ 'fabric-mc1.21.1': ['0.3.0'], 'fabric-mc1.19.2': ['0.3.0'] }))
	mount('/versions', 'en')
	const article = await screen.findByRole('article', { name: 'Minemories 0.3.0' })
	expect(within(article).getAllByRole('link', { name: 'Download Fabric JAR 0.3.0' })).toHaveLength(2)
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
