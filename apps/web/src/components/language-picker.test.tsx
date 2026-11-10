// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { translate } from '../i18n/catalog'
import { LanguagePicker } from './LanguagePicker'

const i18n = vi.hoisted(() => ({
	locale: 'fr' as string,
	pendingLocale: null as string | null,
	localeError: false,
	setLocale: vi.fn(),
}))
vi.mock('../i18n/I18n', () => ({
	useI18n: () => ({ ...i18n, t: (message: string) => translate('en', message) }),
}))

afterEach(() => {
	cleanup()
	i18n.locale = 'fr'
	i18n.pendingLocale = null
	i18n.localeError = false
	i18n.setLocale.mockReset()
})

const button = () => screen.getByRole('button', { name: /^Language / })
const list = () => screen.getByRole('listbox', { name: 'Language' })
const active = () => document.getElementById(list().getAttribute('aria-activedescendant') ?? '')?.textContent

test('the button names the language in its own words and opens a list of all eleven, the current one checked', () => {
	render(<LanguagePicker />)
	expect(button().getAttribute('aria-haspopup')).toBe('listbox')
	expect(button().getAttribute('aria-expanded')).toBe('false')
	expect(within(button()).getByText('Français (FR)').getAttribute('lang')).toBe('fr-FR')
	expect(screen.queryByRole('listbox')).toBeNull()
	fireEvent.click(button())
	expect(button().getAttribute('aria-expanded')).toBe('true')
	const options = within(list()).getAllByRole('option')
	// by each language's own name, its regions together (lib/locale-picker.ts)
	expect(options.map(option => option.textContent)).toEqual([
		'Deutsch',
		'English (US)',
		'English (UK)',
		'English (CA)',
		'Français (FR)',
		'Français (CA)',
		'Polski',
		'Português (BR)',
		'Русский',
		'日本語',
		'한국어',
	])
	expect(within(list()).getByRole('option', { selected: true }).textContent).toBe('Français (FR)')
	expect(document.activeElement).toBe(list())
	expect(active()).toBe('Français (FR)')
	// a click on the button again closes it; a click on a language picks it and gives the focus back
	fireEvent.click(button())
	expect(screen.queryByRole('listbox')).toBeNull()
	fireEvent.click(button())
	fireEvent.pointerMove(within(list()).getByRole('option', { name: 'Polski' }))
	expect(active()).toBe('Polski')
	fireEvent.click(within(list()).getByRole('option', { name: 'Polski' }))
	expect(i18n.setLocale).toHaveBeenCalledWith('pl')
	expect(screen.queryByRole('listbox')).toBeNull()
	expect(document.activeElement).toBe(button())
})

test('the keyboard: arrows, Home, End, typeahead, Enter, Space, Escape and Tab', () => {
	const now = vi.spyOn(Date, 'now')
	const typeAt = (key: string, at: number, ctrlKey = false) => {
		now.mockReturnValue(at)
		fireEvent.keyDown(list(), { key, ctrlKey })
	}
	render(<LanguagePicker />)
	fireEvent.keyDown(button(), { key: 'Enter' })
	expect(screen.queryByRole('listbox')).toBeNull()
	fireEvent.keyDown(button(), { key: 'ArrowDown' })
	expect(active()).toBe('Français (FR)')
	fireEvent.keyDown(list(), { key: 'ArrowDown' })
	expect(active()).toBe('Français (CA)')
	fireEvent.keyDown(list(), { key: 'End' })
	expect(active()).toBe('한국어')
	fireEvent.keyDown(list(), { key: 'ArrowDown' })
	expect(active()).toBe('Deutsch')
	fireEvent.keyDown(list(), { key: 'ArrowUp' })
	expect(active()).toBe('한국어')
	fireEvent.keyDown(list(), { key: 'Home' })
	expect(active()).toBe('Deutsch')
	// typeahead: one letter cycles, a quick word narrows, a later key starts again; modified keys and other keys are ignored
	typeAt('e', 1000)
	expect(active()).toBe('English (US)')
	typeAt('e', 1100)
	expect(active()).toBe('English (UK)')
	typeAt('f', 3000)
	expect(active()).toBe('Français (FR)')
	typeAt('r', 3100)
	expect(active()).toBe('Français (FR)')
	typeAt('x', 6000)
	expect(active()).toBe('Français (FR)')
	typeAt('p', 9000, true)
	fireEvent.keyDown(list(), { key: 'F5' })
	expect(active()).toBe('Français (FR)')
	typeAt('p', 12000)
	expect(active()).toBe('Polski')
	typeAt('p', 12100)
	expect(active()).toBe('Português (BR)')
	fireEvent.keyDown(list(), { key: ' ' })
	expect(i18n.setLocale).toHaveBeenCalledWith('pt-BR')
	// Enter on the current language changes nothing; Escape and Tab close
	fireEvent.keyDown(button(), { key: 'ArrowUp' })
	fireEvent.keyDown(list(), { key: 'Enter' })
	expect(i18n.setLocale).toHaveBeenCalledTimes(1)
	fireEvent.keyDown(button(), { key: 'ArrowDown' })
	fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
	expect(screen.queryByRole('listbox')).toBeNull()
	expect(document.activeElement).toBe(button())
	// Tab goes on from the button, as if the list had never opened
	fireEvent.keyDown(button(), { key: 'ArrowDown' })
	fireEvent.keyDown(list(), { key: 'Tab' })
	expect(screen.queryByRole('listbox')).toBeNull()
	expect(document.activeElement).toBe(button())
})

test('the bar’s compact button adds the language’s code; its name stays the accessible one', () => {
	render(<LanguagePicker compact />)
	expect(button().querySelector('.mm-lang__code')?.textContent).toBe('FR')
	expect(button().querySelector('.mm-lang__code')?.getAttribute('aria-hidden')).toBe('true')
	expect(button().getAttribute('aria-labelledby')).toMatch(/-value$/)
})

test('the keys of an open list stop there: the landing film never reads them', () => {
	const onKey = vi.fn()
	window.addEventListener('keydown', onKey)
	render(<LanguagePicker />)
	fireEvent.keyDown(button(), { key: 'ArrowDown' })
	for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End', 'k', 'Escape'])
		fireEvent.keyDown(document.activeElement as HTMLElement, { key })
	expect(onKey).not.toHaveBeenCalled()
	window.removeEventListener('keydown', onKey)
})

test('a press outside closes the list without moving the focus', () => {
	render(
		<>
			<LanguagePicker />
			<p>Outside</p>
		</>
	)
	fireEvent.click(button())
	fireEvent.pointerDown(within(list()).getAllByRole('option')[0] as HTMLElement)
	expect(screen.getByRole('listbox')).toBeTruthy()
	fireEvent.pointerDown(screen.getByText('Outside'))
	expect(screen.queryByRole('listbox')).toBeNull()
	expect(document.activeElement).not.toBe(button())
})

test('a language being loaded keeps the button busy on it; a failed one says so', () => {
	i18n.pendingLocale = 'ja'
	i18n.localeError = true
	render(<LanguagePicker className="extra" />)
	expect(button().getAttribute('aria-busy')).toBe('true')
	expect(button().textContent).toContain('日本語')
	expect(screen.getByRole('alert').textContent).toBe('Could not load this language. Select it again to retry.')
	expect(button().closest('.mm-lang')?.className).toBe('mm-lang extra')
})
