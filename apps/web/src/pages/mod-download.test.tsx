// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { ModDownload, selectLatestRelease } from './ModDownload'

const filename = 'minemories-neoforge-mc1.21.1.jar'
function release(version = '0.1.0', published = '2026-10-10T12:00:00Z') {
	const prefix = `https://github.com/For-Hives/minemories/releases/download/mod-v${version}/`
	return {
		tag_name: `mod-v${version}`,
		draft: false,
		prerelease: true,
		published_at: published,
		assets: [
			{ name: filename, browser_download_url: prefix + filename, size: 4096, digest: `sha256:${'a'.repeat(64)}` },
			{ name: `${filename}.sha256`, browser_download_url: `${prefix}${filename}.sha256` },
		],
	}
}
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.useRealTimers()
})
test('downloads the most recently published compatible JAR directly from public GitHub Releases', async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json([release()]))
	vi.stubGlobal('fetch', fetchMock)
	render(
		<MemoryRouter>
			<ModDownload />
		</MemoryRouter>
	)
	const link = await screen.findByRole('link', { name: 'Télécharger Minemories 0.1.0 (.jar)' })
	expect(link.getAttribute('href')).toBe(release().assets[0]?.browser_download_url)
	expect(fetchMock).toHaveBeenCalledTimes(1)
	expect(fetchMock.mock.calls[0]?.[0]).toContain('api.github.com/repos/For-Hives/minemories/releases')
	expect(screen.getByText('a'.repeat(64))).toBeTruthy()
	expect(screen.getByText(/Préversion expérimentale/)).toBeTruthy()
	expect(screen.getByRole('link', { name: 'Télécharger l’empreinte' }).getAttribute('href')).toContain('.jar.sha256')
})
test('selects by publication date, includes alpha releases and ignores invalid or incompatible releases', () => {
	const latest = release('0.3.0', '2026-10-14T12:00:00Z')
	const foreign = {
		...release('0.4.0', '2026-10-15T12:00:00Z'),
		assets: [{ ...latest.assets[0], browser_download_url: 'https://evil.example/mod.jar' }],
	}
	expect(
		selectLatestRelease([
			release(),
			foreign,
			{ ...latest, draft: true },
			{ ...latest, published_at: 'invalid' },
			latest,
		])?.version
	).toBe('0.3.0')
	expect(selectLatestRelease([{ ...latest, tag_name: 'other' }, { ...latest, assets: [] }, null])).toBeNull()
	expect(selectLatestRelease({})).toBeNull()
	expect(selectLatestRelease([{ ...latest, assets: [{ ...latest.assets[0], size: 0 }] }])).toBeNull()
})
test('a release without a digest or checksum still has a download, without an invented checksum', async () => {
	const published = { ...release(), prerelease: false, assets: [{ ...release().assets[0], digest: null }] }
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([published])))
	render(
		<MemoryRouter>
			<ModDownload />
		</MemoryRouter>
	)
	await screen.findByRole('link', { name: /Télécharger Minemories/ })
	expect(screen.queryByText('Vérifier le fichier téléchargé (avancé)')).toBeNull()
	expect(screen.getByText(/Version publiée/)).toBeTruthy()
})
test.each([[], { message: 'API rate limit exceeded' }, null])(
	'missing releases or an API failure offer the public releases page and retry',
	async data => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)))
		render(
			<MemoryRouter>
				<ModDownload />
			</MemoryRouter>
		)
		await screen.findByRole('button', { name: 'Réessayer le téléchargement' })
		expect(screen.queryByRole('link', { name: /Télécharger Minemories/ })).toBeNull()
		expect(screen.getByRole('link', { name: 'Toutes les versions sur GitHub' }).getAttribute('href')).toBe(
			'https://github.com/For-Hives/minemories/releases'
		)
	}
)
test('retry recovers from a GitHub error and leaving cancels the request', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(new Response(null, { status: 403 }))
		.mockResolvedValueOnce(Response.json([release()]))
	vi.stubGlobal('fetch', fetchMock)
	const view = render(
		<MemoryRouter>
			<ModDownload />
		</MemoryRouter>
	)
	fireEvent.click(await screen.findByRole('button', { name: 'Réessayer le téléchargement' }))
	await screen.findByRole('link', { name: /Télécharger Minemories/ })
	view.unmount()
	expect(fetchMock.mock.calls[1]?.[1].signal.aborted).toBe(true)
})
test('network failure and timeout both allow retry', async () => {
	vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
	const view = render(
		<MemoryRouter>
			<ModDownload />
		</MemoryRouter>
	)
	await screen.findByRole('button', { name: 'Réessayer le téléchargement' })
	view.unmount()
	vi.useFakeTimers()
	vi.stubGlobal(
		'fetch',
		vi.fn().mockImplementation(() => new Promise(() => {}))
	)
	render(
		<MemoryRouter>
			<ModDownload />
		</MemoryRouter>
	)
	await act(async () => {
		await vi.advanceTimersByTimeAsync(15000)
	})
	expect(screen.getByRole('button', { name: 'Réessayer le téléchargement' })).toBeTruthy()
})
