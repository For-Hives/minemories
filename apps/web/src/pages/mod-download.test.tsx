// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderUi, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { modIndexFixture } from '../testing/mod-index'
import { ModDownload } from './ModDownload'
import {
	downloadUrl,
	indexUrl,
	type LoaderTarget,
	loaderTargets,
	parseIndex,
	selectLatestRelease,
} from './mod-releases'

function render(ui: Parameters<typeof renderUi>[0]) {
	return renderUi(ui, { wrapper: I18nProvider })
}

const target = (id: string) => loaderTargets.find(item => item.id === id) as LoaderTarget
const neoforge = target('neoforge-mc1.21.1')
const mount = (chosen: LoaderTarget = neoforge) =>
	render(
		<MemoryRouter>
			<ModDownload target={chosen} />
		</MemoryRouter>
	)
const serve = (data: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)))

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.useRealTimers()
})
test('downloads the newest JAR of the chosen target from the Minemories API, without GitHub', async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json(modIndexFixture({ 'neoforge-mc1.21.1': ['0.1.0-beta.1'] })))
	vi.stubGlobal('fetch', fetchMock)
	mount()
	const link = await screen.findByRole('link', { name: 'Télécharger Minemories 0.1.0-beta.1 (.jar)' })
	expect(link.getAttribute('href')).toBe(downloadUrl('neoforge-mc1.21.1', '0.1.0-beta.1'))
	expect(fetchMock).toHaveBeenCalledTimes(1)
	expect(fetchMock.mock.calls[0]?.[0]).toBe(indexUrl)
	expect(indexUrl).toMatch(/\/downloads\/index\.json$/)
	expect(screen.getByText('a'.repeat(64))).toBeTruthy()
	expect(screen.getByText(/Préversion expérimentale/)).toBeTruthy()
	expect(screen.getByText(/0,29/)).toBeTruthy()
	expect(document.body.innerHTML).not.toContain('github.com')
})
test('a stable version is described as a published release', async () => {
	serve(modIndexFixture({ 'neoforge-mc1.21.1': ['1.0.0'] }))
	mount()
	await screen.findByRole('link', { name: /Télécharger Minemories 1\.0\.0/ })
	expect(screen.getByText(/Version publiée/)).toBeTruthy()
})
test.each([{ schema: 1, generatedAt: 'x', targets: {} }, modIndexFixture({ 'fabric-mc1.21.1': ['0.3.0'] })])(
	'a missing target offers a retry and the versions page, never another loader',
	async data => {
		serve(data)
		mount()
		await screen.findByRole('button', { name: 'Réessayer le téléchargement' })
		expect(screen.queryByRole('link', { name: /Télécharger Minemories/ })).toBeNull()
		expect(screen.getByRole('link', { name: 'Versions précédentes et nouveautés' }).getAttribute('href')).toBe(
			'/versions'
		)
	}
)
test.each([{ message: 'nope' }, null, { schema: 2 }])('an invalid index is an error with a retry', async data => {
	serve(data)
	mount()
	await screen.findByRole('button', { name: 'Réessayer le téléchargement' })
	expect(screen.queryByRole('link', { name: /Télécharger Minemories/ })).toBeNull()
})
test('retry recovers from an API error and leaving cancels the request', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(new Response(null, { status: 503 }))
		.mockResolvedValueOnce(Response.json(modIndexFixture({ 'neoforge-mc1.21.1': ['0.1.0'] })))
	vi.stubGlobal('fetch', fetchMock)
	const view = mount()
	fireEvent.click(await screen.findByRole('button', { name: 'Réessayer le téléchargement' }))
	await screen.findByRole('link', { name: /Télécharger Minemories/ })
	view.unmount()
	expect(fetchMock.mock.calls[1]?.[1].signal.aborted).toBe(true)
})
test('network failure and timeout both allow retry', async () => {
	vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
	const view = mount()
	await screen.findByRole('button', { name: 'Réessayer le téléchargement' })
	view.unmount()
	vi.useFakeTimers()
	vi.stubGlobal(
		'fetch',
		vi.fn().mockImplementation(() => new Promise(() => undefined))
	)
	mount()
	await act(async () => {
		await vi.advanceTimersByTimeAsync(15000)
	})
	expect(screen.getByRole('button', { name: 'Réessayer le téléchargement' })).toBeTruthy()
})
test('the guide downloads the newest version of the chosen target and links the versions page', async () => {
	serve(
		modIndexFixture({
			'fabric-mc1.21.1': ['0.3.0', '0.2.0'],
			'neoforge-mc1.21.1': [{ version: '0.2.0', builtAt: '2026-10-15T12:00:00Z' }],
		})
	)
	mount()
	const link = await screen.findByRole('link', { name: 'Télécharger Minemories 0.2.0 (.jar)' })
	expect(link.getAttribute('href')).toBe(downloadUrl('neoforge-mc1.21.1', '0.2.0'))
	expect(screen.getByText('a'.repeat(64))).toBeTruthy()
	expect(screen.queryByText('b'.repeat(64))).toBeNull()
	expect(screen.getByText(/NeoForge 21\.1\.248/)).toBeTruthy()
})
test('a Fabric 1.19.2 guide offers its own JAR with compatibility, Fabric API and the Quilt note', async () => {
	serve(modIndexFixture({ 'fabric-mc1.19.2': [{ version: '0.4.0', bytes: 4096 }], 'neoforge-mc1.21.1': ['0.9.0'] }))
	mount(target('fabric-mc1.19.2'))
	const link = await screen.findByRole('link', { name: 'Télécharger Minemories 0.4.0 (.jar)' })
	expect(link.getAttribute('href')).toBe(downloadUrl('fabric-mc1.19.2', '0.4.0'))
	expect(
		screen.getByText(/Minecraft Java 1\.19\.2 · Fabric 0\.20\.1 \+ Fabric API 0\.77\.0\+1\.19\.2 · Java 17/)
	).toBeTruthy()
	expect(screen.getByText(/Quilt 0\.30\.1/)).toBeTruthy()
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
