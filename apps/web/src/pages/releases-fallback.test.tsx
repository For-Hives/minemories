// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { ReleasesPage } from './ReleasesPage'

// A release whose notes are not translated yet: a new notes file reaches the site before its catalogue entries.
vi.mock('./release-history', () => ({
	releases: [
		{
			version: '9.0.0',
			notes: [
				{ type: 'feature', text: 'A note nobody has translated yet.', pr: null },
				{ type: 'fix', text: '"Where is my code?" opens the gallery on the live site again.', pr: 206 },
			],
		},
	],
}))

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

test('an untranslated note is shown in English and marked as such; a translated one is not', () => {
	vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)))
	render(
		<I18nProvider initialLocale="fr">
			<MemoryRouter>
				<ReleasesPage />
			</MemoryRouter>
		</I18nProvider>
	)
	const untranslated = screen.getByText('Nouveau : A note nobody has translated yet.')
	expect(untranslated.getAttribute('lang')).toBe('en')
	const translated = screen.getByText(
		'Corrigé : « Où trouver mon code ? » ouvre de nouveau la galerie sur le site en ligne.'
	)
	expect(translated.getAttribute('lang')).toBeNull()
	expect(screen.queryByRole('heading', { name: 'Versions précédentes' })).toBeNull()
})
