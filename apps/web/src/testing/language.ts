import { fireEvent, screen, within } from '@testing-library/react'
import { localeOptions } from '../i18n/locales'

/** Picks a language in the bar's picker as a visitor does: its button (named "<label> <current language>"), then the language's own name in the list. */
export function chooseLanguage(label: string, id: string) {
	fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label} `) }))
	const list = screen.getByRole('listbox', { name: label })
	const name = localeOptions.find(option => option.id === id)?.label ?? id
	fireEvent.click(within(list).getByRole('option', { name }))
}
