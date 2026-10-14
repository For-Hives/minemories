// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ModDownload } from './ModDownload'

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.useRealTimers()
})
const manifest = {
	version: '0.1.0',
	minecraft: '1.21.1',
	loader: 'NeoForge',
	loaderVersion: '21.1.248',
	file: '/downloads/minemories-neoforge-mc1.21.1.jar',
	sha256: 'a'.repeat(64),
	bytes: 4096,
}
function jarResponse(headers = { 'content-type': 'application/java-archive', 'content-length': '4096' }) {
	return new Response(null, { headers })
}

test('offers the built JAR only after checking its served type and size', async () => {
	const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(jarResponse())
	vi.stubGlobal('fetch', fetchMock)
	render(<ModDownload />)
	expect(screen.getByRole('status').textContent).toContain('Vérification')
	const download = await screen.findByRole('link', { name: 'Télécharger Minemories 0.1.0 (.jar)' })
	expect(download.getAttribute('href')).toBe(`${manifest.file}?sha256=${manifest.sha256}`)
	expect(download.hasAttribute('download')).toBe(true)
	expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'HEAD', cache: 'no-store' })
	fireEvent.click(screen.getByText('Vérifier le fichier téléchargé (avancé)'))
	expect(screen.getByText(manifest.sha256)).toBeTruthy()
	expect(screen.getByRole('link', { name: 'Télécharger l’empreinte' }).getAttribute('href')).toContain(manifest.sha256)
})

test.each([
	new Response(null, { status: 404 }),
	Response.json({ ...manifest, file: 'https://untrusted.example/mod.jar' }),
	Response.json({ ...manifest, minecraft: '1.20.1' }),
	Response.json({ ...manifest, loader: 'Fabric' }),
	Response.json({ ...manifest, loaderVersion: '21.1.1' }),
	Response.json({ ...manifest, version: '' }),
	Response.json({ ...manifest, bytes: -1 }),
	Response.json({ ...manifest, sha256: 'invalid' }),
	Response.json(null),
	new Response('<html>SPA fallback</html>', { headers: { 'content-type': 'text/html' } }),
])('does not expose an unavailable or incompatible manifest (%#)', async response => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
	render(<ModDownload />)
	await screen.findByRole('button', { name: 'Réessayer le téléchargement' })
	expect(screen.queryByRole('link', { name: /Télécharger Minemories/ })).toBeNull()
})

test.each([
	new Response(null, { status: 404 }),
	jarResponse({ 'content-type': 'text/html', 'content-length': '4096' }),
	jarResponse({ 'content-type': 'application/java-archive', 'content-length': '300' }),
	new Response(null),
])('rejects a missing, HTML or truncated JAR even with a valid manifest (%#)', async jar => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(jar))
	render(<ModDownload />)
	await screen.findByRole('button', { name: 'Réessayer le téléchargement' })
	expect(screen.queryByRole('link', { name: /Télécharger Minemories/ })).toBeNull()
})

test('retries after network failure and aborts requests on leaving', async () => {
	const fetchMock = vi
		.fn()
		.mockRejectedValueOnce(new Error('offline'))
		.mockResolvedValueOnce(Response.json(manifest))
		.mockResolvedValueOnce(jarResponse())
	vi.stubGlobal('fetch', fetchMock)
	const view = render(<ModDownload />)
	fireEvent.click(await screen.findByRole('button', { name: 'Réessayer le téléchargement' }))
	await screen.findByRole('link', { name: 'Télécharger Minemories 0.1.0 (.jar)' })
	expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true)
	view.unmount()
	expect(fetchMock.mock.calls[1]?.[1].signal.aborted).toBe(true)
})

test('a stalled request offers retry instead of leaving the visitor waiting forever', async () => {
	vi.useFakeTimers()
	vi.stubGlobal(
		'fetch',
		vi.fn().mockImplementation(() => new Promise(() => {}))
	)
	render(<ModDownload />)
	await act(async () => {
		await vi.advanceTimersByTimeAsync(15000)
	})
	expect(screen.getByRole('button', { name: 'Réessayer le téléchargement' })).toBeTruthy()
})
