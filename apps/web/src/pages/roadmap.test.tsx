// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { apiBase } from '../api-client'
import { I18nProvider } from '../i18n/I18n'
import { roadmapIssuesUrl } from '../lib/roadmap'
import { renderPage } from '../prerender'
import { RoadmapPage } from './RoadmapPage'
import { roadmapUrl } from './useRoadmap'

const issue = (number: number, extra: Record<string, unknown> = {}) => ({
	number,
	title: `Issue ${number}`,
	url: `https://github.com/For-Hives/minemories/issues/${number}`,
	areas: [],
	updatedAt: '2026-11-05T12:00:00Z',
	closedAt: null,
	...extra,
})
const board = (columns: Record<string, unknown> = {}) => ({
	updatedAt: '2026-11-07T11:00:00Z',
	columns: {
		inProgress: { items: [issue(12, { title: 'AFK capture timeline', areas: ['mod', 'api'] })], more: 0 },
		planned: { items: [issue(30, { title: 'Public gallery filters', areas: ['front'] })], more: 0 },
		// the API still sends the issues closed in the last 30 days: the board leaves them out
		done: { items: [issue(5, { title: 'Pairing codes', closedAt: '2026-11-04T12:00:00Z' })], more: 0 },
		...columns,
	},
})
const latestRelease = (extra: Record<string, unknown> = {}) => ({
	version: '0.36.1-beta.1',
	tag: 'mod-v0.36.1-beta.1',
	date: '2026-11-06T18:00:00Z',
	prerelease: true,
	notes: [
		{ type: 'feature', text: 'AFK captures while paused', pr: 210 },
		{ type: 'fix', text: 'Leaves keep their tint', pr: null },
		{ type: 'other', text: 'Faster export', pr: 199 },
	],
	more: 4,
	downloadUrl: 'https://minemories.net/downloads',
	changelogUrl: 'https://minemories.net/versions',
	compareUrl: 'https://github.com/For-Hives/minemories/compare/mod-v0.36.0...mod-v0.36.1-beta.1',
	...extra,
})
const serve = (...responses: Response[]) => {
	const fetch = vi.fn()
	for (const response of responses) fetch.mockResolvedValueOnce(response)
	vi.stubGlobal('fetch', fetch)
	return fetch
}
function mount(path = '/roadmap', locale: 'fr' | 'en' = 'en') {
	return render(
		<I18nProvider initialLocale={locale}>
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path="/roadmap" element={<RoadmapPage />} />
				</Routes>
			</MemoryRouter>
		</I18nProvider>
	)
}
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(new Date('2026-11-07T12:00:00Z'))
})
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
	vi.useRealTimers()
	localStorage.clear()
})

test('loads the board from the API and shows the two columns in order with links, areas and dates, never the done issues', async () => {
	const fetch = serve(Response.json(board()))
	mount()
	expect(screen.getByRole('status').textContent).toContain('Loading the roadmap…')
	expect(fetch).toHaveBeenCalledWith(
		`${apiBase}/api/roadmap`,
		expect.objectContaining({ signal: expect.anything(), cache: 'no-cache' })
	)
	expect(roadmapUrl).toBe(`${apiBase}/api/roadmap`)
	const columns = await screen.findAllByRole('region')
	expect(columns.map(column => within(column).getByRole('heading').textContent)).toEqual(['In progress 1', 'Planned 1'])
	expect(screen.queryByText(/Pairing codes/)).toBeNull()
	const link = screen.getByRole('link', { name: '#12 AFK capture timeline' })
	expect(link.getAttribute('href')).toBe('https://github.com/For-Hives/minemories/issues/12')
	expect(link.getAttribute('rel')).toContain('noopener')
	expect(link.getAttribute('target')).toBe('_blank')
	const areas = within(columns[0] as HTMLElement).getByRole('list', { name: 'Project areas' })
	expect(
		within(areas)
			.getAllByRole('listitem')
			.map(item => item.textContent)
	).toEqual(['Mod', 'Server'])
	expect(within(columns[1] as HTMLElement).getByText('Website')).toBeTruthy()
	expect(
		within(columns[0] as HTMLElement)
			.getByText('2 days ago')
			.getAttribute('dateTime')
	).toBe('2026-11-05T12:00:00Z')
	expect(screen.getByText('Updated 1 hour ago').getAttribute('dateTime')).toBe('2026-11-07T11:00:00Z')
	expect(screen.getByText('Also on our Discord →')).toBeTruthy()
	expect(screen.queryByRole('status')).toBeNull()
	expect(screen.queryByText(/more on GitHub/)).toBeNull()
	expect(screen.queryByRole('article', { name: 'Latest mod version' })).toBeNull()
})

test('the board stands alone: the latest mod version the API sends is left to /versions, in French too', async () => {
	serve(
		Response.json({
			...board({ planned: { items: [issue(40, { areas: ['socials'] })], more: 0 } }),
			latestRelease: latestRelease({ notes: [{ type: 'fix', text: 'Leaves keep their tint', pr: 3 }] }),
		})
	)
	mount('/roadmap', 'fr')
	expect(await screen.findByText('Réseaux')).toBeTruthy()
	expect(screen.getByText('Réseaux').className).toContain('mm-roadmap-area-socials')
	expect(screen.getAllByRole('article')).toHaveLength(1)
	expect(screen.queryByText('Dernière version du mod')).toBeNull()
	expect(screen.queryByText(/Leaves keep their tint|0\.36\.1-beta\.1/)).toBeNull()
	expect(screen.queryByRole('link', { name: 'Toutes les nouveautés' })).toBeNull()
})

test('an empty column says so, and a capped column links to every roadmap issue on GitHub', async () => {
	serve(
		Response.json(
			board({
				inProgress: { items: [], more: 0 },
				planned: { items: Array.from({ length: 25 }, (_, index) => issue(index + 100)), more: 7 },
			})
		)
	)
	mount('/roadmap', 'fr')
	const columns = await screen.findAllByRole('region')
	expect(within(columns[0] as HTMLElement).getByText('Rien ici pour le moment.')).toBeTruthy()
	expect(within(columns[0] as HTMLElement).queryByRole('list')).toBeNull()
	expect(within(columns[1] as HTMLElement).getAllByRole('link', { name: /^#1\d\d Issue/ })).toHaveLength(25)
	expect(within(columns[1] as HTMLElement).getByRole('heading').textContent).toBe('Prévu 32')
	const more = screen.getByRole('link', { name: '+7 de plus sur GitHub' })
	expect(more.getAttribute('href')).toBe('https://github.com/For-Hives/minemories/issues?q=label%3Aroadmap')
	expect(more.getAttribute('rel')).toContain('noopener')
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Feuille de route')
})

test('issue titles are rendered as text, never as markup', async () => {
	serve(
		Response.json(
			board({ planned: { items: [issue(9, { title: '<img src=x onerror="alert(1)"> **bold**' })], more: 0 } })
		)
	)
	mount()
	expect(await screen.findByRole('link', { name: '#9 <img src=x onerror="alert(1)"> **bold**' })).toBeTruthy()
	expect(document.querySelector('.mm-roadmap-board img')).toBeNull()
})

test('a failed request shows an error with a retry that loads the board', async () => {
	const fetch = serve(Response.json({ error: 'roadmap_unavailable' }, { status: 503 }), Response.json(board()))
	mount()
	const alert = await screen.findByRole('alert')
	expect(alert.textContent).toContain('The roadmap could not be loaded. Try again in a moment.')
	expect(screen.queryByRole('region')).toBeNull()
	fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
	expect(await screen.findByRole('link', { name: '#30 Public gallery filters' })).toBeTruthy()
	expect(screen.queryByRole('alert')).toBeNull()
	expect(fetch).toHaveBeenCalledTimes(2)
})

function setVisibility(state: 'visible' | 'hidden') {
	Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
	act(() => {
		document.dispatchEvent(new Event('visibilitychange'))
	})
}

test('coming back to the tab reloads the board quietly, at most every 30 seconds', async () => {
	const fetch = serve(
		Response.json(board()),
		Response.json({ error: 'roadmap_unavailable' }, { status: 503 }),
		Response.json(board({ planned: { items: [issue(31, { title: 'Server map' })], more: 0 } }))
	)
	mount()
	expect(await screen.findByRole('link', { name: '#30 Public gallery filters' })).toBeTruthy()
	setVisibility('visible')
	expect(fetch).toHaveBeenCalledTimes(1)
	vi.setSystemTime(new Date('2026-11-07T12:00:30Z'))
	setVisibility('hidden')
	expect(fetch).toHaveBeenCalledTimes(1)
	setVisibility('visible')
	setVisibility('visible')
	expect(fetch).toHaveBeenCalledTimes(2)
	await act(async () => {
		await Promise.resolve()
	})
	expect(screen.getByRole('link', { name: '#30 Public gallery filters' })).toBeTruthy()
	expect(screen.queryByRole('status')).toBeNull()
	expect(screen.queryByRole('alert')).toBeNull()
	setVisibility('visible')
	expect(fetch).toHaveBeenCalledTimes(3)
	expect(screen.queryByRole('status')).toBeNull()
	expect(await screen.findByRole('link', { name: '#31 Server map' })).toBeTruthy()
	setVisibility('visible')
	expect(fetch).toHaveBeenCalledTimes(3)
})

test('a quiet reload that never answers is abandoned, and leaving the page cancels it', async () => {
	vi.useRealTimers()
	vi.useFakeTimers()
	const signals: AbortSignal[] = []
	let finish: (response: Response) => void = () => undefined
	const fetch = vi.fn((_url: string, init: RequestInit) => {
		signals.push(init.signal as AbortSignal)
		if (signals.length === 1) return Promise.resolve(Response.json(board()))
		return new Promise<Response>(resolve => {
			finish = resolve
		})
	})
	vi.stubGlobal('fetch', fetch)
	const view = mount()
	await act(async () => {
		await vi.advanceTimersByTimeAsync(30000)
	})
	setVisibility('visible')
	expect(fetch).toHaveBeenCalledTimes(2)
	await act(async () => {
		await vi.advanceTimersByTimeAsync(15000)
	})
	expect(signals[1]?.aborted).toBe(true)
	await act(async () => {
		finish(Response.json(board({ planned: { items: [issue(31, { title: 'Server map' })], more: 0 } })))
	})
	expect(screen.queryByRole('link', { name: '#31 Server map' })).toBeNull()
	setVisibility('visible')
	expect(fetch).toHaveBeenCalledTimes(3)
	view.unmount()
	expect(signals[2]?.aborted).toBe(true)
})

test('an invalid body or a network failure is an error too', async () => {
	serve(Response.json({ columns: {} }))
	mount()
	expect(await screen.findByRole('alert')).toBeTruthy()
	cleanup()
	vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
	mount()
	expect(await screen.findByRole('alert')).toBeTruthy()
})

test('a request that never answers times out into the error state, and its late answer is ignored', async () => {
	vi.useRealTimers()
	vi.useFakeTimers()
	let finish: (response: Response) => void = () => undefined
	const fetch = vi.fn(
		(_url: string, _init: RequestInit) =>
			new Promise<Response>(resolve => {
				finish = resolve
			})
	)
	vi.stubGlobal('fetch', fetch)
	mount()
	expect(screen.getByRole('status')).toBeTruthy()
	await act(async () => {
		await vi.advanceTimersByTimeAsync(15000)
	})
	expect(fetch.mock.calls[0]?.[1].signal?.aborted).toBe(true)
	expect(screen.getByRole('alert')).toBeTruthy()
	await act(async () => {
		finish(Response.json(board()))
	})
	expect(screen.queryByRole('region')).toBeNull()
})

test('the roadmap is a public, prerendered page linked from the footer and readable without JavaScript', () => {
	const html = renderPage('/roadmap', 'fr')
	expect(html).toContain('<h1')
	expect(html).toContain('Feuille de route')
	expect(html).toContain('href="/fr/roadmap"')
	expect(html).toContain(`href="${roadmapIssuesUrl.replaceAll('&', '&amp;')}"`)
	expect(html).toContain('Aussi sur notre Discord →')
	expect(html).not.toContain('mm-roadmap-board')
})
