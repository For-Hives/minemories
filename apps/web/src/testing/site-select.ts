import { fireEvent, screen, within } from '@testing-library/react'

/** The button of the site dropdown (SiteSelect) whose label reads exactly `label`. */
export function selectButton(label: string): HTMLButtonElement {
	const name = screen.getByText(label, { selector: '.mm-select__label' })
	const button = name.closest('.mm-select')?.querySelector('button')
	if (!button) throw new Error(`No dropdown labelled ${label}`)
	return button
}

/** Opens the site dropdown labelled `label` and picks the choice named `option`, as a pointer would. */
export function chooseOption(label: string, option: string) {
	fireEvent.click(selectButton(label))
	fireEvent.click(within(screen.getByRole('listbox', { name: label })).getByRole('option', { name: option }))
}
