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
				<Route path="/fonctionnement" element={<HowItWorksPage />} />
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
	expect(screen.getByText('/minemories export 16')).toBeTruthy()
	expect(screen.getByText(/Les captures AFK sont actives par défaut/)).toBeTruthy()
	fireEvent.click(screen.getByRole('link', { name: 'Installe le mod' }))
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Installer le mod Minemories')
	expect(screen.getByRole('button', { name: '1.21.1' })).toBeTruthy()
	expect(screen.getByRole('button', { name: /Télécharger le mod/ })).toBeTruthy()
	expect(screen.getByText('0 / 6 étapes cochées')).toBeTruthy()
	const faqLink = screen.getAllByRole('link', { name: 'FAQ' }).at(0)
	if (!faqLink) throw new Error('FAQ navigation is missing')
	fireEvent.click(faqLink)
	expect(screen.getByRole('heading', { name: 'Qui peut voir les souvenirs de mon enfant ?' })).toBeTruthy()
	expect(screen.getByRole('heading', { name: 'Dois-je installer quelque chose sur le serveur ?' })).toBeTruthy()
	fireEvent.click(screen.getByRole('link', { name: 'Toutes les étapes pour capturer, envoyer et partager' }))
	expect(screen.getByRole('heading', { name: '5. Partager seulement ce que tu choisis' })).toBeTruthy()
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
	for (const label of ['“Connect”', '“Take a memory”', 'M → My memories', '“Auto memories”', 'M → Settings → Account'])
		expect(howTo).toContain(label)
	expect(howTo).toContain('M → Settings → Memories → Auto captures, “Captured depth”')
	expect(howTo).toContain('“Official address”')
	cleanup()
	mountEnglish(<FaqPage />)
	const faq = document.querySelector('article')?.textContent ?? ''
	expect(faq).not.toMatch(outdatedMenu)
	expect(faq).toContain('M → My memories lists dated captures')
	expect(faq).toContain('with NeoForge, Fabric or Forge and Minemories; Quilt uses the Fabric JAR')
	expect(faq).not.toContain('NeoForge 21.1.248')
})

test('the first memory step names the in-game button and the loader note points to other JARs', () => {
	mountEnglish(<InstallationStep step={5} system="linux" target={targetFor('1.21.1', 'neoforge')} />)
	expect(screen.getByText('Take a memory')).toBeTruthy()
	expect(document.body.textContent).toContain('You can turn them off with “Auto memories” in M.')
	cleanup()
	mountEnglish(<InstallationStep step={0} system="linux" target={targetFor('1.21.1', 'neoforge')} />)
	expect(document.body.textContent).toContain('Every published version, and the Quilt note, are on')
	expect(screen.getByRole('link', { name: 'Mod versions' }).getAttribute('href')).toBe('/versions')
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
	expect(text).toContain('rien n’est jamais envoyé avant d’avoir appairé le jeu')
	expect(text).toContain('qui reçoit ton adresse IP comme pour toute requête au service')
})
