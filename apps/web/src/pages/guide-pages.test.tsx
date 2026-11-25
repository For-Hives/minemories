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

test('/server-closing: three options, the Aternos and admin anchors, then one link to its FAQ group', () => {
	mount(<ServerClosingPage />, 'fr', '/server-closing')
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Garde ta base avant que ton serveur ferme')
	for (const option of [
		'Demander le monde à l’admin',
		'Faire une copie jouable',
		'Garder un souvenir 3D avec Minemories',
	])
		expect(screen.getByRole('heading', { name: option })).toBeTruthy()
	expect(document.getElementById('aternos')?.textContent).toContain('Aternos')
	expect(document.getElementById('admin')?.textContent).toContain('Tu n’installes rien.')
	// the answers live on /faq; the page links to its group and leaves the install button to the bar
	expect(document.querySelectorAll('.ex-faq-item')).toHaveLength(0)
	expect(screen.getByRole('link', { name: 'Questions\u00a0: Capturer\u00a0→' }).getAttribute('href')).toBe(
		'/faq#capturing'
	)
	expect(screen.queryByRole('link', { name: 'Installer le mod' })).toBeNull()
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
		await screen.findByRole('heading', { level: 1, name: 'Behalte deine Basis, bevor dein Server schließt' })
	).toBeTruthy()
	const quotes = [...document.querySelectorAll('.ex-announce blockquote')]
	expect(quotes[0]?.textContent).toContain('drück M → Erinnerung festhalten')
	expect(quotes[0]?.textContent).toContain('[Datum]')
	expect(quotes[1]?.getAttribute('lang')).toBe('en-US')
})

test('/safety: the parents box, the checksum fold under #verifier, what goes online, what a link shows and how to delete', () => {
	mount(<SafetyPage />, 'fr', '/safety')
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sécurité')
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
	expect(table.textContent).toContain('Tes souvenirs, avec quand et où tu les as pris.')
	expect(table.textContent).toContain('Des rapports d’erreur, sans rien de personnel.')
	expect(within(table).getByRole('link', { name: 'Confidentialité\u00a0→' }).getAttribute('href')).toBe('/privacy')
	expect(document.body.textContent).toContain(
		'Le lien montre où est ta base, et sur quel serveur. Réfléchis avant de le poster en public.'
	)
	expect(document.body.textContent).toContain('Arrêter le partage bloque les nouvelles visites')
	expect(document.body.textContent).toContain('30 jours de corbeille')
	expect(document.body.textContent).toContain('écris-nous via les mentions légales')
	expect(screen.getByRole('link', { name: 'Mentions légales\u00a0→' }).getAttribute('href')).toBe('/legal')
	expect(screen.queryByRole('link', { name: 'Installer le mod' })).toBeNull()
	expect(document.body.textContent).not.toMatch(blocked)
})

test('/guides/minecraft-blender: the real export commands, the folder, the Blender import and a link to its questions', () => {
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
	expect(document.body.textContent).toContain('capture.glb est le plus récent, les autres sont dans history.')
	expect(document.body.textContent).toContain('Fichier → Importer → glTF 2.0 (.glb/.gltf)')
	expect(document.body.textContent).toContain('terrain, decor, fluids, block_entities, entities')
	expect(document.querySelectorAll('.ex-faq-item')).toHaveLength(0)
	expect(screen.getByRole('link', { name: 'Questions\u00a0: Capturer\u00a0→' }).getAttribute('href')).toBe(
		'/faq#capturing'
	)
	expect(document.querySelector('img')).toBeNull()
	expect(document.body.textContent).not.toMatch(blocked)
})

test('the three pages are prerendered, indexable and dated, the guide as an article', () => {
	for (const path of ['/server-closing', '/safety', '/guides/minecraft-blender']) {
		const html = renderPage(path, 'fr')
		expect(html, path).toContain('<h1')
		expect(html, path).toContain('href="/fr/installation')
		const page = metadataFor(path, 'fr')
		expect(page.indexable, path).toBe(true)
		expect(page.updated, path).toMatch(/^\d{4}-\d{2}-\d{2}$/)
	}
	expect(renderPage('/server-closing', 'fr')).toContain('id="aternos"')
	expect(renderPage('/server-closing', 'fr')).toContain('id="admin"')
	expect(renderPage('/safety', 'fr')).toContain('id="verifier"')
	expect(metadataFor('/server-closing', 'fr').title).toBe('Serveur Minecraft qui ferme\u00a0: garde tes constructions')
	expect(metadataFor('/safety', 'fr').title).toBe('Sécurité de Minemories\u00a0: le mod, les enfants et la vie privée')
	expect(metadataFor('/guides/minecraft-blender', 'fr').title).toBe(
		'Exporter une construction Minecraft vers Blender (GLB)'
	)
	expect(metadataFor('/guides/minecraft-blender', 'fr').articleDate).toBe('2026-11-10')
})
