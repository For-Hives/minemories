// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { ArticlePage } from '../pages/ContentPages'
import { MarketingPage } from '../pages/DiscoveryPages'
import { FaqPage } from '../pages/InfoPages'
import { Pipeline, RadiusMap, SeasonDemo, ShareDemo } from './diagrams'
import { Command, TabPanel, type TabSpec, TabStrip, verdictLabel } from './explainers'

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

test('a pipeline names the selected box in one line and falls back to its first box', () => {
	english(
		<Pipeline
			nodes={[
				{ id: 'one', glyph: 'code', label: 'Mod', point: 'Source you can inspect' },
				{ id: 'two', glyph: 'cube', label: 'GLB', point: 'An open 3D format', extra: <a href="/x">More</a> },
			]}
		/>
	)
	const status = screen.getByRole('status')
	expect(status.textContent).toBe('Source you can inspect')
	fireEvent.click(screen.getByRole('button', { name: 'GLB' }))
	expect(within(status).getByText('An open 3D format')).toBeTruthy()
	expect(within(status).getByRole('link', { name: 'More' })).toBeTruthy()
	expect(screen.getByRole('button', { name: 'GLB' }).getAttribute('aria-pressed')).toBe('true')
})

test('the open source page lets a visitor pick each piece of the chain', () => {
	english(<MarketingPage />, '/open-source')
	expect(screen.getByRole('link', { name: /GitHub/ })).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Your computer' }))
	expect(screen.getByText('Files that stay yours')).toBeTruthy()
	expect(screen.getByRole('link', { name: 'Read the documentation' })).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'GLB' }))
	expect(screen.getByText('An open 3D format')).toBeTruthy()
})

test('the sharing page carries the demo, and the nostalgia stops move the timeline', () => {
	english(<MarketingPage />, '/sharing')
	expect(screen.getByRole('button', { name: 'Create a link' })).toBeTruthy()
	expect(screen.getByRole('link', { name: 'My private gallery' })).toBeTruthy()
	// The public gallery is live: no note may still announce it as coming.
	expect(document.body.textContent).not.toContain('in preparation')
	cleanup()
	english(<MarketingPage />, '/nostalgia')
	fireEvent.click(screen.getByRole('button', { name: 'The first evenings' }))
	expect(screen.getByRole('slider', { name: 'Memory moment' }).getAttribute('aria-valuetext')).toBe(
		'The first evenings'
	)
	expect(screen.getByRole('img', { name: 'The first evenings' })).toBeTruthy()
})

test('the FAQ shows one topic at a time with a drawn verdict on the questions that have one', () => {
	english(<FaqPage />)
	expect(screen.getByRole('heading', { name: 'Is this a backup of my world?' })).toBeTruthy()
	expect(screen.queryByRole('heading', { name: 'Why is part of the build missing?' })).toBeNull()
	fireEvent.click(screen.getByRole('tab', { name: 'Captures' }))
	const missing = screen.getByRole('heading', { name: 'Why is part of the build missing?' })
	expect(missing.closest('details')?.textContent).toContain('Move closer, check your corners and height')
	fireEvent.click(screen.getByRole('tab', { name: 'Your world' }))
	const backup = screen.getByRole('heading', { name: 'Is this a backup of my world?' }).closest('summary')
	expect(backup?.textContent).toContain('No')
})

const verdictCatalogs = import.meta.glob<Record<string, string>>('../i18n/locales/{en,fr,ru,de,ko,pt-BR,pl,ja}.json', {
	import: 'default',
	eager: true,
})
test('every verdict chip label is translated in each catalogue, and French says “Non”', () => {
	expect(Object.keys(verdictCatalogs)).toHaveLength(8)
	for (const [path, catalog] of Object.entries(verdictCatalogs))
		for (const label of Object.values(verdictLabel)) expect(catalog[label]?.trim(), `${path}: ${label}`).toBeTruthy()
	const french = Object.entries(verdictCatalogs).find(([path]) => path.endsWith('/fr.json'))?.[1]
	expect(french?.[verdictLabel.no]).toBe('Non')
})

test('the article shows a picture, an adjustable radius map and the export folder, one per section', () => {
	english(
		<Routes>
			<Route path="/blog/:slug" element={<ArticlePage />} />
		</Routes>,
		'/blog/premier-souvenir'
	)
	expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3)
	expect(screen.getByRole('img', { name: 'A place at a moment in time' })).toBeTruthy()
	expect(screen.getByRole('slider', { name: 'Radius in blocks' })).toBeTruthy()
	expect(screen.getByText('capture.glb')).toBeTruthy()
	expect(screen.getByText('Every dated capture')).toBeTruthy()
})
