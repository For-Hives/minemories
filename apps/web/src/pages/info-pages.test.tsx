// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ConceptPage, FaqPage, HowItWorksPage, InfoNavigation, InstallationPage } from './InfoPages'

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
	for (const [name, target] of [
		['Avec CurseForge', 'curseforge'],
		['Avec Modrinth', 'modrinth'],
		['Manuellement', 'manuel'],
	] as const) {
		const link = screen.getByRole('link', { name })
		expect(link.getAttribute('href')).toBe(`#${target}`)
		expect(document.getElementById(target)?.tagName).toBe('H2')
	}
	expect(screen.getByText('Minecraft Java Edition 1.21.1 + NeoForge 21.1.248')).toBeTruthy()
	expect(screen.getByRole('heading', { name: 'Télécharger le mod' })).toBeTruthy()
	const faqLink = screen.getAllByRole('link', { name: 'FAQ' }).at(0)
	if (!faqLink) throw new Error('FAQ navigation is missing')
	fireEvent.click(faqLink)
	expect(screen.getByRole('heading', { name: 'Qui peut voir les souvenirs de mon enfant ?' })).toBeTruthy()
	expect(screen.getByRole('heading', { name: 'Dois-je installer quelque chose sur le serveur ?' })).toBeTruthy()
	fireEvent.click(screen.getByRole('link', { name: 'Toutes les étapes pour capturer, envoyer et partager' }))
	expect(screen.getByRole('heading', { name: '5. Partager seulement ce que tu choisis' })).toBeTruthy()
})
