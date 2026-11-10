// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { loadLocale } from '../i18n/catalog'
import { I18nProvider, type Locale } from '../i18n/I18n'
import { renderPage } from '../prerender'
import { metadataFor } from '../route-metadata'
import { announcementUrl, BlenderGuidePage, SafetyPage, ServerClosingPage } from './GuidePages'

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

function mount(ui: React.ReactNode, locale: Locale = 'fr', path = '/') {
	return render(
		<I18nProvider initialLocale={locale}>
			<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
		</I18nProvider>
	)
}

const blocked = /gratuit|open source|la plus utilisée|validé|1\.18\.2 → |\bvous\b|\bvotre\b|\bvos\b/i

test('/server-closing: three options, the Aternos and admin anchors, three questions and an install link with its source', () => {
	mount(<ServerClosingPage />, 'fr', '/server-closing')
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ton serveur ferme. Ta base, elle, peut rester.')
	for (const option of [
		'Demander le monde à l’admin',
		'Faire une copie jouable',
		'Garder un souvenir 3D avec Minemories',
	])
		expect(screen.getByRole('heading', { name: option })).toBeTruthy()
	expect(document.getElementById('aternos')?.textContent).toContain('Aternos')
	expect(document.getElementById('admin')?.textContent).toContain('Rien à installer de ton côté')
	expect(document.querySelectorAll('.ex-faq-item')).toHaveLength(3)
	expect(screen.getByRole('heading', { name: 'Tout le monde doit l’installer\u00a0?' })).toBeTruthy()
	expect(screen.getAllByRole('link', { name: 'Installer le mod' }).at(-1)?.getAttribute('href')).toBe(
		'/installation?src=server-closing'
	)
	// the "already closed" answer points here, so its link is left out on this page
	expect(screen.queryByRole('link', { name: 'Serveur qui ferme →' })).toBeNull()
	expect(document.body.textContent).not.toMatch(blocked)
})

test('the announcement is offered in French and English, with the site origin and the server source, and copies', async () => {
	const writeText = vi.fn().mockResolvedValue(undefined)
	vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
	mount(<ServerClosingPage />)
	expect(announcementUrl).toMatch(/^https?:\/\/[^/]+\/installation\?src=server$/)
	const quotes = [...document.querySelectorAll('.ex-announce blockquote')]
	expect(quotes.map(quote => quote.getAttribute('lang'))).toEqual(['fr-FR', 'en-US'])
	expect(quotes[0]?.textContent).toBe(
		`Le serveur ferme le [date]. Pour garder ta base en 3D\u00a0: installe Minemories (${announcementUrl}), va dans ta base, appuie sur M → Prendre un souvenir. Tu pourras la revoir en 3D et nous la montrer ici\u00a0!`
	)
	expect(quotes[1]?.textContent).toContain(`install Minemories (${announcementUrl})`)
	expect(quotes[1]?.textContent).toContain('press M → Take a memory')
	const english = screen.getByRole('button', { name: 'Copier : anglais' })
	await act(async () => {
		fireEvent.click(english)
	})
	expect(writeText).toHaveBeenCalledWith(quotes[1]?.textContent)
	expect(english.textContent).toBe('Copié')
})

test('an English visitor gets the announcement in English first, then French; a refused clipboard copies nothing', async () => {
	vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } })
	mount(<ServerClosingPage />, 'en')
	const quotes = [...document.querySelectorAll('.ex-announce blockquote')]
	expect(quotes.map(quote => quote.getAttribute('lang'))).toEqual(['en-US', 'fr-FR'])
	const button = screen.getByRole('button', { name: 'Copy : English' })
	await act(async () => {
		fireEvent.click(button)
	})
	expect(button.textContent).toBe('Copy')
})

test('a German visitor reads the page and the announcement in German, with the English copy next to it', async () => {
	await loadLocale('de')
	mount(<ServerClosingPage />, 'de')
	expect(
		await screen.findByRole('heading', { level: 1, name: 'Dein Server schließt. Deine Basis kann bleiben.' })
	).toBeTruthy()
	const quotes = [...document.querySelectorAll('.ex-announce blockquote')]
	expect(quotes[0]?.textContent).toContain('drück M → Erinnerung festhalten')
	expect(quotes[0]?.textContent).toContain('[Datum]')
	expect(quotes[1]?.getAttribute('lang')).toBe('en-US')
})

test('/safety: the parents box, the checksum fold under #verifier, what goes online, what a link shows and how to delete', () => {
	mount(<SafetyPage />, 'fr', '/safety')
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Est-ce que Minemories est sûr\u00a0?')
	const parents = screen.getByRole('region', { name: 'Pour les parents, en 5 lignes' })
	expect(within(parents).getAllByRole('listitem')).toHaveLength(5)
	expect(parents.textContent).toContain('M → Souvenirs auto, M → Réglages → Confidentialité')
	const verify = document.getElementById('verifier') as HTMLElement
	expect(within(verify).getByRole('link', { name: 'CurseForge\u00a0→' }).getAttribute('href')).toContain(
		'curseforge.com'
	)
	expect(within(verify).getByRole('link', { name: 'Téléchargements\u00a0→' }).getAttribute('href')).toBe('/downloads')
	expect(verify.querySelector('details summary')?.textContent).toBe('Vérifier l’empreinte (avancé)')
	for (const command of [
		'certutil -hashfile minemories.jar SHA256',
		'shasum -a 256 minemories.jar',
		'sha256sum minemories.jar',
	])
		expect(verify.textContent).toContain(command)
	const table = screen.getByRole('table')
	expect(
		within(table)
			.getAllByRole('columnheader')
			.map(cell => cell.textContent)
	).toEqual(['Avant de connecter le jeu', 'Après avoir connecté le jeu'])
	expect(table.textContent).toContain('sa graine (en solo)')
	expect(table.textContent).toContain('au plus 8 en attente, gardés 7 jours au plus')
	expect(document.body.textContent).toContain('Attention\u00a0: le lien montre les coordonnées de ta base')
	expect(document.body.textContent).toContain('Arrêter le partage bloque les nouvelles visites')
	expect(document.body.textContent).toContain('30 jours de corbeille')
	expect(document.body.textContent).toContain('l’adresse de contact arrive bientôt')
	expect(screen.getAllByRole('link', { name: 'Installer le mod' }).at(-1)?.getAttribute('href')).toBe('/installation')
	expect(screen.getByRole('link', { name: 'Confidentialité' }).getAttribute('href')).toBe('/privacy')
	expect(document.body.textContent).not.toMatch(blocked)
})

test('regional catalogues quote their own mod labels on /safety', async () => {
	await Promise.all([loadLocale('fr-CA'), loadLocale('en-GB')])
	mount(<SafetyPage />, 'fr-CA')
	expect(await screen.findByText(/M → Photos auto/)).toBeTruthy()
	cleanup()
	mount(<SafetyPage />, 'en-GB')
	expect(await screen.findByText(/M → Auto photos/)).toBeTruthy()
})

test('/guides/minecraft-blender: the real export commands, the folder, the Blender import and two questions', () => {
	mount(<BlenderGuidePage />, 'fr', '/guides/minecraft-blender')
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
		'Ta construction Minecraft dans Blender, en un fichier'
	)
	const commands = [...document.querySelectorAll('.ex-command code')].map(code => code.textContent)
	expect(commands).toEqual([
		'/minemories export',
		'/minemories export 48',
		'/minemories select first',
		'/minemories select second',
		'/minemories export selection',
	])
	expect(document.body.textContent).toContain('/minemories export prend 128 blocs autour de toi.')
	expect(document.body.textContent).toContain('un rayon de 2 à 128')
	expect(document.body.textContent).toContain('capture.glb est le dernier')
	expect(document.body.textContent).toContain('Fichier → Importer → glTF 2.0 (.glb/.gltf)')
	expect(document.body.textContent).toContain('terrain, decor, fluids, block_entities, entities')
	expect(document.querySelectorAll('.ex-faq-item')).toHaveLength(2)
	expect(document.querySelector('img')).toBeNull()
	expect(document.body.textContent).not.toMatch(blocked)
})

test('the three pages are prerendered, indexable and dated, the guide as an article', () => {
	for (const path of ['/server-closing', '/safety', '/guides/minecraft-blender']) {
		const html = renderPage(path)
		expect(html, path).toContain('<h1')
		expect(html, path).toContain('href="/installation')
		const page = metadataFor(path)
		expect(page.indexable, path).toBe(true)
		expect(page.updated, path).toMatch(/^\d{4}-\d{2}-\d{2}$/)
	}
	expect(renderPage('/server-closing')).toContain('id="aternos"')
	expect(renderPage('/server-closing')).toContain('id="admin"')
	expect(renderPage('/safety')).toContain('id="verifier"')
	expect(metadataFor('/server-closing').title).toBe('Serveur Minecraft qui ferme\u00a0: garde tes constructions')
	expect(metadataFor('/safety').title).toBe('Minemories est-il sûr\u00a0? Mod, enfants et vie privée')
	expect(metadataFor('/guides/minecraft-blender').title).toBe('Exporter une construction Minecraft vers Blender (GLB)')
	expect(metadataFor('/guides/minecraft-blender').articleDate).toBe('2026-11-10')
})
