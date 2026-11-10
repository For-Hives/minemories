// @vitest-environment jsdom
import { cleanup, fireEvent, render as renderUi, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { loadLocale, translate } from '../i18n/catalog'
import { I18nProvider } from '../i18n/I18n'
import { LegalPage } from './ContentPages'
import { ConceptPage, FaqPage, HowItWorksPage, InfoNavigation } from './InfoPages'
import { InstallationPage } from './InstallationPage'
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
		<MemoryRouter initialEntries={['/']}>
			<Routes>
				<Route path="/" element={<InfoNavigation />} />
				<Route path="/concept" element={<ConceptPage />} />
				<Route path="/how-it-works" element={<HowItWorksPage />} />
				<Route path="/installation" element={<InstallationPage />} />
				<Route path="/faq" element={<FaqPage />} />
			</Routes>
		</MemoryRouter>
	)
}

test('public guides let a visitor move from concept to capture, installation and FAQ', () => {
	mountGuide()
	fireEvent.click(screen.getByRole('link', { name: 'C’est quoi, Minemories ?' }))
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ton monde Minecraft, à visiter en 3D')
	fireEvent.click(screen.getAllByRole('link', { name: 'Comment ça marche' })[0] as HTMLElement)
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Du monde Minecraft au souvenir 3D')
	expect(screen.queryByRole('tab')).toBeNull()
	expect(screen.getByRole('slider', { name: 'Rayon en blocs' })).toBeTruthy()
	fireEvent.click(screen.getAllByRole('link', { name: 'Installer le mod' }).at(-1) as HTMLElement)
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Installer Minemories')
	expect(screen.getByRole('heading', { name: 'Le plus simple : l’app CurseForge' })).toBeTruthy()
	expect(screen.getAllByRole('link', { name: 'Tous les téléchargements' }).length).toBeGreaterThan(0)
	const faqLink = screen.getAllByRole('link', { name: 'Toutes les questions' }).at(0)
	if (!faqLink) throw new Error('FAQ navigation is missing')
	fireEvent.click(faqLink)
	expect(screen.getByRole('heading', { name: 'Il faut installer quelque chose sur le serveur\u00a0?' })).toBeTruthy()
	expect(screen.getByRole('heading', { name: 'Qui peut voir les souvenirs de mon enfant ?' })).toBeTruthy()
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
		'4. You show it, if you want',
		'Questions',
	])
	for (const label of [
		'Press M → Take a memory.',
		'In Minecraft: M → type the code → Connect.',
		'Yes: M → Auto memories.',
		'M → Settings → Privacy',
		'The link also shows the coordinates, the dimension, the biome, the world name, the seed (in single player) or the server name or address.',
	])
		expect(howTo).toContain(label)
	// The 32-block default radius, drawn: 65 × 65 blocks.
	expect(screen.getByRole('img', { name: '65 × 65' })).toBeTruthy()
	// The pairing command is gone from the how-to: the M menu is the only path given.
	expect(howTo).not.toContain('/minemories pair')
	expect(howTo).not.toContain('/minemories upload')
	// Not before the owner confirms the measure (D13).
	expect(howTo).not.toMatch(/lag|slow the game down/i)
	expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
})

test('the concept page says what it is, what it is not, compares the other ways with a date, then asks three questions', () => {
	mountEnglish(<ConceptPage />)
	const text = document.querySelector('article')?.textContent ?? ''
	expect(text).toContain('Minemories is a mod for Minecraft Java.')
	for (const item of [
		'Not playable',
		'Not editable',
		'Not a backup',
		'One area, not the whole world',
		'Java on a computer only',
	])
		expect(screen.getByText(item)).toBeTruthy()
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
	expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual([
		'How is it different from BlueMap?',
		'Can I play in it again?',
		'Are basements included?',
	])
	// No before/after slider until real dated captures of one place exist.
	expect(screen.queryByRole('slider')).toBeNull()
	expect(document.getElementById('avant-apres')).toBeNull()
	expect(screen.getAllByRole('link', { name: 'Install the mod' }).at(-1)?.getAttribute('href')).toBe('/installation')
})

test('the FAQ is one visible list, grouped, with an anchor per question and the supported versions', () => {
	mountEnglish(<FaqPage />)
	const faq = document.querySelector('article')?.textContent ?? ''
	expect(faq).not.toMatch(outdatedMenu)
	expect(document.querySelector('details')).toBeNull()
	expect(screen.queryByRole('tab')).toBeNull()
	expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
		'Before installing',
		'What is it?',
		'Installing',
		'Capturing',
		'Gallery and sharing',
		'Safety and privacy',
		'Problems',
	])
	for (const anchor of ['ban', 'sodium', 'vieux-monde', 'versions'])
		expect(document.getElementById(anchor)?.querySelector('a')?.getAttribute('href')).toBe(`#${anchor}`)
	expect(faq).toContain(
		'In beta: Minecraft Java 1.18.2, 1.19.2, 1.20.1, 1.21.1, 1.21.11, plus 26.3 as an experimental version.'
	)
	expect(faq).toContain('M → Settings → Privacy')
	expect(faq).toContain('M → My memories → Send this memory.')
	// Questions that wait for an owner decision are not written: price, modpacks, performance.
	expect(faq).not.toMatch(/free|open source|modpack|lag/i)
	expect(faq).not.toMatch(/@[\w-]+\.\w+/)
	expect(faq).not.toContain('1.18.2 → 1.21.11')
	expect(screen.getAllByRole('link', { name: 'Install the mod' }).at(-1)?.getAttribute('href')).toBe('/installation')
})

test('each language quotes the labels of its own mod translation', async () => {
	const memory = 'Take a memory'
	await Promise.all((['de', 'ja', 'en-GB', 'fr-CA'] as const).map(loadLocale))
	expect(translate('fr', memory)).toBe('Prendre un souvenir')
	expect(translate('de', memory)).toBe('Erinnerung festhalten')
	expect(translate('ja', memory)).toBe('思い出を残す')
	expect(translate('fr', 'Yes: M → Auto memories.')).toBe('Oui : M → Souvenirs auto.')
	expect(translate('de', 'Yes: M → Auto memories.')).toBe('Ja: M → Auto-Fotos.')
	const earlier = 'M → My memories → Send this memory.'
	expect(translate('fr', earlier)).toBe('M → Mes souvenirs → Envoyer ce souvenir.')
	expect(translate('fr-CA', earlier)).toBe('M → Mes souvenirs → Envoyer cette capture.')
	expect(translate('en-GB', earlier)).toBe('M → My memories → Send this capture.')
	expect(translate('de', earlier)).toBe('M → Meine Erinnerungen → Diese Aufnahme senden.')
	expect(translate('en-GB', 'Yes: M → Auto memories.')).toBe('Yes: M → Auto photos.')
	expect(translate('fr-CA', 'Yes: M → Auto memories.')).toBe('Oui : M → Photos auto.')
	expect(translate('ja', 'In Minecraft: M → type the code → Connect.')).toContain('接続する')
})

test('privacy page explains mod diagnostics and download requests and keeps the web consent control', () => {
	vi.stubEnv('VITE_WEB_DIAGNOSTICS_DSN', 'https://public@ingest.example/12')
	try {
		mountEnglish(<LegalPage kind="privacy" />)
		expect(screen.getByRole('heading', { name: 'Diagnostics in the Minecraft mod' })).toBeTruthy()
		const text = document.body.textContent ?? ''
		expect(text).toContain('nothing is ever sent before you connect the game')
		expect(text).toContain('Nobody sees them without a link you create.')
		expect(text).not.toMatch(/tutorial|estimates|changelog|Revocation/)
		expect(text).toContain('at most eight pending reports, for at most seven days')
		expect(text).toContain('M → Settings → Privacy → Diagnostics')
		expect(screen.getByRole('heading', { name: 'Mod download list' })).toBeTruthy()
		expect(text).toContain('the API receives your IP address like any request to the service')
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
	expect(text).toContain('rien n’est jamais envoyé avant que tu connectes le jeu')
	expect(text).toContain('chaque souvenir pris avec M → Prendre un souvenir, ou en AFK, part tout seul dans ta galerie')
	expect(text).toContain('Arrêter le partage bloque les nouvelles visites')
	expect(text).toContain('Rien ne part sur Internet tant que le jeu n’est pas connecté à un compte.')
	expect(text).toContain('l’API reçoit ton adresse IP comme pour toute requête au service')
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
	expect(text).toContain('Le code source est public sur GitHub ; le mod se télécharge sur la page Téléchargements.')
	expect(text).not.toMatch(/lancement commercial|versions du mod sont disponibles dans le dépôt/)
})

test('/sharing says what a link shows, answers three questions and ends on the install button', () => {
	renderUi(
		<I18nProvider initialLocale="fr">
			<MemoryRouter>
				<SharingPage />
			</MemoryRouter>
		</I18nProvider>
	)
	const text = document.body.textContent ?? ''
	expect(text).toContain('Un lien vers un souvenir, ou vers tout un monde avec son curseur pour remonter le temps.')
	expect(text).toContain('Télécharge la carte postale HD')
	expect(text).toContain('la dimension, le biome, le nom du monde')
	expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
	expect(screen.getAllByRole('link', { name: 'Installer le mod' }).at(-1)?.getAttribute('href')).toBe('/installation')
	expect(text).not.toMatch(/démonstration|illustrations|Voir la démo/)
})
