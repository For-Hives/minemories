// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { SharingPage } from '../pages/SharingPage'
import { RadiusMap, ShareDemo } from './diagrams'
import { Command } from './explainers'

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

function english(ui: React.ReactNode, path = '/') {
	return render(
		<I18nProvider initialLocale="en">
			<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
		</I18nProvider>
	)
}

test('a command copies itself and says so, and stays quiet when the clipboard is blocked', async () => {
	const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('blocked'))
	vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
	english(<Command text="/minemories upload" />)
	fireEvent.click(screen.getByRole('button', { name: 'Copy : /minemories upload' }))
	await screen.findByText('Copied')
	expect(writeText).toHaveBeenCalledWith('/minemories upload')
	fireEvent.click(screen.getByRole('button', { name: 'Copy : /minemories upload' }))
	await vi.waitFor(() => expect(screen.queryByText('Copied')).toBeNull())
})

test('the radius map grows the command, the square and a warning for a large area', () => {
	english(<RadiusMap />)
	expect(screen.getByText('/minemories export 16')).toBeTruthy()
	expect(screen.getByRole('img', { name: '33 × 33' })).toBeTruthy()
	const warning = screen.getByText('A large area can slow the game.').closest('p')
	expect(warning?.hidden).toBe(true)
	fireEvent.change(screen.getByRole('slider', { name: 'Radius in blocks' }), { target: { value: '100' } })
	expect(screen.getByText('/minemories export 100')).toBeTruthy()
	expect(screen.getByRole('img', { name: '201 × 201' })).toBeTruthy()
	expect(warning?.hidden).toBe(false)
})

test('the sharing demo walks from private to a link to a revoked link', () => {
	english(<ShareDemo />)
	const create = screen.getByRole('button', { name: 'Create a link' })
	const revoke = screen.getByRole('button', { name: 'Stop sharing' })
	expect(screen.getByText('Only you can see it.')).toBeTruthy()
	expect(revoke.hasAttribute('disabled')).toBe(true)
	fireEvent.click(create)
	expect(screen.getByText('Anyone with the link can see it.')).toBeTruthy()
	expect(create.hasAttribute('disabled')).toBe(true)
	fireEvent.click(revoke)
	expect(screen.getByText('Link revoked. Copies already saved stay.')).toBeTruthy()
})

test('the sharing page carries the demo', () => {
	english(<SharingPage />, '/sharing')
	expect(screen.getByRole('button', { name: 'Create a link' })).toBeTruthy()
	expect(screen.getByRole('link', { name: 'My private gallery' })).toBeTruthy()
	// The public gallery is live: no note may still announce it as coming.
	expect(document.body.textContent).not.toContain('in preparation')
})
