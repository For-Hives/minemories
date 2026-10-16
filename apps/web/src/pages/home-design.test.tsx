// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { HomePage } from './HomePage'

const context = vi.hoisted(() => ({ session: null as null | { user: { name: string } } }))
vi.mock('../app-context', () => ({ useAppContext: () => context }))
afterEach(() => {
	cleanup()
	context.session = null
})
function mount(locale: 'fr' | 'en' = 'fr') {
	render(
		<MemoryRouter>
			<I18nProvider initialLocale={locale}>
				<HomePage />
			</I18nProvider>
		</MemoryRouter>
	)
}
test('the illustrated memory changes lighting without starting a viewer or navigating', () => {
	mount()
	const scene = screen.getByRole('region', { name: 'Un souvenir, trois lumières' })
	expect(scene.getAttribute('data-light')).toBe('golden')
	for (const [label, value] of [
		['Nuit', 'night'],
		['Matin', 'morning'],
		['Heure dorée', 'golden'],
	] as const) {
		const button = screen.getByRole('button', { name: label })
		fireEvent.click(button)
		expect(button.getAttribute('aria-pressed')).toBe('true')
		expect(scene.getAttribute('data-light')).toBe(value)
		expect(scene.querySelectorAll('[aria-pressed="true"]').length).toBe(1)
	}
	expect(screen.getByRole('link', { name: /Commencer mon album/ }).getAttribute('href')).toBe('/register')
	expect(screen.getByRole('link', { name: /Explorer les souvenirs de la communauté/ }).getAttribute('href')).toBe(
		'/explorer'
	)
	expect(document.querySelector('canvas')).toBeNull()
})
test('signed-in visitors return to their gallery and the complete proposal is localized', () => {
	context.session = { user: { name: 'Alex' } }
	mount('en')
	expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('It was our whole world.')
	expect(screen.getByRole('link', { name: /Find my memories/ }).getAttribute('href')).toBe('/gallery')
	expect(screen.getByRole('link', { name: /Explore the demo memories/ }).getAttribute('href')).toBe('/explorer?demo=1')
	expect(screen.getByRole('button', { name: 'Golden hour' }).getAttribute('aria-pressed')).toBe('true')
})
