// @vitest-environment jsdom
import { cleanup, fireEvent, render as renderUi, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { loadLocale, translate } from '../i18n/catalog'
import { I18nProvider } from '../i18n/I18n'
import { LegalPage } from './ContentPages'
import { ConceptPage, FaqPage, HowItWorksPage, InfoNavigation } from './InfoPages'
import { InstallationPage } from './InstallationPage'
import { InstallationStep } from './InstallationSteps'
import { targetFor } from './installation-state'

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
	fireEvent.click(screen.getByRole('link', { name: 'Le concept' }))
	expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('saison')
	fireEvent.click(screen.getByRole('link', { name: 'Créer mon premier souvenir, étape par étape' }))
	fireEvent.click(screen.getByRole('tab', { name: 'Capturer' }))
	expect(screen.getAllByText('/minemories export 16').length).toBeGreaterThan(0)
	expect(screen.getByText(/Les captures AFK sont actives par défaut/)).toBeTruthy()
	fireEvent.click(screen.getByRole('tab', { name: 'Installe' }))
	const installLink = screen.getAllByRole('link', { name: 'Installe le mod' }).at(0)
	if (!installLink) throw new Error('The install step has no link')
	fireEvent.click(installLink)
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Installer le mod Minemories')
	expect(screen.getByRole('button', { name: /^Installation guidée/ })).toBeTruthy()
	expect(screen.getByRole('link', { name: /Voir tous les téléchargements/ })).toBeTruthy()
	const faqLink = screen.getAllByRole('link', { name: 'FAQ' }).at(0)
	if (!faqLink) throw new Error('FAQ navigation is missing')
	fireEvent.click(faqLink)
	expect(screen.getByRole('heading', { name: 'Dois-je installer quelque chose sur le serveur ?' })).toBeTruthy()
	fireEvent.click(screen.getByRole('tab', { name: 'Partager' }))
	expect(screen.getByRole('heading', { name: 'Qui peut voir les souvenirs de mon enfant ?' })).toBeTruthy()
	fireEvent.click(screen.getByRole('link', { name: 'Toutes les étapes pour capturer, envoyer et partager' }))
	fireEvent.click(screen.getByRole('tab', { name: 'Partager' }))
	expect(screen.getByRole('heading', { name: '5. Partager seulement ce que tu choisis' })).toBeTruthy()
	expect(document.body.textContent).toContain('clique sur « Partager » puis « Créer un lien »')
	expect(document.body.textContent).not.toMatch(/« Share »|« Create a link »/)
	expect(document.body.textContent).not.toContain('Le suivi commence avec cette version')
	expect(document.body.textContent).toContain('La profondeur visitée est enregistrée sur ton ordinateur uniquement.')
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

test('guides describe the current M screen labels and its advanced settings tabs', () => {
	mountEnglish(<HowItWorksPage />)
	const howTo = document.querySelector('article')?.textContent ?? ''
	expect(howTo).not.toMatch(outdatedMenu)
	for (const label of [
		'M → type the code → Connect',
		'“Take a memory”',
		'M → My memories → Send this memory',
		'“Auto memories”',
		'M → Settings → Account',
	])
		expect(howTo).toContain(label)
	// The pairing command is gone from the how-to: the M menu is the only path given.
	expect(howTo).not.toContain('/minemories pair')
	expect(howTo).not.toContain('/minemories upload')
	expect(howTo).toContain('M → Settings → Memories → Auto captures, “Captured depth”')
	expect(howTo).toContain('“Official address”')
	cleanup()
	mountEnglish(<FaqPage />)
	const faq = document.querySelector('article')?.textContent ?? ''
	expect(faq).not.toMatch(outdatedMenu)
	expect(faq).toContain('M → My memories lists dated captures')
	expect(faq).toContain(
		'Yes, with Minecraft Java 1.18.2, 1.19.2, 1.20.1, 1.21.1, 1.21.11 and the loader listed for your version'
	)
	expect(faq).not.toContain('Java 1.21.1 with')
	expect(faq).not.toContain('NeoForge 21.1.248')
})

test('the first memory step names the in-game button and the download step points to other versions', async () => {
	mountEnglish(<InstallationStep step="memory" system="linux" target={targetFor('1.21.1', 'neoforge')} />)
	expect(screen.getAllByText('Take a memory').length).toBeGreaterThan(0)
	expect(screen.getByRole('heading', { name: 'With the menu' })).toBeTruthy()
	expect(screen.getByRole('heading', { name: 'With a command' })).toBeTruthy()
	expect(document.body.textContent).toContain('The radius in blocks around you, from 2 to 128.')
	expect(document.body.textContent).toContain('You can turn them off with “Auto memories” in M.')
	cleanup()
	mountEnglish(<InstallationStep step="download" system="linux" target={targetFor('1.21.1', 'neoforge')} />)
	await screen.findByRole('button', { name: 'Retry download' })
	expect(screen.getByRole('link', { name: "Previous versions and what's new" }).getAttribute('href')).toBe('/versions')
})

test('each language quotes the labels of its own mod translation', async () => {
	const memory = 'Take a memory'
	const auto =
		'AFK captures are enabled by default after 5 minutes of inactivity, at most once every 4 hours. Once your account is linked, they upload automatically to your private gallery. You can turn them off with “Auto memories” in M. Without a linked account, they stay on your computer.'
	await Promise.all((['de', 'ja', 'en-GB', 'fr-CA'] as const).map(loadLocale))
	expect(translate('fr', memory)).toBe('Prendre un souvenir')
	expect(translate('de', memory)).toBe('Erinnerung festhalten')
	expect(translate('ja', memory)).toBe('思い出を残す')
	expect(translate('fr', auto)).toContain('« Souvenirs auto »')
	expect(translate('fr-CA', auto)).toContain('« Photos auto »')
	expect(translate('en-GB', auto)).toContain('“Auto photos”')
	expect(translate('de', auto)).toContain('„Auto-Fotos“')
	const earlier =
		'From then on, every memory taken with M → Take a memory, or AFK, goes to your private gallery on its own. Any other: M → My memories → Send this memory.'
	expect(translate('fr', earlier)).toContain('M → Prendre un souvenir, ou en AFK')
	expect(translate('fr', earlier)).toContain('M → Mes souvenirs → Envoyer ce souvenir')
	expect(translate('fr-CA', earlier)).toContain('M → Mes souvenirs → Envoyer cette capture')
	expect(translate('en-GB', earlier)).toContain('M → My memories → Send this capture')
	expect(translate('de', earlier)).toContain('M → Meine Erinnerungen → Diese Aufnahme senden')
})

test('privacy page explains mod diagnostics and download requests and keeps the web consent control', () => {
	vi.stubEnv('VITE_WEB_DIAGNOSTICS_DSN', 'https://public@ingest.example/12')
	try {
		mountEnglish(<LegalPage kind="privacy" />)
		expect(screen.getByRole('heading', { name: 'Diagnostics in the Minecraft mod' })).toBeTruthy()
		const text = document.body.textContent ?? ''
		expect(text).toContain('nothing is ever sent before you pair the game')
		expect(text).toContain('at most eight pending reports, for at most seven days')
		expect(text).toContain('M → Settings → Privacy → Diagnostics')
		expect(screen.getByRole('heading', { name: 'Mod download list' })).toBeTruthy()
		expect(text).toContain('which receives your IP address like any request to the service')
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
	expect(text).toContain('chaque souvenir, à la main ou AFK, est envoyé tout seul dans ta galerie')
	expect(text).toContain('qui reçoit ton adresse IP comme pour toute requête au service')
	// No internal deployment notes reach the public page.
	expect(text).not.toMatch(/Sentry|27 octobre|doivent être documentées|avant activation/)
})

test('the legal page is titled as a legal notice and leaves out internal launch notes', () => {
	renderUi(
		<I18nProvider initialLocale="fr">
			<MemoryRouter>
				<LegalPage kind="legal" />
			</MemoryRouter>
		</I18nProvider>
	)
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mentions légales')
	const text = document.body.textContent ?? ''
	expect(text).toContain('Le code source est public sur GitHub ; le mod se télécharge sur la page Téléchargements.')
	expect(text).not.toMatch(/lancement commercial|versions du mod sont disponibles dans le dépôt/)
})
