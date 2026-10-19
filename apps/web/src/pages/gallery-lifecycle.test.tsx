// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SharePanel } from '../components/SharePanel'
import { GalleryPage } from './GalleryPage'

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	trashList: vi.fn(),
	trash: vi.fn(),
	restore: vi.fn(),
	remove: vi.fn(),
	rename: vi.fn(),
	shareStatus: vi.fn(),
	createShare: vi.fn(),
	revokeShare: vi.fn(),
	notify: vi.fn(),
	navigate: vi.fn(),
	setFile: vi.fn(),
}))
vi.mock('../app-context', () => ({
	useAppContext: () => ({ session: { user: { name: 'Tester' } }, notify: mocks.notify, setViewerFile: mocks.setFile }),
}))
vi.mock('../api-client', () => ({
	apiClient: {
		account: {
			storage: async () => ({
				availableBytes: 1000,
				limitBytes: 1000,
				usedBytes: 0,
				pendingDeletionBytes: 0,
				reservedBytes: 0,
			}),
		},
		pairing: { status: async () => ({ paired: false }) },
		memories: {
			list: mocks.list,
			listTrash: mocks.trashList,
			trash: mocks.trash,
			restore: mocks.restore,
			delete: mocks.remove,
			rename: mocks.rename,
			shareStatus: mocks.shareStatus,
			createShare: mocks.createShare,
			revokeShare: mocks.revokeShare,
		},
	},
}))
vi.mock('react-router', async original => ({
	...(await original<typeof import('react-router')>()),
	useNavigate: () => mocks.navigate,
}))
function capture(id = 'one', name = 'Cabin') {
	return {
		id,
		name,
		size: 100,
		createdAt: '2026-10-01T12:00:00Z',
		metadata: {
			worldName: 'World',
			serverName: null,
			seed: '1',
			x: 1,
			y: 2,
			z: 3,
			dayTime: null,
			biome: null,
			dimension: null,
			thumbnail: null,
			icon: null,
			capturedAt: null,
			raining: false,
			thundering: false,
		},
	}
}
let memories = [capture()]
let trash: Array<ReturnType<typeof capture> & { deletedAt: string; purgeAt: string }> = []
beforeEach(() => {
	vi.resetAllMocks()
	localStorage.clear()
	memories = [capture()]
	trash = []
	mocks.list.mockImplementation(async () => structuredClone(memories))
	mocks.trashList.mockImplementation(async () => structuredClone(trash))
	mocks.trash.mockImplementation(async ({ id }) => {
		const item = memories.find(m => m.id === id)
		if (item)
			trash.push({
				...item,
				deletedAt: new Date().toISOString(),
				purgeAt: new Date(Date.now() + 86400000).toISOString(),
			})
		memories = memories.filter(m => m.id !== id)
	})
	mocks.restore.mockImplementation(async ({ id }) => {
		const item = trash.find(m => m.id === id)
		if (item) memories.push(item)
		trash = trash.filter(m => m.id !== id)
	})
	mocks.remove.mockImplementation(async ({ id }) => {
		trash = trash.filter(m => m.id !== id)
	})
	mocks.rename.mockImplementation(async ({ id, name }) => {
		memories = memories.map(m => (m.id === id ? { ...m, name } : m))
	})
	mocks.shareStatus.mockResolvedValue({ shared: false })
	mocks.createShare.mockResolvedValue({ urlPath: '/share/fixture-token' })
	mocks.revokeShare.mockResolvedValue({ ok: true })
})
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	vi.useRealTimers()
	vi.unstubAllGlobals()
})
function page() {
	return render(
		<MemoryRouter>
			<GalleryPage />
		</MemoryRouter>
	)
}
async function expand() {
	fireEvent.click(await screen.findByRole('button', { name: /^World/ }, { timeout: 10000 }))
	await screen.findByRole('heading', { name: 'Cabin' })
}
function card(name = 'Cabin') {
	return screen.getByRole('heading', { name, level: 3 }).closest('article') as HTMLElement
}
function deferred<T>() {
	let resolve!: (value: T) => void, reject!: (error: Error) => void
	const promise = new Promise<T>((yes, no) => {
		resolve = yes
		reject = no
	})
	return { promise, resolve, reject }
}
test('capture moves to trash, restores, and is only permanently deleted after confirmation', async () => {
	page()
	await expand()
	fireEvent.click(screen.getByRole('button', { name: 'Move Cabin to trash' }))
	const bin = await screen.findByRole('region', { name: 'Trash' })
	expect(mocks.trash).toHaveBeenCalledWith({ id: 'one' })
	fireEvent.click(within(bin).getByRole('button', { name: '↩ Restore' }))
	await waitFor(() => expect(screen.queryByRole('region', { name: 'Trash' })).toBeNull())
	expect(screen.getByRole('heading', { name: 'Cabin' })).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Move Cabin to trash' }))
	await screen.findByRole('region', { name: 'Trash' })
	const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
	fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }))
	expect(mocks.remove).not.toHaveBeenCalled()
	confirm.mockReturnValue(true)
	fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }))
	await waitFor(() => expect(screen.queryByRole('region', { name: 'Trash' })).toBeNull())
	expect(mocks.remove).toHaveBeenCalledWith({ id: 'one' })
})
test.each(['trash', 'restore', 'remove'] as const)(
	'a failed %s action keeps the capture available and supports retry',
	async action => {
		if (action !== 'trash') {
			trash = [
				{ ...capture(), deletedAt: new Date().toISOString(), purgeAt: new Date(Date.now() + 86400000).toISOString() },
			]
			memories = []
		}
		mocks[action].mockRejectedValueOnce(new Error('fixture network unavailable'))
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		page()
		if (action === 'trash') await expand()
		else await screen.findByRole('region', { name: 'Trash' })
		const button = () =>
			screen.getByRole('button', {
				name: { trash: 'Move Cabin to trash', restore: '↩ Restore', remove: 'Delete forever' }[action],
			})
		fireEvent.click(button())
		await screen.findByRole('alert')
		expect(screen.getByRole('heading', { name: 'Cabin' })).toBeTruthy()
		fireEvent.click(button())
		await waitFor(() => expect(mocks[action]).toHaveBeenCalledTimes(2))
	}
)
test('snapshot renaming can be cancelled, trimmed, retried and left unchanged without an RPC', async () => {
	page()
	await expand()
	fireEvent.click(screen.getByRole('button', { name: 'Rename Cabin' }))
	fireEvent.change(screen.getByLabelText('Snapshot name'), { target: { value: 'Discarded' } })
	fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
	expect(mocks.rename).not.toHaveBeenCalled()
	fireEvent.click(screen.getByRole('button', { name: 'Rename Cabin' }))
	fireEvent.click(screen.getByRole('button', { name: 'Save' }))
	expect(mocks.rename).not.toHaveBeenCalled()
	fireEvent.click(screen.getByRole('button', { name: 'Rename Cabin' }))
	fireEvent.change(screen.getByLabelText('Snapshot name'), { target: { value: '  New cabin  ' } })
	mocks.rename.mockRejectedValueOnce(new Error('offline'))
	fireEvent.click(screen.getByRole('button', { name: 'Save' }))
	await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('Could not save this name.'))
	fireEvent.click(screen.getByRole('button', { name: 'Save' }))
	await screen.findByRole('heading', { name: 'New cabin' })
	expect(mocks.rename).toHaveBeenLastCalledWith({ id: 'one', name: 'New cabin' })
})
test('area names are local, support cancellation and survive reopening the gallery', async () => {
	memories.push(capture('two', 'Barn'))
	const view = page()
	await expand()
	fireEvent.click(screen.getByRole('button', { name: 'Rename this area' }))
	fireEvent.change(screen.getByLabelText('Stack name'), { target: { value: 'My area' } })
	fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
	expect(screen.queryByText('My area')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Rename this area' }))
	fireEvent.change(screen.getByLabelText('Stack name'), { target: { value: '  My area  ' } })
	fireEvent.click(screen.getByRole('button', { name: 'Save' }))
	expect(screen.getByText('My area')).toBeTruthy()
	expect(mocks.rename).not.toHaveBeenCalled()
	view.unmount()
	page()
	await expand()
	expect(screen.getByText('My area')).toBeTruthy()
})
test('share panel creates, copies, replaces and revokes an explicit link', async () => {
	const copy = vi.fn().mockResolvedValue(undefined)
	Object.defineProperty(navigator, 'clipboard', { value: { writeText: copy }, configurable: true })
	page()
	await expand()
	fireEvent.click(within(card()).getByRole('button', { name: '🔗 Share' }))
	fireEvent.click(await screen.findByRole('button', { name: 'Create a link' }))
	await screen.findByLabelText('Share link')
	expect(screen.getByLabelText('Share link')).toHaveProperty('value', `${window.location.origin}/share/fixture-token`)
	fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
	await waitFor(() => expect(copy).toHaveBeenCalledWith(`${window.location.origin}/share/fixture-token`))
	mocks.createShare.mockResolvedValueOnce({ urlPath: '/share/replaced-token' })
	fireEvent.click(screen.getByRole('button', { name: 'Replace active link' }))
	await waitFor(() =>
		expect(screen.getByLabelText('Share link')).toHaveProperty(
			'value',
			`${window.location.origin}/share/replaced-token`
		)
	)
	fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
	await screen.findByRole('button', { name: 'Create a link' })
	expect(mocks.revokeShare).toHaveBeenCalledWith({ id: 'one' })
	expect(screen.queryByLabelText('Share link')).toBeNull()
})
test('sharing errors keep retry controls and do not expose raw errors', async () => {
	mocks.createShare.mockRejectedValueOnce(new Error('internal private secret'))
	page()
	await expand()
	fireEvent.click(within(card()).getByRole('button', { name: '🔗 Share' }))
	fireEvent.click(await screen.findByRole('button', { name: 'Create a link' }))
	await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('Could not create this link.'))
	fireEvent.click(screen.getByRole('button', { name: 'Create a link' }))
	await screen.findByLabelText('Share link')
	mocks.revokeShare.mockRejectedValueOnce(new Error('offline'))
	fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
	await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('Could not stop sharing.'))
	expect(screen.getByLabelText('Share link')).toBeTruthy()
})
test('leaving a gallery prevents an obsolete share failure from notifying another page', async () => {
	const request = deferred<{ urlPath: string }>()
	mocks.createShare.mockReturnValueOnce(request.promise)
	const view = page()
	await expand()
	fireEvent.click(within(card()).getByRole('button', { name: '🔗 Share' }))
	fireEvent.click(await screen.findByRole('button', { name: 'Create a link' }))
	view.unmount()
	await act(async () => request.reject(new Error('late failure')))
	expect(mocks.notify).not.toHaveBeenCalled()
})
test.each([false, true])('an older gallery response cannot overwrite a newer refresh (failure: %s)', async fails => {
	const request = deferred<ReturnType<typeof capture>[]>()
	mocks.list.mockReturnValueOnce(request.promise)
	page()
	fireEvent.click(screen.getByRole('button', { name: '↻ Refresh' }))
	await expand()
	await act(async () => {
		if (fails) request.reject(new Error('obsolete failure'))
		else request.resolve([])
	})
	expect(screen.getByRole('heading', { name: 'Cabin' })).toBeTruthy()
})

test('a completed trash request does not notify or refresh after the gallery was left', async () => {
	const request = deferred<void>()
	mocks.trash.mockReturnValueOnce(request.promise)
	const view = page()
	await expand()
	fireEvent.click(screen.getByRole('button', { name: 'Move Cabin to trash' }))
	const calls = mocks.list.mock.calls.length
	view.unmount()
	await act(async () => request.resolve())
	expect(mocks.notify).not.toHaveBeenCalled()
	expect(mocks.list).toHaveBeenCalledTimes(calls)
})
test('a rename rejected after leaving does not notify the next page', async () => {
	const request = deferred<void>()
	mocks.rename.mockReturnValueOnce(request.promise)
	const view = page()
	await expand()
	fireEvent.click(screen.getByRole('button', { name: 'Rename Cabin' }))
	fireEvent.change(screen.getByLabelText('Snapshot name'), { target: { value: 'New cabin' } })
	fireEvent.click(screen.getByRole('button', { name: 'Save' }))
	view.unmount()
	await act(async () => request.reject(new Error('late failure')))
	expect(mocks.notify).not.toHaveBeenCalled()
})
test('opening a gallery capture clears the previous local file and navigates by its ID', async () => {
	page()
	await expand()
	fireEvent.click(screen.getByRole('button', { name: '↗ Revisit' }))
	expect(mocks.setFile).toHaveBeenCalledWith(null)
	expect(mocks.navigate).toHaveBeenCalledWith('/viewer?memory=one')
})

test('a late trash listing cannot resurrect a capture that has just been restored', async () => {
	const deleted = {
		...capture(),
		deletedAt: new Date().toISOString(),
		purgeAt: new Date(Date.now() + 86400000).toISOString(),
	}
	memories = []
	trash = [deleted]
	const request = deferred<typeof trash>()
	mocks.trashList.mockReturnValueOnce(request.promise)
	page()
	fireEvent.click(screen.getByRole('button', { name: '↻ Refresh' }))
	await screen.findByRole('region', { name: 'Trash' })
	fireEvent.click(screen.getByRole('button', { name: '↩ Restore' }))
	await waitFor(() => expect(screen.queryByRole('region', { name: 'Trash' })).toBeNull())
	await act(async () => request.resolve([deleted]))
	expect(screen.queryByRole('region', { name: 'Trash' })).toBeNull()
	expect(screen.getByRole('button', { name: /^World/ })).toBeTruthy()
})

test('changing the shared capture discards the old link even if creation finishes late', async () => {
	const request = deferred<{ urlPath: string }>()
	mocks.createShare.mockReturnValueOnce(request.promise)
	const view = render(
		<MemoryRouter>
			<SharePanel memoryId="one" />
		</MemoryRouter>
	)
	fireEvent.click(await screen.findByRole('button', { name: 'Create a link' }))
	view.rerender(
		<MemoryRouter>
			<SharePanel memoryId="two" />
		</MemoryRouter>
	)
	await screen.findByRole('button', { name: 'Create a link' })
	await act(async () => request.resolve({ urlPath: '/share/obsolete' }))
	expect(screen.queryByLabelText('Share link')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Create a link' }))
	await screen.findByLabelText('Share link')
	expect(mocks.createShare).toHaveBeenLastCalledWith({ id: 'two' })
})

test('a slow automatic refresh is not duplicated and its timer stops on exit', async () => {
	vi.useFakeTimers()
	const request = deferred<ReturnType<typeof capture>[]>()
	mocks.list.mockReturnValueOnce(request.promise)
	const view = page()
	await act(async () => {
		await vi.advanceTimersByTimeAsync(25000)
	})
	expect(mocks.list).toHaveBeenCalledTimes(1)
	await act(async () => request.resolve([capture()]))
	await act(async () => {
		await vi.advanceTimersByTimeAsync(12000)
	})
	expect(mocks.list).toHaveBeenCalledTimes(2)
	view.unmount()
	await act(async () => {
		await vi.advanceTimersByTimeAsync(24000)
	})
	expect(mocks.list).toHaveBeenCalledTimes(2)
})
