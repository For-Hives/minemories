// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { SiteSelect } from './SiteSelect'

afterEach(cleanup)

const fruits = [
	{ value: 'apple', label: 'Apple' },
	{ value: 'banana', label: 'Banana' },
	{ value: 'blueberry', label: 'Blueberry' },
	{ value: 'cherry', label: 'Cherry' },
] as const
type Fruit = (typeof fruits)[number]['value']

function Picker({
	onChange = () => undefined,
	disabled = false,
}: {
	onChange?: (value: Fruit) => void
	disabled?: boolean
}) {
	const [value, setValue] = useState<Fruit>('banana')
	return (
		<form data-testid="form">
			<SiteSelect
				name="fruit"
				label="Fruit"
				value={value}
				options={fruits}
				disabled={disabled}
				onChange={next => {
					onChange(next)
					setValue(next)
				}}
			/>
			<button type="button">After</button>
		</form>
	)
}

const button = () => screen.getByRole('button', { name: /^Fruit / })
const list = () => screen.getByRole('listbox', { name: 'Fruit' })
const active = () => document.getElementById(list().getAttribute('aria-activedescendant') ?? '')?.textContent

test('a stone button named by its label and its value opens the choices, the current one checked', () => {
	const onChange = vi.fn()
	render(<Picker onChange={onChange} />)
	expect(button().getAttribute('aria-haspopup')).toBe('listbox')
	expect(button().getAttribute('aria-expanded')).toBe('false')
	expect(button().className).toContain('mc-btn')
	expect(button().textContent).toBe('Banana')
	expect(screen.queryByRole('listbox')).toBeNull()
	fireEvent.click(button())
	expect(button().getAttribute('aria-expanded')).toBe('true')
	expect(
		within(list())
			.getAllByRole('option')
			.map(option => option.textContent)
	).toEqual(['Apple', 'Banana', 'Blueberry', 'Cherry'])
	expect(within(list()).getByRole('option', { selected: true }).textContent).toBe('Banana')
	expect(document.activeElement).toBe(list())
	expect(active()).toBe('Banana')
	// The button closes it again; picking the current value changes nothing.
	fireEvent.click(button())
	expect(screen.queryByRole('listbox')).toBeNull()
	fireEvent.click(button())
	fireEvent.click(within(list()).getByRole('option', { name: 'Banana' }))
	expect(onChange).not.toHaveBeenCalled()
	expect(document.activeElement).toBe(button())
	// A pointer moves the highlight; a click picks, closes and gives the focus back.
	fireEvent.click(button())
	fireEvent.pointerMove(within(list()).getByRole('option', { name: 'Cherry' }))
	expect(active()).toBe('Cherry')
	fireEvent.click(within(list()).getByRole('option', { name: 'Cherry' }))
	expect(onChange).toHaveBeenCalledWith('cherry')
	expect(screen.queryByRole('listbox')).toBeNull()
	expect(document.activeElement).toBe(button())
	expect(button().textContent).toBe('Cherry')
	// A surrounding form reads the value from the hidden field.
	expect(new FormData(screen.getByTestId('form') as HTMLFormElement).get('fruit')).toBe('cherry')
})

test('the keyboard: arrows, Home, End, typeahead, Enter, Space, Escape and Tab', () => {
	const now = vi.spyOn(Date, 'now')
	const typeAt = (key: string, at: number, ctrlKey = false) => {
		now.mockReturnValue(at)
		fireEvent.keyDown(list(), { key, ctrlKey })
	}
	const onChange = vi.fn()
	render(<Picker onChange={onChange} />)
	fireEvent.keyDown(button(), { key: 'Enter' })
	expect(screen.queryByRole('listbox')).toBeNull()
	fireEvent.keyDown(button(), { key: 'ArrowUp' })
	expect(active()).toBe('Banana')
	fireEvent.keyDown(list(), { key: 'ArrowDown' })
	expect(active()).toBe('Blueberry')
	fireEvent.keyDown(list(), { key: 'End' })
	expect(active()).toBe('Cherry')
	fireEvent.keyDown(list(), { key: 'ArrowDown' })
	expect(active()).toBe('Apple')
	fireEvent.keyDown(list(), { key: 'Home' })
	expect(active()).toBe('Apple')
	// Typeahead: letters typed together find a choice; a repeated letter cycles; a modifier key types nothing.
	typeAt('b', 1000)
	expect(active()).toBe('Banana')
	typeAt('l', 1100)
	expect(active()).toBe('Blueberry')
	typeAt('b', 3000)
	expect(active()).toBe('Banana')
	typeAt('b', 3100)
	expect(active()).toBe('Blueberry')
	typeAt('z', 5000)
	expect(active()).toBe('Blueberry')
	typeAt('c', 7000, true)
	expect(active()).toBe('Blueberry')
	fireEvent.keyDown(list(), { key: 'Shift' })
	expect(active()).toBe('Blueberry')
	fireEvent.keyDown(list(), { key: 'Enter' })
	expect(onChange).toHaveBeenLastCalledWith('blueberry')
	expect(document.activeElement).toBe(button())
	fireEvent.keyDown(button(), { key: 'ArrowDown' })
	fireEvent.keyDown(list(), { key: 'ArrowUp' })
	fireEvent.keyDown(list(), { key: ' ' })
	expect(onChange).toHaveBeenLastCalledWith('banana')
	// Escape closes it and gives the focus back; Tab closes it and leaves from the button.
	fireEvent.click(button())
	fireEvent.keyDown(list(), { key: 'Escape' })
	expect(screen.queryByRole('listbox')).toBeNull()
	expect(document.activeElement).toBe(button())
	fireEvent.click(button())
	fireEvent.keyDown(list(), { key: 'Tab' })
	expect(screen.queryByRole('listbox')).toBeNull()
	expect(document.activeElement).toBe(button())
	now.mockRestore()
})

test('a press outside closes the list without moving the focus; a disabled control stays shut', () => {
	const { rerender } = render(<Picker />)
	fireEvent.click(button())
	fireEvent.pointerDown(within(list()).getByRole('option', { name: 'Apple' }))
	expect(screen.getByRole('listbox')).toBeTruthy()
	fireEvent.pointerDown(screen.getByRole('button', { name: 'After' }))
	expect(screen.queryByRole('listbox')).toBeNull()
	fireEvent.click(button())
	rerender(<Picker disabled />)
	expect(screen.queryByRole('listbox')).toBeNull()
	expect(button().hasAttribute('disabled')).toBe(true)
})

test('without a name there is no hidden field, and an unknown value shows the first choice', () => {
	render(
		<form data-testid="bare">
			<SiteSelect label="Fruit" value={'kiwi' as Fruit} options={fruits} onChange={() => undefined} className="extra" />
		</form>
	)
	expect(button().textContent).toBe('Apple')
	expect(button().closest('.mm-select')?.classList.contains('extra')).toBe(true)
	expect(screen.getByTestId('bare').querySelector('input')).toBeNull()
})
