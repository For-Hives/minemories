// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { SharingPage } from '../pages/SharingPage'
import { RadiusMap, SeasonDemo, ShareDemo } from './diagrams'
import { Command, TabPanel, type TabSpec, TabStrip } from './explainers'

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

type Id = 'a' | 'b' | 'c'
const tabs: Array<TabSpec<Id>> = [
	{ id: 'a', label: 'Alpha', glyph: 'home' },
	{ id: 'b', label: 'Beta', glyph: 'cube' },
	{ id: 'c', label: 'Gamma', glyph: 'link' },
]
function Tabs() {
	const [value, setValue] = useState<Id>('a')
	return (
		<>
			<TabStrip base="t" label="Letters" tabs={tabs} value={value} onChange={setValue} />
			{tabs.map(tab => (
				<TabPanel key={tab.id} base="t" id={tab.id} active={tab.id === value}>
					Panel {tab.id}
				</TabPanel>
			))}
		</>
	)
}

test('tabs follow the arrow keys, wrap around, and only show the selected panel', () => {
	english(<Tabs />)
	const list = screen.getByRole('tablist', { name: 'Letters' })
	const selected = () => screen.getByRole('tab', { selected: true }).textContent
	expect(selected()).toBe('Alpha')
	expect(screen.getByRole('tabpanel').textContent).toBe('Panel a')
	fireEvent.keyDown(list, { key: 'ArrowRight' })
	expect(selected()).toBe('Beta')
	expect(document.activeElement?.textContent).toBe('Beta')
	fireEvent.keyDown(list, { key: 'End' })
	expect(selected()).toBe('Gamma')
	fireEvent.keyDown(list, { key: 'ArrowRight' })
	expect(selected()).toBe('Alpha')
	fireEvent.keyDown(list, { key: 'ArrowLeft' })
	expect(selected()).toBe('Gamma')
	fireEvent.keyDown(list, { key: 'Home' })
	expect(selected()).toBe('Alpha')
	fireEvent.keyDown(list, { key: 'x' })
	expect(selected()).toBe('Alpha')
	fireEvent.click(screen.getByRole('tab', { name: 'Gamma' }))
	expect(screen.getByRole('tabpanel').textContent).toBe('Panel c')
	expect(document.querySelectorAll('[role="tabpanel"][hidden]')).toHaveLength(2)
})

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
	const revoke = screen.getByRole('button', { name: 'Revoke the link' })
	expect(screen.getByText('Only you can see it.')).toBeTruthy()
	expect(revoke.hasAttribute('disabled')).toBe(true)
	fireEvent.click(create)
	expect(screen.getByText('Anyone with the link can see it.')).toBeTruthy()
	expect(create.hasAttribute('disabled')).toBe(true)
	fireEvent.click(revoke)
	expect(screen.getByText('Link revoked. Copies already saved stay.')).toBeTruthy()
})

test('closing the server darkens one copy while the memory stays', () => {
	english(<SeasonDemo />)
	expect(screen.getByText('Online')).toBeTruthy()
	const button = screen.getByRole('button', { name: 'Close the server' })
	fireEvent.click(button)
	expect(screen.getByText('Closed')).toBeTruthy()
	expect(screen.getByText('Still here')).toBeTruthy()
	expect(button.getAttribute('aria-pressed')).toBe('true')
	fireEvent.click(screen.getByRole('button', { name: 'Reopen the server' }))
	expect(screen.getByText('Online')).toBeTruthy()
})

test('the sharing page carries the demo', () => {
	english(<SharingPage />, '/sharing')
	expect(screen.getByRole('button', { name: 'Create a link' })).toBeTruthy()
	expect(screen.getByRole('link', { name: 'My private gallery' })).toBeTruthy()
	// The public gallery is live: no note may still announce it as coming.
	expect(document.body.textContent).not.toContain('in preparation')
})
