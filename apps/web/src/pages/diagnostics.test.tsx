// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DiagnosticsAccessLink } from '../components/DiagnosticsAccessLink'
import { I18nProvider } from '../i18n/I18n'
import { DiagnosticsPage } from './DiagnosticsPage'
import type { DiagnosticDetail, DiagnosticIssue } from './diagnostics-data'

const rpc = vi.hoisted(() => ({ access: vi.fn(), list: vi.fn(), detail: vi.fn(), update: vi.fn() }))
vi.mock('../api-client', () => ({ apiClient: { diagnostics: rpc } }))
const fingerprint = 'a'.repeat(64)
const issue: DiagnosticIssue = {
	fingerprint,
	state: 'open',
	revision: 1,
	count: 2,
	devices: 1,
	firstReceivedAt: 1792051200000,
	lastReceivedAt: 1792051200000,
	updatedAt: null,
	lastReport: {
		id: '60000000-0000-4000-8000-000000000001',
		occurredAt: '2026-10-15T08:00:00Z',
		source: 'mod',
		phase: 'crash',
		versions: { mod: '0.2.1-beta.1', minecraft: '1.21.1', loader: 'neoforge-21.1.248' },
		correlationId: '60000000-0000-4000-8000-000000000002',
		exception: {
			type: 'java.lang.IllegalStateException',
			frames: [
				{
					className: 'dev.minemories.neoforge.Minemories',
					methodName: 'export',
					fileName: 'Minemories.java',
					lineNumber: 100,
				},
			],
		},
		breadcrumbs: [
			{ step: 'capture_started', elapsedMs: 0 },
			{ step: 'client_crashed', elapsedMs: 500 },
		],
	},
}
const detail: DiagnosticDetail = {
	issue,
	hasMore: false,
	items: [{ deviceId: '60000000-0000-4000-8000-000000000003', receivedAt: 1792051200000, report: issue.lastReport }],
}
function mount(locale: 'fr' | 'en' = 'fr') {
	return render(
		<I18nProvider initialLocale={locale}>
			<MemoryRouter>
				<DiagnosticsPage />
			</MemoryRouter>
		</I18nProvider>
	)
}
beforeEach(() => {
	rpc.access.mockResolvedValue({ allowed: true })
	rpc.list.mockResolvedValue({ items: [issue], hasMore: false })
	rpc.detail.mockResolvedValue(detail)
	rpc.update.mockResolvedValue({ ok: true })
})
afterEach(() => {
	cleanup()
	vi.resetAllMocks()
	localStorage.clear()
})

test('denied access never fetches private diagnostics and can recover after permission is confirmed', async () => {
	rpc.access.mockResolvedValueOnce({ allowed: false })
	mount()
	await screen.findByRole('alert')
	expect(rpc.list).not.toHaveBeenCalled()
	expect(screen.queryByText('java.lang.IllegalStateException')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }))
	await screen.findByText('java.lang.IllegalStateException')
})

test('loads grouped crashes, details and breadcrumbs; closes with focus returned to the selected issue', async () => {
	mount()
	expect(screen.getByRole('status').textContent).toContain('Chargement des diagnostics')
	const open = await screen.findByRole('button', { name: /Examiner l’erreur/ })
	expect(screen.getByText('Crash client · mod')).toBeTruthy()
	expect(screen.getByText(/2 occurrences · 1 appareils/)).toBeTruthy()
	open.focus()
	fireEvent.click(open)
	await screen.findByText('dev.minemories.neoforge.Minemories.export (Minemories.java:100)')
	expect(screen.getByText(/500 ms — client_crashed/)).toBeTruthy()
	expect(document.activeElement?.id).toBe('diagnostic-detail-title')
	fireEvent.click(screen.getByRole('button', { name: 'Fermer les détails' }))
	expect(screen.queryByRole('heading', { name: 'Détail de l’erreur' })).toBeNull()
	expect(document.activeElement).toBe(open)
})

test('filters status, phase, source and version, with paginated results and no stale page number', async () => {
	rpc.list.mockResolvedValue({ items: [issue], hasMore: true })
	mount()
	fireEvent.click(await screen.findByRole('button', { name: 'Page suivante' }))
	await waitFor(() => expect(rpc.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })))
	fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'resolved' } })
	await waitFor(() =>
		expect(rpc.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, state: 'resolved' }))
	)
	fireEvent.change(screen.getByLabelText('Étape'), { target: { value: 'crash' } })
	fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'mod' } })
	fireEvent.change(screen.getByLabelText('Version du mod / API'), { target: { value: '0.2.1-beta.1' } })
	fireEvent.click(screen.getByRole('button', { name: 'Filtrer' }))
	await waitFor(() =>
		expect(rpc.list).toHaveBeenLastCalledWith({
			page: 0,
			state: 'resolved',
			phase: 'crash',
			source: 'mod',
			version: '0.2.1-beta.1',
		})
	)
})

test('saving a triage decision uses the observed revision and refreshes the list', async () => {
	mount()
	fireEvent.click(await screen.findByRole('button', { name: /Examiner l’erreur/ }))
	fireEvent.change(await screen.findByLabelText('Statut de traitement'), { target: { value: 'resolved' } })
	fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le statut' }))
	await waitFor(() => expect(rpc.update).toHaveBeenCalledWith({ fingerprint, state: 'resolved', revision: 1 }))
	await waitFor(() => expect(rpc.list).toHaveBeenCalledTimes(2))
	expect(screen.queryByRole('heading', { name: 'Détail de l’erreur' })).toBeNull()
})

test('concurrent changes require a refresh before a new status is saved', async () => {
	rpc.update.mockRejectedValueOnce({ code: 'CONFLICT' })
	mount()
	fireEvent.click(await screen.findByRole('button', { name: /Examiner l’erreur/ }))
	fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer le statut' }))
	await screen.findByText('De nouvelles données sont arrivées. Actualise avant de modifier le statut.')
	rpc.detail.mockResolvedValue({ ...detail, issue: { ...issue, revision: 3 } })
	fireEvent.click(screen.getByRole('button', { name: 'Actualiser les détails' }))
	await waitFor(() => expect(rpc.detail).toHaveBeenCalledTimes(2))
	fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer le statut' }))
	await waitFor(() => expect(rpc.update).toHaveBeenLastCalledWith({ fingerprint, state: 'open', revision: 3 }))
})

test('list failures clear previously visible data and retry; an empty list is explicit', async () => {
	mount()
	await screen.findByText('java.lang.IllegalStateException')
	rpc.list.mockRejectedValueOnce(new Error('network'))
	fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }))
	await screen.findByRole('alert')
	expect(screen.queryByText('java.lang.IllegalStateException')).toBeNull()
	rpc.list.mockResolvedValue({ items: [], hasMore: false })
	fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }))
	await screen.findByText('Aucune erreur correspondant à ces filtres.')
})

test('private details are cleared if access fails and occurrence pagination remains usable', async () => {
	rpc.detail.mockResolvedValueOnce({ ...detail, hasMore: true })
	mount()
	fireEvent.click(await screen.findByRole('button', { name: /Examiner l’erreur/ }))
	fireEvent.click(await screen.findByRole('button', { name: 'Occurrences suivantes' }))
	await waitFor(() => expect(rpc.detail).toHaveBeenLastCalledWith({ fingerprint, page: 1 }))
	rpc.detail.mockRejectedValueOnce(new Error('Forbidden'))
	fireEvent.click(screen.getByRole('button', { name: 'Actualiser les détails' }))
	await screen.findByRole('alert')
	expect(screen.queryByText('dev.minemories.neoforge.Minemories.export (Minemories.java:100)')).toBeNull()
})

test('late details or a completed save cannot resurrect a closed inspector', async () => {
	let finish: (value: DiagnosticDetail) => void = () => undefined
	rpc.detail.mockImplementationOnce(
		() =>
			new Promise(resolve => {
				finish = resolve
			})
	)
	mount()
	fireEvent.click(await screen.findByRole('button', { name: /Examiner l’erreur/ }))
	fireEvent.click(screen.getByRole('button', { name: 'Fermer les détails' }))
	await act(async () => {
		finish(detail)
	})
	expect(screen.queryByRole('heading', { name: 'Détail de l’erreur' })).toBeNull()
})

test('operator link waits for permission and a late grant cannot revive an unmounted account', async () => {
	let finish: (value: { allowed: boolean }) => void = () => undefined
	rpc.access.mockImplementationOnce(
		() =>
			new Promise(resolve => {
				finish = resolve
			})
	)
	const view = render(
		<MemoryRouter>
			<DiagnosticsAccessLink />
		</MemoryRouter>
	)
	expect(screen.queryByRole('link', { name: 'Diagnostics' })).toBeNull()
	await act(async () => {})
	view.unmount()
	await act(async () => {
		finish({ allowed: true })
	})
	render(
		<MemoryRouter>
			<DiagnosticsAccessLink />
		</MemoryRouter>
	)
	expect((await screen.findByRole('link', { name: 'Diagnostics' })).getAttribute('href')).toBe('/admin/diagnostics')
})

test('English labels and empty stacks remain readable without fabricated frame data', async () => {
	rpc.list.mockResolvedValue({
		items: [{ ...issue, lastReport: { ...issue.lastReport, exception: { type: 'java.lang.Error', frames: [] } } }],
		hasMore: false,
	})
	mount('en')
	await screen.findByText('Stack unavailable')
	expect(screen.getByRole('heading', { name: 'Mod diagnostics' })).toBeTruthy()
	expect(screen.getByText('Client crash · mod')).toBeTruthy()
})
