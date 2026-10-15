// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { ExplorerPage, GalleryPreview, MarketingPage } from './DiscoveryPages'

beforeEach(() => {
	localStorage.clear()
	if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined
	vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
})
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})
function gallery(path = '/explorer', ranking = false) {
	return render(
		<I18nProvider>
			<MemoryRouter initialEntries={[path]}>
				<GalleryPreview ranking={ranking} />
			</MemoryRouter>
		</I18nProvider>
	)
}
test('search, themes, favorites and empty states work without an account and restore on revisit', () => {
	const mounted = gallery()
	fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'jardin' } })
	expect(screen.getAllByRole('article')).toHaveLength(1)
	fireEvent.click(screen.getByRole('button', { name: 'Favori : Le jardin des détours' }))
	fireEvent.click(screen.getByRole('button', { name: 'Mes favoris (1)' }))
	fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'maison' } })
	expect(screen.getByText('Aucun lieu pour ces filtres.')).toBeTruthy()
	mounted.unmount()
	gallery()
	expect(screen.getByRole('button', { name: 'Favori : Le jardin des détours' }).getAttribute('aria-pressed')).toBe(
		'true'
	)
	fireEvent.change(screen.getByRole('combobox', { name: 'Thème' }), { target: { value: 'village' } })
	expect(screen.getAllByRole('article')).toHaveLength(1)
	fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser la démo' }))
	expect(screen.getAllByRole('article')).toHaveLength(3)
	expect(screen.getByRole('button', { name: 'Mes favoris (0)' })).toBeTruthy()
})
test('ranking votes add once, can be removed and remain local', () => {
	gallery('/classement', true)
	const first = screen.getAllByRole('article')[0]
	if (!first) throw new Error('Demo has no entries')
	expect(within(first).getByRole('heading').textContent).toBe('Le village au bord de l’eau')
	const button = screen.getByRole('button', { name: 'Coup de cœur : Notre première maison' })
	fireEvent.click(button)
	expect(button.textContent).toContain('25')
	expect(button.getAttribute('aria-pressed')).toBe('true')
	fireEvent.click(button)
	expect(button.textContent).toContain('24')
	expect(button.getAttribute('aria-pressed')).toBe('false')
})
test('a demo link opens its memory, copies a real URL and provides a fallback when clipboard is unavailable', async () => {
	const writeText = vi.fn().mockResolvedValue(undefined)
	vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
	gallery('/explorer?souvenir=premiere-maison')
	expect(screen.getByRole('region', { name: 'Aperçu du souvenir' })).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Copier le lien de la démo' }))
	await screen.findByText('Lien copié')
	expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/explorer?souvenir=premiere-maison`)
	writeText.mockRejectedValueOnce(new Error('Clipboard blocked'))
	fireEvent.click(screen.getByRole('button', { name: 'Copier le lien de la démo' }))
	await screen.findByText('Sélectionne le lien pour le copier')
	fireEvent.click(screen.getByRole('button', { name: 'Fermer l’aperçu' }))
	expect(screen.queryByRole('region', { name: 'Aperçu du souvenir' })).toBeNull()
	vi.unstubAllGlobals()
})
test('nostalgia timeline updates its illustration and new journeys can be read in English', async () => {
	render(
		<I18nProvider>
			<MemoryRouter initialEntries={['/nostalgie']}>
				<MarketingPage />
			</MemoryRouter>
		</I18nProvider>
	)
	fireEvent.change(screen.getByRole('slider', { name: 'Moment du souvenir' }), { target: { value: '3' } })
	expect(screen.getByRole('img', { name: 'Un petit village' })).toBeTruthy()
	cleanup()
	localStorage.setItem('minemories-locale', 'en')
	render(
		<I18nProvider>
			<MemoryRouter initialEntries={['/explorer?demo=1']}>
				<ExplorerPage />
			</MemoryRouter>
		</I18nProvider>
	)
	await waitFor(() =>
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('A little visit, just to see.')
	)
	expect(screen.getByRole('searchbox', { name: 'Search places' })).toBeTruthy()
})
