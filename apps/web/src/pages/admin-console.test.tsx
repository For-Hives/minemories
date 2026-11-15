// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { adminRoutes } from '../admin-routes'
import { AppContext, type AppContextValue } from '../app-context'
import { I18nProvider } from '../i18n/I18n'

const rpc = vi.hoisted(() => ({
	admin: {
		access: vi.fn(),
		summary: vi.fn(),
		insights: vi.fn(),
		analytics: vi.fn(),
		users: vi.fn(),
		audit: vi.fn(),
		journal: vi.fn(),
		storageRoles: vi.fn(),
		setRole: vi.fn(),
		deleteUser: vi.fn(),
		setRoleStorage: vi.fn(),
	},
	discovery: { moderator: vi.fn(), queueSummary: vi.fn(), queue: vi.fn(), moderate: vi.fn() },
	diagnostics: { access: vi.fn(), list: vi.fn(), detail: vi.fn(), update: vi.fn() },
}))
vi.mock('../api-client', () => ({ apiClient: rpc }))
vi.mock('../observability/WebObservability', () => ({ reportWebFailure: vi.fn() }))

const HOUR = 3_600_000
const now = Date.UTC(2026, 10, 15, 12)
const series = Array.from({ length: 1440 }, (_, index) => ({
	at: now - (1439 - index) * HOUR,
	signups: index % 24 === 0 ? 1 : 0,
	uploads: index % 3 === 0 ? 2 : 0,
	uploadedBytes: index % 3 === 0 ? 2_000_000 : 0,
	coverage: 'full' as const,
}))
const summary = {
	trackingStartedAt: now - 1440 * HOUR,
	from: now - 1439 * HOUR,
	to: now,
	totals: {
		users: 42,
		admins: 2,
		memories: 300,
		storedBytes: 5_000_000_000,
		trashBytes: 500_000_000,
		pendingDeletionBytes: 100_000_000,
		reservedBytes: 200_000_000,
		sessions: 9,
		devices: 12,
		publicCaptures: 7,
		coldObjects: 11,
		restoringObjects: 3,
	},
	period: { signups: 1, uploads: 2, uploadedBytes: 3 },
	series,
}
const insights = {
	windowDays: 30,
	versions: {
		reportingDevices: 10,
		minecraft: [{ version: '1.21.1', devices: 10 }],
		loader: [{ version: 'neoforge', devices: 10 }],
		mod: [
			{ version: '0.39.0', devices: 3 },
			{ version: '0.38.0', devices: 7 },
		],
	},
	shares: { links: 5, activeLinks: 4, revokedLinks: 1, worldLinks: 1, openedLinks: 3, opens: 20, top: [] },
	activity: {
		activeUsers: 5,
		users: [
			{
				id: 'u1',
				name: 'Alex',
				email: 'alex@example.com',
				level: 'high',
				score: 31,
				logins: 4,
				uploads: 9,
				lastActiveAt: now,
			},
		],
	},
}
const analytics = {
	funnel: { accounts: 100, verified: 80, paired: 60, captured: 50, shared: 20, submitted: 10 },
	firstCapture: { buckets: [5, 20, 10, 8, 4, 3], samples: 50, medianMinutes: 26 },
	cohorts: [
		{ weekStart: now - 3 * 7 * 24 * HOUR, size: 10, active: [10, 6, 4, 3] },
		{ weekStart: now - 2 * 7 * 24 * HOUR, size: 0, active: [0, 0, 0] },
		{ weekStart: now - 7 * 24 * HOUR, size: 8, active: [8, 5] },
		{ weekStart: now, size: 4, active: [4] },
	],
	concentration: {
		accounts: 100,
		topTenShare: 0.55,
		gini: 0.74,
		lorenz: [0.01, 0.02, 0.04, 0.07, 0.1, 0.15, 0.22, 0.32, 0.39, 1],
	},
	worlds: {
		captures: 200,
		withBiome: 180,
		biomes: [
			{ name: 'plains', count: 40 },
			{ name: 'forest', count: 20 },
		],
		dimensions: [
			{ name: 'overworld', count: 170 },
			{ name: 'the_nether', count: 30 },
		],
		onServer: 120,
		singleplayer: 80,
		distinctServers: 9,
		topServers: [{ name: 'Shared SMP', captures: 30, accounts: 4 }],
		sizes: [10, 50, 60, 40, 30, 10],
		medianBytes: 28_000_000,
	},
	traffic: {
		trackingStartedAt: now - 3 * 24 * HOUR,
		downloads: [
			{ target: 'neoforge-mc1.21.1', count: 412 },
			{ target: 'fabric-mc1.21.1', count: 236 },
		],
		api: [
			{ route: 'rpc', requests: 1000, serverErrors: 5, meanMs: 42 },
			{ route: 'auth', requests: 20, serverErrors: 0, meanMs: 8 },
		],
		pairing: { done: 8, rejected: 1, limited: 1 },
	},
	publication: { captures: 200, shared: 40, submitted: 12, approved: 10, voted: 8, wellVoted: 2 },
}
const user = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
	id,
	name,
	email: `${name.toLowerCase()}@example.com`,
	emailVerified: true,
	createdAt: now - 1000 * HOUR,
	role: 'user',
	captures: 4,
	storedBytes: 100,
	usedBytes: 2_900_000_000,
	reservedBytes: 0,
	pendingDeletionBytes: 0,
	devices: 1,
	quotaBytes: 3_000_000_000,
	...extra,
})
const directory = {
	users: [user('u1', 'Alex'), user('u2', 'Bea', { role: 'admin', usedBytes: 10 })],
	total: 2,
	page: 1,
	pageSize: 25,
	quotaBytes: 3_000_000_000,
	overview: { accounts: 42, usedBytes: 6_000_000_000, nearQuotaAccounts: 3 },
}
const queueItem = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
	id,
	memoryId: id,
	title,
	description: `About ${title}`,
	category: 'build',
	thumbnail: null,
	publishedAt: new Date(now - 5 * HOUR).toISOString(),
	votes: 2,
	voted: false,
	state: 'pending',
	reason: null,
	reports: [],
	owner: { submissions: 3, approved: 2, rejected: 1 },
	...extra,
})
const issue = {
	fingerprint: 'a'.repeat(64),
	state: 'open',
	revision: 3,
	count: 41,
	devices: 6,
	firstReceivedAt: now - 5 * HOUR,
	lastReceivedAt: now - 60_000,
	updatedAt: null,
	lastReport: {
		id: '11111111-1111-4111-8111-111111111111',
		occurredAt: new Date(now).toISOString(),
		source: 'mod',
		phase: 'upload',
		versions: { mod: '0.39.0', minecraft: '1.21.1', loader: 'neoforge' },
		correlationId: '22222222-2222-4222-8222-222222222222',
		exception: {
			type: 'java.io.IOException',
			frames: [
				{
					className: 'dev.minemories.upload.UploadClient',
					methodName: 'putChunk',
					fileName: 'UploadClient.java',
					lineNumber: 212,
				},
			],
		},
		breadcrumbs: [
			{ step: 'upload_started', elapsedMs: 120 },
			{ step: 'upload_failed', elapsedMs: 14_200 },
		],
		context: { http: { request: 'chunk', attempts: 3, status: 503, error: 'storage_unavailable' } },
	},
}
const detail = {
	issue,
	items: [
		{ deviceId: '33333333-3333-4333-8333-333333333333', receivedAt: now, report: issue.lastReport },
		{ deviceId: '44444444-4444-4444-8444-444444444444', receivedAt: now, report: issue.lastReport },
	],
	hasMore: false,
}

type Rights = { admin?: boolean; moderator?: boolean; operator?: boolean }
function grant({ admin = false, moderator = false, operator = false }: Rights) {
	rpc.admin.access.mockResolvedValue({ allowed: admin })
	rpc.discovery.moderator.mockResolvedValue({ allowed: moderator })
	rpc.diagnostics.access.mockResolvedValue({ allowed: operator })
}
function Where() {
	const location = useLocation()
	return <output data-testid="where">{`${location.pathname}${location.search}`}</output>
}
function mount(path: string) {
	const context: AppContextValue = {
		session: { user: { id: 'someone' } } as unknown as AppContextValue['session'],
		isPending: false,
		refreshSession: vi.fn(),
		viewerFile: null,
		setViewerFile: vi.fn(),
		notify: vi.fn(),
	}
	return render(
		<AppContext.Provider value={context}>
			<I18nProvider initialLocale="en">
				<MemoryRouter initialEntries={[path]}>
					<Where />
					<Routes>{adminRoutes}</Routes>
				</MemoryRouter>
			</I18nProvider>
		</AppContext.Provider>
	)
}
const rail = () => screen.getByRole('navigation', { name: 'Administration sections' })
const railLinks = () =>
	within(rail())
		.getAllByRole('link')
		.map(link => link.textContent)
const where = () => screen.getByTestId('where').textContent

beforeEach(() => {
	vi.resetAllMocks()
	localStorage.clear()
	Object.assign(HTMLDialogElement.prototype, {
		showModal(this: HTMLDialogElement) {
			this.setAttribute('open', '')
		},
		close(this: HTMLDialogElement) {
			this.removeAttribute('open')
		},
	})
	rpc.admin.summary.mockResolvedValue(summary)
	rpc.admin.insights.mockResolvedValue(insights)
	rpc.admin.analytics.mockResolvedValue(analytics)
	rpc.admin.users.mockResolvedValue(directory)
	rpc.admin.journal.mockResolvedValue([
		{ at: now, area: 'roles', action: 'role_granted', actor: 'Alex', target: 'Bea' },
		{ at: now - 1, area: 'moderation', action: 'publication_approved', actor: null, target: 'Village' },
		{ at: now - 2, area: 'health', action: 'issue_resolved', actor: 'Alex', target: 'abcdef01' },
		{ at: now - 3, area: 'quota', action: 'quota_set', actor: 'Alex', target: 'user' },
		{ at: now - 4, area: 'deletions', action: 'account_deleted', actor: 'Alex', target: null },
		{ at: now - 5, area: 'roles', action: 'something_new', actor: 'Alex', target: 'Bea' },
	])
	rpc.admin.storageRoles.mockResolvedValue([
		{ role: 'user', limitBytes: null, effectiveBytes: 3_000_000_000, accounts: 42, updatedAt: null },
		{ role: 'admin', limitBytes: 8_000_000_000, effectiveBytes: 8_000_000_000, accounts: 2, updatedAt: 1 },
	])
	rpc.discovery.queueSummary.mockResolvedValue({ pending: 3, reported: 1 })
	rpc.discovery.queue.mockResolvedValue({
		items: [
			queueItem('p1', 'Cherry Estate'),
			queueItem('p2', 'Basalt Outpost', {
				reports: [{ id: 1, reason: 'Spam', createdAt: new Date(now).toISOString() }],
			}),
		],
		hasMore: false,
	})
	rpc.discovery.moderate.mockResolvedValue({ id: 'p1', state: 'approved', reason: null, submission: null })
	rpc.diagnostics.list.mockResolvedValue({ items: [issue], hasMore: false })
	rpc.diagnostics.detail.mockResolvedValue(detail)
	rpc.diagnostics.update.mockResolvedValue({ ok: true })
})
afterEach(cleanup)

test('the rail shows what each capability opens, with the waiting counts', async () => {
	grant({ admin: true, moderator: true, operator: true })
	mount('/admin')
	await screen.findByRole('heading', { name: 'Pulse' })
	await waitFor(() =>
		expect(railLinks()).toEqual(['Pulse', 'Growth', 'Accounts', 'Worlds', 'Moderation4', 'Health1', 'Platform'])
	)
	cleanup()
	grant({ moderator: true })
	mount('/admin/moderation')
	await waitFor(() => expect(railLinks()).toEqual(['Pulse', 'Moderation4']))
	cleanup()
	grant({ operator: true })
	mount('/admin/diagnostics')
	await waitFor(() => expect(railLinks()).toEqual(['Pulse', 'Health1']))
})

test('an account without any capability is refused, and no data is asked for', async () => {
	grant({})
	mount('/admin')
	expect((await screen.findByRole('alert')).textContent).toContain('Administrator access required')
	expect(screen.queryByRole('navigation', { name: 'Administration sections' })).toBeNull()
	expect(rpc.admin.summary).not.toHaveBeenCalled()
})

test('the pulse leads with what needs attention, then figures, charts and a heatmap', async () => {
	grant({ admin: true, moderator: true, operator: true })
	mount('/admin')
	await screen.findByRole('heading', { name: 'Pulse' })
	const attention = await screen.findByRole('region', { name: 'Needs attention' })
	await waitFor(() => expect(within(attention).getAllByRole('link')).toHaveLength(4))
	const links = within(attention).getAllByRole('link')
	expect(links.map(link => link.getAttribute('href'))).toEqual([
		'/admin/moderation',
		'/admin/diagnostics',
		'/admin/users?sort=storage_desc',
		'/admin/platform',
	])
	expect(links[0]?.textContent).toContain('4Waiting for review3 pending · 1 reported')
	const figures = await screen.findByRole('region', { name: 'Key figures' })
	expect(within(figures).getAllByRole('link').length).toBeGreaterThan(2)
	expect(screen.getByRole('img', { name: 'Completed captures' })).toBeTruthy()
	expect(screen.getByText(/Busiest:/)).toBeTruthy()
	expect(screen.getByText(/At this pace/)).toBeTruthy()
	expect(screen.getByText('Alex')).toBeTruthy()
})

test('the period and its comparison live in the address', async () => {
	grant({ admin: true })
	mount('/admin')
	await screen.findByRole('region', { name: 'Key figures' })
	const periods = screen.getByRole('group', { name: 'Period' })
	expect(within(periods).getByRole('button', { name: '30 days' }).getAttribute('aria-pressed')).toBe('true')
	fireEvent.click(within(periods).getByRole('button', { name: '24 hours' }))
	expect(where()).toBe('/admin?period=24h')
	expect(within(periods).getByRole('button', { name: '24 hours' }).getAttribute('aria-pressed')).toBe('true')
	fireEvent.click(screen.getByRole('button', { name: 'Compare with the previous period' }))
	expect(where()).toBe('/admin?period=24h&compare=0')
	fireEvent.click(within(periods).getByRole('button', { name: '30 days' }))
	expect(where()).toBe('/admin?compare=0')
	fireEvent.click(screen.getByRole('button', { name: 'Compare with the previous period' }))
	expect(where()).toBe('/admin')
	fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
	await waitFor(() => expect(rpc.admin.summary).toHaveBeenCalledTimes(2))
})

test('a moderator without admin rights sees the queue tile only, and no period tools', async () => {
	grant({ moderator: true })
	mount('/admin')
	const attention = await screen.findByRole('region', { name: 'Needs attention' })
	expect(within(attention).getAllByRole('link')).toHaveLength(1)
	expect(screen.queryByRole('group', { name: 'Period' })).toBeNull()
	expect(rpc.admin.summary).not.toHaveBeenCalled()
})

test('accounts: a row opens its sheet beside the list, arrows move, Escape closes, and the address keeps the choice', async () => {
	grant({ admin: true })
	mount('/admin/users')
	const rowButton = await screen.findByRole('button', { name: /Alex/ })
	fireEvent.click(rowButton)
	const sheet = await screen.findByRole('complementary', { name: 'Account details' })
	expect(within(sheet).getByRole('heading', { name: 'Alex' })).toBeTruthy()
	expect(within(sheet).getByText('Activity score 31')).toBeTruthy()
	expect(where()).toBe('/admin/users?user=u1')
	fireEvent.keyDown(rowButton, { key: 'ArrowDown' })
	expect(where()).toBe('/admin/users?user=u2')
	await waitFor(() => expect(screen.getByRole('heading', { name: 'Bea' })).toBeTruthy())
	fireEvent.keyDown(rowButton, { key: 'ArrowUp' })
	fireEvent.keyDown(rowButton, { key: 'x' })
	expect(where()).toBe('/admin/users?user=u1')
	fireEvent.keyDown(rowButton, { key: 'Escape' })
	expect(where()).toBe('/admin/users')
})

test('accounts: filters, search and paging go to the address and to the API', async () => {
	grant({ admin: true })
	mount('/admin/users')
	await screen.findByRole('button', { name: /Alex/ })
	fireEvent.click(screen.getByRole('button', { name: /Administrators/ }))
	expect(where()).toBe('/admin/users?role=admin')
	await waitFor(() =>
		expect(rpc.admin.users).toHaveBeenLastCalledWith(
			{ query: '', role: 'admin', page: 1, sort: 'registered_desc' },
			expect.anything()
		)
	)
	fireEvent.click(screen.getByRole('button', { name: /Most storage used/ }))
	expect(where()).toBe('/admin/users?role=admin&sort=storage_desc')
	fireEvent.change(screen.getByLabelText('Find an account'), { target: { value: 'be' } })
	await waitFor(() => expect(where()).toBe('/admin/users?role=admin&sort=storage_desc&q=be'), { timeout: 2000 })
	fireEvent.click(screen.getByRole('button', { name: /^Accounts near their quota/ }))
	expect(rpc.admin.users).toHaveBeenCalled()
	expect(screen.getByText('Page 1 / 1')).toBeTruthy()
})

test('accounts: promoting asks for the password in a dialog and reloads on success', async () => {
	grant({ admin: true })
	rpc.admin.setRole.mockResolvedValue({ ok: true })
	mount('/admin/users?user=u1')
	const sheet = await screen.findByRole('complementary', { name: 'Account details' })
	fireEvent.click(within(sheet).getByRole('button', { name: 'Promote to admin' }))
	const dialog = await screen.findByRole('dialog')
	fireEvent.change(within(dialog).getByLabelText(/password/i), { target: { value: 'correct horse' } })
	fireEvent.click(
		within(dialog)
			.getAllByRole('button')
			.find(button => /promote|confirm/i.test(button.textContent ?? '')) as HTMLElement
	)
	await waitFor(() =>
		expect(rpc.admin.setRole).toHaveBeenCalledWith({ userId: 'u1', role: 'admin', currentPassword: 'correct horse' })
	)
})

test('moderation: the queue, the capture and the decision share the screen; A approves and the reason is sent', async () => {
	grant({ moderator: true })
	mount('/admin/moderation')
	const first = await screen.findByRole('button', { name: /Cherry Estate/ })
	expect(first.getAttribute('aria-current')).toBe('true')
	expect(await screen.findByText('About Cherry Estate')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Low effort' }))
	expect((screen.getByLabelText('Decision reason (optional)') as HTMLTextAreaElement).value).toBe('Low effort')
	fireEvent.click(screen.getByRole('button', { name: 'Reject (R)' }))
	await waitFor(() =>
		expect(rpc.discovery.moderate).toHaveBeenCalledWith({ id: 'p1', decision: 'rejected', reason: 'Low effort' })
	)
	await waitFor(() => expect(rpc.discovery.queue).toHaveBeenCalledTimes(2))
	fireEvent.keyDown(window, { key: 'j' })
	await waitFor(() =>
		expect(screen.getByRole('button', { name: /Basalt Outpost/ }).getAttribute('aria-current')).toBe('true')
	)
	expect(screen.getByText('Spam', { exact: false })).toBeTruthy()
	fireEvent.keyDown(window, { key: 'a' })
	await waitFor(() =>
		expect(rpc.discovery.moderate).toHaveBeenLastCalledWith({ id: 'p2', decision: 'approved', reason: '' })
	)
	fireEvent.keyDown(window, { key: 'k' })
	fireEvent.keyDown(screen.getByLabelText('Decision reason (optional)'), { key: 'a' })
	expect(rpc.discovery.moderate).toHaveBeenCalledTimes(2)
})

test('moderation: the owner history and the first-submission tag help the reviewer', async () => {
	grant({ moderator: true })
	rpc.discovery.queue.mockResolvedValue({
		items: [
			queueItem('p1', 'Cherry Estate'),
			queueItem('p2', 'Basalt Outpost', { owner: { submissions: 0, approved: 0, rejected: 0 } }),
		],
		hasMore: false,
	})
	mount('/admin/moderation')
	await screen.findByText('About Cherry Estate')
	const history = screen.getByText('Earlier submissions').parentElement as HTMLElement
	expect(within(history).getByText('3')).toBeTruthy()
	expect(screen.getAllByText('First submission')).toHaveLength(1)
})

test('moderation: another queue, an empty queue and a refused decision', async () => {
	grant({ moderator: true })
	mount('/admin/moderation')
	await screen.findByRole('button', { name: /Cherry Estate/ })
	rpc.discovery.queue.mockImplementation(async ({ state }: { state: string }) =>
		state === 'approved' ? { items: [], hasMore: false } : { items: [queueItem('p1', 'Cherry Estate')], hasMore: true }
	)
	fireEvent.click(screen.getByRole('button', { name: /Approved/ }))
	await screen.findByText('No memories in this queue.')
	expect(rpc.discovery.queue).toHaveBeenLastCalledWith({ state: 'approved', page: 0 })
	expect(screen.getByText('Select a memory in the queue.')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: /^Pending/ }))
	await screen.findByRole('button', { name: /Cherry Estate/ })
	rpc.discovery.moderate.mockRejectedValueOnce(new Error('refused'))
	fireEvent.click(screen.getByRole('button', { name: 'Approve (A)' }))
	expect((await screen.findByRole('alert')).textContent).toBe('Decision refused. Try again later.')
	fireEvent.click(screen.getByRole('button', { name: 'Next' }))
	await waitFor(() => expect(rpc.discovery.queue).toHaveBeenLastCalledWith({ state: 'pending', page: 1 }))
	fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
	await waitFor(() => expect(rpc.discovery.queue).toHaveBeenLastCalledWith({ state: 'pending', page: 0 }))
})

test('moderation: a queue that cannot load says so', async () => {
	grant({ moderator: true })
	rpc.discovery.queue.mockRejectedValue(new Error('down'))
	mount('/admin/moderation')
	expect((await screen.findByRole('alert')).textContent).toBe('Moderation unavailable or access denied.')
})

test('health: groups sorted by impact, a sheet with the version ratio, and a status saved with its revision', async () => {
	grant({ admin: true, operator: true })
	mount('/admin/diagnostics')
	const row = await screen.findByRole('button', { name: /java.io.IOException/ })
	fireEvent.click(row)
	const sheet = await screen.findByRole('complementary', { name: 'Error details' })
	await within(sheet).findByText('Steps before the error')
	expect(within(sheet).getByText('×3.3')).toBeTruthy()
	expect(within(sheet).getByText('upload_failed')).toBeTruthy()
	expect(within(sheet).getByText(/storage_unavailable/)).toBeTruthy()
	fireEvent.click(within(sheet).getByRole('button', { name: 'Resolved' }))
	await waitFor(() =>
		expect(rpc.diagnostics.update).toHaveBeenCalledWith({
			fingerprint: issue.fingerprint,
			state: 'resolved',
			revision: 3,
		})
	)
	rpc.diagnostics.update.mockRejectedValueOnce({ code: 'CONFLICT' })
	fireEvent.click(within(sheet).getByRole('button', { name: 'Ignored' }))
	expect((await within(sheet).findByRole('alert')).textContent).toBe(
		'New data arrived. Refresh before changing the status.'
	)
	rpc.diagnostics.update.mockRejectedValueOnce(new Error('x'))
	fireEvent.click(within(sheet).getByRole('button', { name: 'Ignored' }))
	await waitFor(() =>
		expect(within(sheet).getByRole('alert').textContent).toBe('Status not saved. Refresh and try again.')
	)
	fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
	await waitFor(() => expect(where()).toBe('/admin/diagnostics'))
})

test('health: filters go to the API, and failures are said', async () => {
	grant({ operator: true })
	mount('/admin/diagnostics')
	await screen.findByRole('button', { name: /java.io.IOException/ })
	fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
	await waitFor(() =>
		expect(rpc.diagnostics.list).toHaveBeenLastCalledWith({ state: 'open', phase: 'upload', page: 0 })
	)
	fireEvent.click(screen.getByRole('button', { name: 'Resolved' }))
	await waitFor(() =>
		expect(rpc.diagnostics.list).toHaveBeenLastCalledWith({ state: 'resolved', phase: 'upload', page: 0 })
	)
	fireEvent.click(screen.getByRole('button', { name: /^All|Tous/ }))
	// The console's own count and the page's list both ask again.
	rpc.diagnostics.list.mockResolvedValue({ items: [], hasMore: true })
	fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
	await screen.findByText('No error groups match.')
	rpc.diagnostics.list.mockRejectedValue(new Error('down'))
	fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
	await screen.findByText('Diagnostics unavailable or operator access denied.')
})

test('health: a detail that cannot load says so', async () => {
	grant({ operator: true })
	rpc.diagnostics.detail.mockRejectedValue(new Error('gone'))
	mount(`/admin/diagnostics?issue=${issue.fingerprint}`)
	const sheet = await screen.findByRole('complementary', { name: 'Error details' })
	expect((await within(sheet).findByRole('alert')).textContent).toBe('Details unavailable or access revoked.')
})

test('platform: storage figures, role limits (changed in a dialog) and the access audit', async () => {
	grant({ admin: true })
	mount('/admin/platform')
	await screen.findByRole('heading', { name: 'Platform' })
	await screen.findByText('Administrator access granted')
	expect(screen.getByText('Publication approved')).toBeTruthy()
	expect(screen.getByText('Error group: Resolved')).toBeTruthy()
	expect(screen.getByText('Role limit changed')).toBeTruthy()
	expect(screen.getByText('Account deleted')).toBeTruthy()
	expect(screen.getByText('something_new')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Moderation' }))
	await waitFor(() => expect(screen.queryByText('Administrator access granted')).toBeNull())
	expect(screen.getByText('Publication approved')).toBeTruthy()
	expect(await screen.findByText('Where the bytes are, and what is still waiting')).toBeTruthy()
	const buttons = screen.getAllByRole('button', { name: 'Change the limit' })
	expect(buttons).toHaveLength(2)
	fireEvent.click(buttons[0] as HTMLElement)
	expect(await screen.findByRole('dialog')).toBeTruthy()
})

test('platform: a failure to load is said', async () => {
	grant({ admin: true })
	rpc.admin.journal.mockRejectedValue(new Error('down'))
	mount('/admin/platform')
	expect((await screen.findByRole('alert')).textContent).toBe('Could not load the dashboard. Try Refresh again.')
})

test('old links keep working: /moderation lands on the moderation page', async () => {
	grant({ moderator: true })
	mount('/moderation')
	await screen.findByRole('heading', { name: 'Moderation' })
	expect(where()).toBe('/admin/moderation')
})

test('growth: the funnel, the first-capture delay, retention by week and who holds the storage', async () => {
	grant({ admin: true })
	mount('/admin/growth')
	await screen.findByRole('heading', { name: 'Growth' })
	const figures = await screen.findByRole('region', { name: 'Key figures' })
	expect(within(figures).getByText('50 %')).toBeTruthy()
	expect(within(figures).getByText('26 min')).toBeTruthy()
	expect(within(figures).getByText('55 %')).toBeTruthy()
	expect(within(figures).getByText('61 %')).toBeTruthy()
	expect(screen.getByText('80 · 80 %')).toBeTruthy()
	expect(screen.getByRole('img', { name: 'Time to first capture' })).toBeTruthy()
	expect(screen.getByText('Median: 26 min, over 50 accounts')).toBeTruthy()
	expect(screen.getAllByRole('img', { name: 'Top 10% of accounts hold 55 % of the bytes' }).length).toBeGreaterThan(0)
	expect(screen.getByRole('columnheader', { name: 'W7' })).toBeTruthy()
	expect(screen.getByText('12 · 6 %')).toBeTruthy()
	expect(screen.getByText('10 · 83 %')).toBeTruthy()
})

test('growth: without uploads or cohorts old enough, the figures say so', async () => {
	grant({ admin: true })
	rpc.admin.analytics.mockResolvedValue({
		...analytics,
		firstCapture: { buckets: [0, 0, 0, 0, 0, 0], samples: 0, medianMinutes: null },
		cohorts: [{ weekStart: now, size: 3, active: [3] }],
	})
	mount('/admin/growth')
	expect(await screen.findByText('No account has uploaded yet.')).toBeTruthy()
	expect(screen.getAllByText('–').length).toBe(2)
})

test('worlds: biomes, dimensions, server share, sizes and the servers that two accounts share', async () => {
	grant({ admin: true })
	mount('/admin/worlds')
	await screen.findByRole('heading', { name: 'Worlds' })
	const figures = await screen.findByRole('region', { name: 'Key figures' })
	expect(within(figures).getByText('90 %')).toBeTruthy()
	expect(within(figures).getByText('60 %')).toBeTruthy()
	expect(within(figures).getByText('9')).toBeTruthy()
	expect(screen.getByText('plains')).toBeTruthy()
	expect(screen.getByRole('img', { name: 'Dimension: overworld 85 %, the_nether 15 %' })).toBeTruthy()
	expect(screen.getByText('Median: 28 MB')).toBeTruthy()
	expect(screen.getByRole('cell', { name: 'Shared SMP' })).toBeTruthy()
})

test('worlds: no server table when no server is shared, and the data waits while loading', async () => {
	grant({ admin: true })
	rpc.admin.analytics.mockResolvedValue({ ...analytics, worlds: { ...analytics.worlds, topServers: [] } })
	mount('/admin/worlds')
	await screen.findByRole('region', { name: 'Key figures' })
	expect(screen.queryByRole('cell', { name: 'Shared SMP' })).toBeNull()
})

test('platform: downloads by target, pairing outcomes and the API counters', async () => {
	grant({ admin: true })
	mount('/admin/platform')
	expect(await screen.findByText('neoforge-mc1.21.1')).toBeTruthy()
	expect(screen.getByText('412')).toBeTruthy()
	expect(
		screen.getByRole('img', { name: /Pairing, last 24 hours: Done 8, Rejected 1, Too many attempts 1/ })
	).toBeTruthy()
	expect(screen.getByText('5 · 0.5 %')).toBeTruthy()
	expect(screen.getByText('42 ms')).toBeTruthy()
})

test('platform: counters with nothing in them say so', async () => {
	grant({ admin: true })
	rpc.admin.analytics.mockResolvedValue({
		...analytics,
		traffic: { ...analytics.traffic, downloads: [], api: [], pairing: { done: 0, rejected: 0, limited: 0 } },
	})
	mount('/admin/platform')
	await screen.findByText('Where the bytes are, and what is still waiting')
	await waitFor(() => expect(screen.getAllByText('Nothing counted yet.')).toHaveLength(2))
})

test('the palette opens with Ctrl+K, filters pages by the rights, finds accounts and navigates', async () => {
	grant({ admin: true })
	mount('/admin')
	await screen.findByRole('heading', { name: 'Pulse' })
	fireEvent.keyDown(window, { key: 'x', ctrlKey: true })
	expect(screen.queryByRole('dialog')).toBeNull()
	fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
	const palette = await screen.findByRole('dialog', { name: 'Jump to…' })
	const input = within(palette).getByRole('textbox', { name: 'Search pages and accounts' })
	expect(within(palette).getAllByRole('button')).toHaveLength(5)
	fireEvent.change(input, { target: { value: 'plat' } })
	expect(
		within(palette)
			.getAllByRole('button')
			.map(button => button.textContent)
	).toEqual(['Platform/admin/platform'])
	fireEvent.change(input, { target: { value: 'zzz' } })
	await waitFor(() => expect(within(palette).getByText('No match.')).toBeTruthy())
	fireEvent.change(input, { target: { value: 'al' } })
	await waitFor(() =>
		expect(rpc.admin.users).toHaveBeenLastCalledWith({ query: 'al', role: 'all', page: 1 }, expect.anything())
	)
})

test('the palette moves with the arrows, Enter goes there, and a moderator only sees their pages', async () => {
	grant({ moderator: true })
	mount('/admin')
	await screen.findByRole('heading', { name: 'Pulse' })
	fireEvent.click(screen.getByRole('button', { name: /Jump to…/ }))
	const palette = await screen.findByRole('dialog', { name: 'Jump to…' })
	expect(
		within(palette)
			.getAllByRole('button')
			.map(button => button.textContent)
	).toEqual(['Pulse/admin', 'Moderation/admin/moderation'])
	const input = within(palette).getByRole('textbox')
	fireEvent.keyDown(input, { key: 'ArrowDown' })
	fireEvent.keyDown(input, { key: 'ArrowUp' })
	fireEvent.keyDown(input, { key: 'ArrowDown' })
	fireEvent.keyDown(input, { key: 'Enter' })
	await waitFor(() => expect(where()).toBe('/admin/moderation'))
	fireEvent.keyDown(window, { key: 'K', metaKey: true })
	const again = await screen.findByRole('dialog', { name: 'Jump to…' })
	fireEvent.change(within(again).getByRole('textbox'), { target: { value: 'zzz' } })
	fireEvent.keyDown(within(again).getByRole('textbox'), { key: 'Enter' })
	expect(where()).toBe('/admin/moderation')
})
