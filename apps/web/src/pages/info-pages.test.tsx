// @vitest-environment jsdom
import { cleanup, fireEvent, render as renderUi, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { faqGroups, questions } from '../content/faq'
import { loadLocale, translate } from '../i18n/catalog'
import { I18nProvider } from '../i18n/I18n'
import { LegalPage } from './ContentPages'
import { ConceptPage, FaqPage, HowItWorksPage } from './InfoPages'
import { SharingPage } from './SharingPage'

function render(ui: Parameters<typeof renderUi>[0]) {
	return renderUi(ui, { wrapper: I18nProvider })
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false })))
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

function mountGuide() {
	return render(
		<MemoryRouter initialEntries={['/concept']}>
			<Routes>
				<Route path="/concept" element={<ConceptPage />} />
				<Route path="/faq" element={<FaqPage />} />
			</Routes>
		</MemoryRouter>
	)
}

test('public guides let a visitor move from concept to its FAQ group, then to installation', () => {
	mountGuide()
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ton monde Minecraft, en 3D')
	// no side navigation copies the bar's menus, and the page ends on one link to its group of the FAQ, not on answers
	expect(screen.queryByRole('navigation')).toBeNull()
	expect(document.querySelector('.ex-faq-item')).toBeNull()
	const faqLink = screen.getByRole('link', { name: 'Questions\u00a0: Le mod\u00a0→' })
	expect(faqLink.getAttribute('href')).toBe('/faq#the-mod')
	fireEvent.click(faqLink)
	expect(screen.getByRole('heading', { name: 'Il faut installer quelque chose sur le serveur\u00a0?' })).toBeTruthy()
	expect(screen.getByRole('heading', { name: 'Qui peut voir les souvenirs de mon enfant\u00a0?' })).toBeTruthy()
	expect(screen.queryByRole('link', { name: 'Installer le mod' })).toBeNull()
})

test('how it works links to its FAQ group and to safety; the install button lives in the bar only', () => {
	mountEnglish(<HowItWorksPage />)
	expect(screen.getByRole('link', { name: 'Questions: Capturing\u00a0→' }).getAttribute('href')).toBe('/faq#capturing')
	expect(screen.getByRole('link', { name: 'Safety and privacy →' }).getAttribute('href')).toBe('/safety')
	expect(screen.queryByRole('link', { name: 'Install the mod' })).toBeNull()
	expect(screen.getByRole('slider', { name: 'Radius in blocks' })).toBeTruthy()
})

function mountEnglish(ui: React.ReactNode) {
	return renderUi(
		<I18nProvider initialLocale="en">
			<MemoryRouter>{ui}</MemoryRouter>
		</I18nProvider>
	)
}

const outdatedMenu =
	/[Ss]imple mode|[Aa]dvanced mode|Capture and upload|Export locally|Local captures|Minemories API” button/

test('how it works is one linear page of four steps that quotes the M menu and warns what a link shows', () => {
	mountEnglish(<HowItWorksPage />)
	const howTo = document.querySelector('article')?.textContent ?? ''
	expect(howTo).not.toMatch(outdatedMenu)
	expect(screen.queryByRole('tab')).toBeNull()
	expect(document.querySelector('details')).toBeNull()
	expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
		'1. You play',
		'2. The file stays with you',
		'3. You connect the game, if you want',
		'4. You share it, if you want',
	])
	for (const label of [
		'Press M → Take a memory.',
		'In Minecraft: M → type the code → Connect',
		'The link shows where your base is, and on which server. Think before posting it in public.',
	])
		expect(howTo).toContain(label)
	// The 32-block default radius, drawn: 65 × 65 blocks.
	expect(screen.getByRole('img', { name: '65 × 65' })).toBeTruthy()
	// The pairing command is gone from the how-to: the M menu is the only path given.
	expect(howTo).not.toContain('/minemories pair')
	expect(howTo).not.toContain('/minemories upload')
	// Not before the owner confirms the measure (D13).
	expect(howTo).not.toMatch(/lag|slow the game down/i)
	expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
})

test('the concept page says what it is, what it is not as a plain list, compares the other ways with a date, then links to its questions', () => {
	mountEnglish(<ConceptPage />)
	const text = document.querySelector('article')?.textContent ?? ''
	expect(text).toContain('Minemories is a Minecraft Java mod')
	for (const item of [
		'You can’t play in it or edit it.',
		'It isn’t a backup of your world.',
		'It saves one area, not the whole world.',
		'Only Minecraft Java, on a computer.',
	])
		expect(screen.getByText(item).tagName).toBe('LI')
	// a plain list: no pictogram in front of each item
	expect(screen.getByText('It isn’t a backup of your world.').closest('ul')?.querySelector('svg')).toBeNull()
	const table = screen.getByRole('table')
	expect(table.querySelector('caption')?.textContent).toBe('Compared in November 2026.')
	expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual([
		'Nothing to install on the server',
		'Viewable without Minecraft',
		'Stays after the server closes',
		'Playable again',
	])
	expect(screen.getAllByRole('rowheader').map(cell => cell.textContent)).toEqual([
		'Minemories',
		'Screenshots, video',
		'Replay Mod',
		'World copy (WorldTools, ZIP)',
		'BlueMap',
	])
	expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
	expect(screen.getByRole('link', { name: 'Questions: The mod\u00a0→' }).getAttribute('href')).toBe('/faq#the-mod')
	// No before/after slider until real dated captures of one place exist.
	expect(screen.queryByRole('slider')).toBeNull()
	expect(document.getElementById('avant-apres')).toBeNull()
	expect(screen.queryByRole('link', { name: 'Install the mod' })).toBeNull()
})

test('the FAQ is one visible list, grouped, with an anchor per question and the supported versions', () => {
	mountEnglish(<FaqPage />)
	const faq = document.querySelector('article')?.textContent ?? ''
	expect(faq).not.toMatch(outdatedMenu)
	expect(document.querySelector('details')).toBeNull()
	expect(screen.queryByRole('tab')).toBeNull()
	expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
		'Before installing',
		'The mod',
		'Installing',
		'Capturing',
		'Gallery and sharing',
		'Safety and privacy',
		'Problems',
	])
	for (const anchor of ['ban', 'sodium', 'vieux-monde', 'versions'])
		expect(document.getElementById(anchor)?.querySelector('a')?.getAttribute('href')).toBe(`#${anchor}`)
	// every group is an anchor the guide pages link to, and every question written is on the page, so no answer lives only on another page
	for (const group of faqGroups) expect(document.getElementById(group.id)?.tagName).toBe('SECTION')
	expect(faqGroups.flatMap(group => group.ids).sort()).toEqual(Object.keys(questions).sort())
	expect(faq).toContain(
		'In beta: Minecraft Java 1.18.2, 1.19.2, 1.20.1, 1.21.1, 1.21.11, plus 26.3 as an experimental version.'
	)
	expect(faq).toContain('M → Settings → Privacy')
	expect(faq).toContain('M → My memories → Send this memory.')
	// Questions that wait for an owner decision are not written: price, modpacks, performance.
	expect(faq).not.toMatch(/free|open source|modpack|lag/i)
	expect(faq).not.toMatch(/@[\w-]+\.\w+/)
	expect(faq).not.toContain('1.18.2 → 1.21.11')
	expect(screen.queryByRole('link', { name: 'Install the mod' })).toBeNull()
})

test('each language quotes the labels of its own mod translation', async () => {
	const memory = 'Take a memory'
	await Promise.all((['de', 'ja'] as const).map(loadLocale))
	expect(translate('fr', memory)).toBe('Prendre un souvenir')
	expect(translate('de', memory)).toBe('Erinnerung festhalten')
	expect(translate('ja', memory)).toBe('思い出を残す')
	expect(translate('fr', 'Yes: M → Auto memories.')).toBe('Oui\u00a0: M → Souvenirs auto.')
	expect(translate('de', 'Yes: M → Auto memories.')).toBe('Ja: M → Auto-Fotos.')
	const earlier = 'M → My memories → Send this memory.'
	expect(translate('fr', earlier)).toBe('M → Mes souvenirs → Envoyer ce souvenir.')
	expect(translate('de', earlier)).toBe('M → Meine Erinnerungen → Diese Aufnahme senden.')
	expect(translate('ja', 'In Minecraft: M → type the code → Connect.')).toContain('接続する')
})

test('privacy page explains mod diagnostics and download requests and keeps the web consent control', () => {
	vi.stubEnv('VITE_WEB_DIAGNOSTICS_DSN', 'https://public@ingest.example/12')
	try {
		mountEnglish(<LegalPage kind="privacy" />)
		expect(screen.getByRole('heading', { name: 'Diagnostics in the Minecraft mod' })).toBeTruthy()
		const text = document.body.textContent ?? ''
		expect(text).toContain('nothing is sent until you connect the game')
		expect(text).toContain('Nobody sees them without a link you create.')
		expect(text).not.toMatch(/tutorial|estimates|changelog|Revocation/)
		expect(text).toContain('at most eight reports, for at most seven days')
		expect(text).toContain('M → Settings → Privacy → Diagnostics')
		expect(screen.getByRole('heading', { name: 'Mod download list' })).toBeTruthy()
		expect(text).toContain('so it sees your IP address, like any request')
		expect(screen.getByRole('checkbox', { name: 'Allow public-page diagnostics' })).toBeTruthy()
	} finally {
		vi.unstubAllEnvs()
	}
})

test('French privacy page translates the new mod diagnostics and download list sections', () => {
	renderUi(
		<I18nProvider initialLocale="fr">
			<MemoryRouter>
				<LegalPage kind="privacy" />
			</MemoryRouter>
		</I18nProvider>
	)
	expect(screen.getByRole('heading', { name: 'Diagnostics dans le mod Minecraft' })).toBeTruthy()
	expect(screen.getByRole('heading', { name: 'Liste des téléchargements du mod' })).toBeTruthy()
	const text = document.body.textContent ?? ''
	expect(text).toContain('rien n’est envoyé tant que tu n’as pas connecté le jeu')
	expect(text).toContain('chaque souvenir pris, à la main ou en AFK, part tout seul dans ta galerie')
	expect(text).toContain('Arrêter le partage bloque les nouvelles visites')
	expect(text).toContain('Rien ne part sur Internet tant que le jeu n’est pas connecté à un compte.')
	expect(text).toContain('elle voit donc ton adresse IP, comme pour toute requête')
	expect(text).not.toMatch(/tutoriel|prénom|estimations|nouveautés|révocation/i)
	// The diagram names the game's own code label, not the internal word for pairing.
	expect(text).toContain('Code à 6 chiffres')
	expect(text).not.toContain('Appairage')
	// No internal deployment notes reach the public page.
	expect(text).not.toMatch(/Sentry|27 octobre|doivent être documentées|avant activation/)
})

test('the legal page says who makes Minemories and leaves out internal launch notes', () => {
	renderUi(
		<I18nProvider initialLocale="fr">
			<MemoryRouter>
				<LegalPage kind="legal" />
			</MemoryRouter>
		</I18nProvider>
	)
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Qui fait Minemories')
	const text = document.body.textContent ?? ''
	expect(text).toContain('Le code est public sur GitHub\u00a0; le mod se trouve sur la page Téléchargements.')
	expect(text).not.toMatch(/lancement commercial|versions du mod sont disponibles dans le dépôt/)
	// The legal notice: the publisher and the host with their registered details, then how to reach the publisher.
	expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
		'Éditeur',
		'Hébergement',
		'Contact',
		'Projet indépendant',
	])
	expect(text).toContain('SIRET880 505 276 00035')
	expect(text).toContain('Contabo GmbH')
	expect(text).toContain('81541 München, Allemagne')
	expect(text).toContain('HRB 180722')
	expect(screen.getByRole('link', { name: '+33 6 21 58 26 84' }).getAttribute('href')).toBe('tel:+33621582684')
	expect(screen.getByRole('link', { name: 'Lire la politique de confidentialité' }).getAttribute('href')).toBe(
		'/privacy'
	)
	expect(text).not.toMatch(/Informations à compléter|pas encore l’éditeur/)
})

test('the privacy page names who is responsible, the service providers, the rights and the last update', () => {
	renderUi(
		<I18nProvider initialLocale="fr">
			<MemoryRouter>
				<LegalPage kind="privacy" />
			</MemoryRouter>
		</I18nProvider>
	)
	const text = document.body.textContent ?? ''
	for (const heading of [
		'Qui est responsable de tes données',
		'Prestataires',
		'Statistiques de visite',
		'Tes droits',
		'Sites tiers',
	])
		expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
	expect(text).toContain('Contabo GmbH (Allemagne)')
	expect(text).toContain('Cloudflare (États-Unis)')
	expect(text).toContain('head.sttr.io')
	expect(screen.getAllByRole('listitem').filter(item => item.textContent?.includes('Contabo'))).toHaveLength(1)
	expect(text).toContain('CNIL')
	expect(text).toMatch(/Dernière mise à jour\u00a0: 19 novembre 2026/)
})

test('/sharing says what a link shows in one short line and ends on a link to its FAQ group', () => {
	renderUi(
		<I18nProvider initialLocale="fr">
			<MemoryRouter>
				<SharingPage />
			</MemoryRouter>
		</I18nProvider>
	)
	const text = document.body.textContent ?? ''
	expect(text).toContain('Un lien vers un souvenir, ou vers tout un monde avec son curseur pour remonter le temps.')
	expect(text).toContain('Ou télécharge une carte postale HD.')
	expect(text).toContain('Partager → Créer un lien → Copier')
	// the answer first, then the warning an SMP player needs; the full list of what a link shows is the FAQ's
	const answer = text.indexOf('Ta base en 3D, son nom et sa date.')
	expect(answer).toBeGreaterThan(-1)
	expect(answer).toBeLessThan(
		text.indexOf('Le lien montre où est ta base, et sur quel serveur. Réfléchis avant de le poster en public.')
	)
	expect(text).not.toContain('le nom du monde et la seed en solo')
	expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
	expect(screen.getByRole('link', { name: 'Questions\u00a0: Galerie et partage\u00a0→' }).getAttribute('href')).toBe(
		'/faq#sharing'
	)
	expect(screen.queryByRole('link', { name: 'Installer le mod' })).toBeNull()
	expect(text).not.toMatch(/démonstration|illustrations|Voir la démo/)
})
