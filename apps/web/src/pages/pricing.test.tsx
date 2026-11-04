// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { quoteStorageKey } from '../content/pricing'
import { I18nProvider } from '../i18n/I18n'
import { PricingPage } from './PricingPage'

beforeEach(() => localStorage.clear())
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})
function pricing() {
	return render(
		<I18nProvider>
			<MemoryRouter>
				<PricingPage />
			</MemoryRouter>
		</I18nProvider>
	)
}
test('calculator updates quantities, projection and cloud choice, then saves and restores without purchase', () => {
	const mounted = pricing()
	expect(screen.getByRole('status', { name: 'Total estimé' }).textContent).toBe('20 €')
	fireEvent.change(screen.getByRole('spinbutton', { name: 'Nombre de snapshots' }), { target: { value: '3' } })
	fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } })
	expect(screen.getByRole('status', { name: 'Total estimé' }).textContent).toBe('69 €')
	fireEvent.click(screen.getByRole('checkbox'))
	expect(screen.getByRole('status', { name: 'Total estimé' }).textContent).toBe('6 €')
	expect(screen.queryByRole('list', { name: 'Échéancier annuel' })).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Garder cette estimation' }))
	expect(screen.getByText('Estimation gardée sur cet appareil. Aucun achat effectué.')).toBeTruthy()
	expect(JSON.parse(localStorage.getItem(quoteStorageKey) ?? '{}')).toEqual({ snapshots: 3, years: 5, cloud: false })
	mounted.unmount()
	pricing()
	expect(screen.getByRole('spinbutton').getAttribute('value')).toBe('3')
	expect(screen.getByRole('status', { name: 'Total estimé' }).textContent).toBe('6 €')
})
test('invalid input cannot be saved and blocked browser storage does not break the estimate', () => {
	pricing()
	fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
	expect(screen.getByRole('alert').textContent).toContain('entre 1 et 100')
	expect(screen.getByRole('button', { name: 'Garder cette estimation' }).hasAttribute('disabled')).toBe(true)
	fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('Storage blocked')
	})
	fireEvent.click(screen.getByRole('button', { name: 'Garder cette estimation' }))
	expect(screen.getByText('Le navigateur ne permet pas l’enregistrement. L’estimation reste affichée.')).toBeTruthy()
	expect(screen.getByRole('status', { name: 'Total estimé' }).textContent).toBe('40 €')
})
