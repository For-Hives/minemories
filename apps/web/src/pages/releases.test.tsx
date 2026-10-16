// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { jarName, parseReleases } from './mod-releases'
import { ReleasesPage } from './ReleasesPage'

function release(version = '0.2.1-beta.1', published = '2026-10-15T10:00:00Z') {
	const prefix = `https://github.com/For-Hives/minemories/releases/download/mod-v${version}/`
	return {
		tag_name: `mod-v${version}`,
		draft: false,
		prerelease: true,
		published_at: published,
		body: '### Corrections\n\n- **Capture** plus rapide. [Détails](https://github.com/For-Hives/minemories/issues/61)',
		assets: [
			{ name: jarName, browser_download_url: prefix + jarName, size: 300220, digest: `sha256:${'a'.repeat(64)}` },
			{ name: `${jarName}.sha256`, browser_download_url: `${prefix}${jarName}.sha256` },
		],
	}
}
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

test('lists real compatible releases by date with downloads, beta status, date, size and checksums', async () => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValue(
				Response.json([
					release('0.1.0', '2026-10-14T10:00:00Z'),
					release(),
					{ ...release('8.0.0'), draft: true },
					{ ...release('9.0.0'), assets: [] },
				])
			)
	)
	mount()
	expect(screen.getByRole('status').textContent).toContain('Chargement des versions')
	const articles = await screen.findAllByRole('article', { name: /Minemories / })
	expect(articles).toHaveLength(2)
	expect(articles[0]?.id).toBe('v0.2.1-beta.1')
	expect(within(articles[0] as HTMLElement).getByText('Dernière version')).toBeTruthy()
	expect(screen.getAllByText('Préversion')).toHaveLength(2)
	expect(screen.getByText('15 octobre 2026').getAttribute('dateTime')).toBe('2026-10-15T10:00:00.000Z')
	expect(screen.getByRole('link', { name: 'Télécharger le JAR 0.2.1-beta.1' }).getAttribute('href')).toBe(
		release().assets[0]?.browser_download_url
	)
	expect(screen.getAllByText('0,29 MiB')).toHaveLength(2)
	expect(screen.getAllByText('a'.repeat(64))).toHaveLength(2)
	expect(screen.getAllByRole('link', { name: 'Télécharger l’empreinte' })).toHaveLength(2)
	expect(screen.queryByRole('button', { name: 'Charger les versions précédentes' })).toBeNull()
	fireEvent.click(screen.getByRole('link', { name: 'Guide d’installation ↗' }))
	expect(screen.getByRole('heading', { name: 'Guide d’installation' })).toBeTruthy()
})

test('version links open the automatic changelog at the selected older release', async () => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockImplementation(() => Promise.resolve(Response.json([release(), release('0.1.0', '2026-10-14T10:00:00Z')])))
	)
	mount()
	const links = await screen.findAllByRole('link', { name: 'Voir les nouveautés →' })
	fireEvent.click(links[1] as HTMLElement)
	await screen.findByRole('heading', { name: 'Les nouveautés' })
	await screen.findByRole('article', { name: 'Minemories 0.1.0' })
	expect(document.querySelector('#v0\\.1\\.0 details.mm-release-notes')?.hasAttribute('open')).toBe(true)
	expect(screen.getAllByText('Capture', { selector: 'strong' })).toHaveLength(2)
	expect(screen.getAllByRole('link', { name: 'Détails' })[0]?.getAttribute('href')).toContain('/issues/61')
})

test('renders notes safely without HTML, unsafe links or tracking images; keeps original text', async () => {
	const body =
		'# Titre\n\n## Sous-titre\n\n### Correctif\n\n<script>alert(1)</script>\n\n<img src="https://tracker.example/pixel">\n\n![Image externe](https://tracker.example/another)\n\n[Piège](javascript:alert%281%29)\n\nTexte officiel **inchangé**.'
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([{ ...release(), body }])))
	mount('/changelog')
	await screen.findByText('inchangé')
	expect(document.querySelector('.mm-release-markdown script')).toBeNull()
	expect(document.querySelector('.mm-release-markdown img')).toBeNull()
	expect(document.querySelector('a[href^="javascript:"]')).toBeNull()
	expect(screen.getByRole('heading', { level: 3, name: 'Titre' })).toBeTruthy()
	expect(screen.getByRole('heading', { level: 4, name: 'Correctif' })).toBeTruthy()
	expect(screen.getByText('Texte officiel', { exact: false }).textContent).toBe('Texte officiel inchangé.')
})

test('missing notes and integrity are explicit; published releases remain downloadable', async () => {
	const data = {
		...release('0.1.0'),
		prerelease: false,
		body: null,
		assets: [{ ...release('0.1.0').assets[0], digest: 'bad' }],
	}
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([data])))
	mount('/changelog')
	await screen.findByText('Aucune note publiée pour cette version.')
	expect(screen.getByText('Empreinte SHA-256 non fournie.')).toBeTruthy()
	expect(screen.getByText('Version publiée')).toBeTruthy()
	expect(screen.getByRole('link', { name: 'Télécharger le JAR 0.1.0' })).toBeTruthy()
	expect(screen.queryByText('Vérifier le fichier (SHA-256)')).toBeNull()
})

test('pagination preserves downloads on failure, retries the same page and deduplicates releases', async () => {
	const first = Array.from({ length: 30 }, (_, index) => release(`0.2.${30 - index}`, '2026-10-15T10:00:00Z'))
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(Response.json(first))
		.mockResolvedValueOnce(new Response(null, { status: 429 }))
		.mockResolvedValueOnce(Response.json([first[0], release('0.1.0', '2026-10-14T10:00:00Z')]))
	vi.stubGlobal('fetch', fetchMock)
	mount()
	fireEvent.click(await screen.findByRole('button', { name: 'Charger les versions précédentes' }))
	await screen.findByRole('alert')
	expect(screen.getAllByRole('article', { name: /Minemories / })).toHaveLength(30)
	fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
	await screen.findByRole('link', { name: 'Télécharger le JAR 0.1.0' })
	expect(screen.getAllByRole('article', { name: /Minemories / })).toHaveLength(31)
	expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
		expect.stringContaining('&page=1'),
		expect.stringContaining('&page=2'),
		expect.stringContaining('&page=2'),
	])
	expect(screen.queryByRole('button', { name: 'Charger les versions précédentes' })).toBeNull()
})

test.each([403, 500])('HTTP %s provides a retry and public GitHub fallback', async status => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(new Response(null, { status }))
		.mockResolvedValueOnce(Response.json([release()]))
	vi.stubGlobal('fetch', fetchMock)
	mount()
	await screen.findByRole('alert')
	expect(screen.getByRole('link', { name: 'Toutes les releases sur GitHub ↗' }).getAttribute('href')).toBe(
		'https://github.com/For-Hives/minemories/releases'
	)
	fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
	await screen.findByRole('link', { name: /Télécharger le JAR/ })
	expect(screen.queryByRole('alert')).toBeNull()
})

test.each([{ data: [] }, { data: [{ ...release(), assets: [] }] }])(
	'an empty compatible history never invents a release',
	async ({ data }) => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)))
		mount()
		await screen.findByText('Aucune version compatible dans cette partie de l’historique.')
		expect(screen.queryByRole('link', { name: /Télécharger le JAR/ })).toBeNull()
	}
)

test.each([null, { message: 'API rate limit exceeded' }])(
	'malformed API responses are errors, not empty successes',
	async data => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)))
		mount()
		await screen.findByRole('alert')
		expect(screen.queryByText('Aucune version compatible dans cette partie de l’historique.')).toBeNull()
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
		.mockResolvedValueOnce(Response.json([release()]))
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
		finish(Response.json([release('9.9.9')]))
	})
	expect(screen.queryByText('Minemories 9.9.9')).toBeNull()
	view.unmount()
	expect(fetchMock.mock.calls[1]?.[1].signal.aborted).toBe(true)
})

test('English interface retains the original release notes and localizes dates', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([release()])))
	mount('/changelog', 'en')
	await screen.findByRole('link', { name: /Download JAR/ })
	expect(screen.getByText('Latest version')).toBeTruthy()
	expect(screen.getByText('October 15, 2026')).toBeTruthy()
	expect(screen.getByText('Capture', { selector: 'strong' })).toBeTruthy()
})

test('parser rejects malformed, foreign and incompatible assets and ignores forged integrity links', () => {
	const good = release()
	expect(
		parseReleases([
			null,
			false,
			{},
			{ ...good, published_at: 'invalid' },
			{ ...good, tag_name: 'web-v1.0.0' },
			{ ...good, assets: [null, 'jar', { ...good.assets[0], size: 1 }] },
			{ ...good, assets: [{ ...good.assets[0], size: 4.5 }] },
			{ ...good, assets: [{ ...good.assets[0], browser_download_url: 'https://evil.example/mod.jar' }] },
		])
	).toEqual([])
	const [parsed] = parseReleases([
		{ ...good, assets: [good.assets[0], { ...good.assets[1], browser_download_url: 'https://evil.example/checksum' }] },
	])
	expect(parsed?.checksumUrl).toBeNull()
	expect(parsed?.sha256).toBe('a'.repeat(64))
	expect(parseReleases(null)).toEqual([])
})
