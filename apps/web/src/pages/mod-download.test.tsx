// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ModDownload } from './ModDownload'

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})
const manifest = {
	version: '0.1.0',
	minecraft: '1.21.1',
	loaderVersion: '21.1.248',
	file: '/downloads/minemories-neoforge-mc1.21.1.jar',
	sha256: 'a'.repeat(64),
}

test('offers the built JAR directly and exposes its checksum separately', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => manifest }))
	render(<ModDownload />)
	expect(screen.getByRole('status').textContent).toContain('Vérification')
	const download = await screen.findByRole('link', { name: 'Télécharger Minemories 0.1.0 (.jar)' })
	expect(download.getAttribute('href')).toBe(`${manifest.file}?sha256=${manifest.sha256}`)
	expect(download.hasAttribute('download')).toBe(true)
	fireEvent.click(screen.getByText('Vérifier le fichier téléchargé (avancé)'))
	expect(screen.getByText(manifest.sha256)).toBeTruthy()
})

test.each([
	{ ok: false },
	{ ok: true, json: async () => ({ ...manifest, file: 'https://untrusted.example/mod.jar' }) },
	{ ok: true, json: async () => ({ ...manifest, minecraft: '1.20.1' }) },
	{ ok: true, json: async () => ({ ...manifest, sha256: 'invalid' }) },
])('does not expose a broken or unexpected download', async response => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
	render(<ModDownload />)
	expect(await screen.findByRole('status')).toBeTruthy()
	await screen.findByRole('link', { name: 'versions du projet' })
	expect(screen.queryByRole('link', { name: /Télécharger Minemories/ })).toBeNull()
})

test('handles network failures and aborts outstanding requests when leaving the page', async () => {
	const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
	vi.stubGlobal('fetch', fetchMock)
	const view = render(<ModDownload />)
	await screen.findByRole('link', { name: 'versions du projet' })
	view.unmount()
	expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true)
})
