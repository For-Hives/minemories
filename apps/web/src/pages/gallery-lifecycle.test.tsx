// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SharePanel } from '../components/SharePanel'
import { type DialogTarget, GalleryDialog } from './GalleryDialog'
import { GalleryPage } from './GalleryPage'
import { ServerSheet } from './ServerSheet'

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
	await screen.findByRole('heading', { name: 'Cabin' }, { timeout: 10000 })
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
test('snapshot renaming keeps a cancelled draft, discards it on request, trims, retries and skips unchanged names', async () => {
	page()
	await expand()
	const pencil = screen.getByRole('button', { name: 'Rename Cabin' })
	fireEvent.click(pencil)
	const field = screen.getByLabelText('Snapshot name') as HTMLInputElement
	expect(document.activeElement).toBe(field)
	expect([field.selectionStart, field.selectionEnd]).toEqual([5, 5])
	expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
	// A trailing space is typed as is, but it is no change worth a draft.
	fireEvent.change(field, { target: { value: 'Cabin ' } })
	expect(field.value).toBe('Cabin ')
	expect(screen.queryByText('Draft — not saved yet')).toBeNull()
	expect(localStorage.getItem('minemories-form-drafts')).toBeNull()
	fireEvent.change(field, { target: { value: 'Discarded' } })
	expect(screen.getByText('Draft — not saved yet')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
	expect(mocks.rename).not.toHaveBeenCalled()
	expect(screen.getByRole('heading', { name: 'Cabin' })).toBeTruthy()
	expect(screen.getByText('Draft')).toBeTruthy()
	expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename Cabin' }))
	// A one-capture area renames the capture: the draft is the capture's, shared with its snapshot row.
	expect(Object.keys(JSON.parse(localStorage.getItem('minemories-form-drafts') ?? '{}'))).toEqual([
		JSON.stringify(['snapshot-name', 'local', 'one']),
	])

	fireEvent.click(screen.getByRole('button', { name: 'Rename Cabin' }))
	expect(screen.getByLabelText('Snapshot name')).toHaveProperty('value', 'Discarded')
	fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
	expect(screen.getByLabelText('Snapshot name')).toHaveProperty('value', 'Cabin')
	expect(document.activeElement).toBe(screen.getByLabelText('Snapshot name'))
	expect(screen.queryByText('Draft — not saved yet')).toBeNull()
	// Enter on an unchanged name only closes the field.
	fireEvent.submit(screen.getByLabelText('Snapshot name').closest('form') as HTMLFormElement)
	expect(screen.queryByLabelText('Snapshot name')).toBeNull()
	expect(mocks.rename).not.toHaveBeenCalled()

	fireEvent.click(screen.getByRole('button', { name: 'Rename Cabin' }))
	fireEvent.change(screen.getByLabelText('Snapshot name'), { target: { value: '  New cabin  ' } })
	mocks.rename.mockRejectedValueOnce(new Error('offline'))
	fireEvent.submit(screen.getByLabelText('Snapshot name').closest('form') as HTMLFormElement)
	expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not save this name.')
	expect(mocks.notify).toHaveBeenCalledWith('Could not save this name.')
	expect(screen.getByLabelText('Snapshot name')).toHaveProperty('value', '  New cabin  ')
	fireEvent.click(screen.getByRole('button', { name: 'Save' }))
	await screen.findByRole('heading', { name: 'New cabin' })
	expect(mocks.rename).toHaveBeenLastCalledWith({ id: 'one', name: 'New cabin' })
	expect(screen.getByText('Saved')).toBeTruthy()
	expect(screen.queryByText('Draft')).toBeNull()
	expect(localStorage.getItem('minemories-form-drafts')).toBeNull()
})
test('renaming from the right-click menu leaves focus in the field, caret at the end', async () => {
	page()
	await expand()
	fireEvent.contextMenu(card(), { clientX: 10, clientY: 10 })
	fireEvent.click(
		within(screen.getByRole('menu', { name: 'Cabin' })).getByRole('menuitem', { name: 'Rename this snapshot' })
	)
	const field = screen.getByLabelText('Snapshot name') as HTMLInputElement
	expect(screen.queryByRole('menu')).toBeNull()
	expect(document.activeElement).toBe(field)
	expect([field.selectionStart, field.selectionEnd]).toEqual([5, 5])
})
test('an unsaved area name survives leaving the gallery and is restored when editing starts again', async () => {
	memories.push(capture('two', 'Barn'))
	const view = page()
	await expand()
	fireEvent.click(screen.getByRole('button', { name: 'Rename this area' }))
	fireEvent.change(screen.getByLabelText('Stack name'), { target: { value: 'Half typed' } })
	fireEvent.keyDown(screen.getByLabelText('Stack name'), { key: 'Escape' })
	expect(screen.queryByLabelText('Stack name')).toBeNull()
	expect(screen.getByText('Draft')).toBeTruthy()
	view.unmount()
	page()
	await expand()
	expect(screen.getByText('Draft')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Rename this area' }))
	expect(screen.getByLabelText('Stack name')).toHaveProperty('value', 'Half typed')
	expect(screen.getByText('Draft — not saved yet')).toBeTruthy()
	fireEvent.change(screen.getByLabelText('Stack name'), { target: { value: 'Typed in full' } })
	fireEvent.keyDown(screen.getByLabelText('Stack name'), { key: 'Enter' })
	fireEvent.click(screen.getByRole('button', { name: 'Save' }))
	expect(await screen.findByRole('heading', { name: 'Typed in full' })).toBeTruthy()
	expect(screen.queryByText('Draft')).toBeNull()
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
	expect(await screen.findByText('My area')).toBeTruthy()
	expect(mocks.rename).not.toHaveBeenCalled()
	view.unmount()
	page()
	expect(await screen.findByText('My area')).toBeTruthy()
})
test('share panel creates, copies, replaces and revokes an explicit link', async () => {
	const copy = vi.fn().mockResolvedValue(undefined)
	Object.defineProperty(navigator, 'clipboard', { value: { writeText: copy }, configurable: true })
	page()
	await expand()
	fireEvent.click(within(card()).getByRole('button', { name: 'Share' }))
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
	expect(mocks.revokeShare).toHaveBeenCalledWith({ id: 'one', scope: 'memory' })
	expect(screen.queryByLabelText('Share link')).toBeNull()
})
test('sharing errors keep retry controls and do not expose raw errors', async () => {
	mocks.createShare.mockRejectedValueOnce(new Error('internal private secret'))
	page()
	await expand()
	fireEvent.click(within(card()).getByRole('button', { name: 'Share' }))
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
	fireEvent.click(within(card()).getByRole('button', { name: 'Share' }))
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
	const view = screen.getByRole('link', { name: 'View Cabin' })
	expect(view.getAttribute('href')).toBe('/viewer?memory=one')
	fireEvent.click(view)
	expect(mocks.setFile).toHaveBeenCalledWith(null)
})
test('an area with several snapshots has one View action and a dialog to manage each snapshot', async () => {
	memories = [capture('two', 'Barn'), capture('one', 'Cabin')]
	page()
	await screen.findByRole('heading', { name: 'Barn' })
	expect(screen.queryByRole('heading', { name: 'Cabin' })).toBeNull()
	expect(screen.getAllByRole('link', { name: /^View/ })).toHaveLength(1)
	const opener = screen.getByRole('button', { name: 'Manage Barn' })
	opener.focus()
	fireEvent.click(opener)
	const dialog = await screen.findByRole('dialog', { name: 'Barn' })
	expect(within(dialog).getByRole('tab', { name: 'Snapshots', selected: true })).toBeTruthy()
	expect(within(dialog).getAllByRole('listitem')).toHaveLength(2)
	fireEvent.click(within(dialog).getByRole('tab', { name: 'Share' }))
	fireEvent.click(await within(dialog).findByRole('button', { name: 'Create a link' }))
	await waitFor(() => expect(mocks.createShare).toHaveBeenCalledWith({ id: 'two', scope: 'memory' }))
	fireEvent.click(within(dialog).getByRole('tab', { name: 'Snapshots' }))
	fireEvent.click(within(dialog).getByRole('button', { name: 'Share this snapshot: Cabin' }))
	await waitFor(() => expect(mocks.shareStatus).toHaveBeenCalledWith({ id: 'one', scope: 'memory' }))
	fireEvent.click(within(dialog).getByRole('tab', { name: 'Snapshots' }))
	fireEvent.click(within(dialog).getByRole('button', { name: 'Move Cabin to trash' }))
	await waitFor(() => expect(mocks.trash).toHaveBeenCalledWith({ id: 'one' }))
	fireEvent.keyDown(document, { key: 'Escape' })
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	expect(document.activeElement).toBe(opener)
})
test('snapshots can be renamed from the manage dialog and the dialog traps keyboard focus', async () => {
	memories = [capture('two', 'Barn'), capture('one', 'Cabin')]
	page()
	fireEvent.click(await screen.findByRole('button', { name: 'Manage Barn' }))
	const dialog = await screen.findByRole('dialog', { name: 'Barn' })
	fireEvent.click(within(dialog).getByRole('button', { name: 'Rename Cabin' }))
	fireEvent.change(within(dialog).getByLabelText('Snapshot name'), { target: { value: '  Shed  ' } })
	fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
	await waitFor(() => expect(mocks.rename).toHaveBeenCalledWith({ id: 'one', name: 'Shed' }))
	await within(dialog).findByText('Shed')
	fireEvent.click(within(dialog).getByRole('button', { name: 'Rename Shed' }))
	fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
	const close = within(dialog).getByRole('button', { name: 'Close' })
	const controls = [...dialog.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input')]
	close.focus()
	fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
	expect(document.activeElement).toBe(controls.at(-1))
	fireEvent.keyDown(document, { key: 'Tab' })
	expect(document.activeElement).toBe(close)
	fireEvent.click(close)
	expect(screen.queryByRole('dialog')).toBeNull()
})

test('Escape in a snapshot rename stops editing but keeps the dialog open and the draft', async () => {
	memories = [capture('two', 'Barn'), capture('one', 'Cabin')]
	page()
	fireEvent.click(await screen.findByRole('button', { name: 'Manage Barn' }))
	const dialog = await screen.findByRole('dialog', { name: 'Barn' })
	fireEvent.click(within(dialog).getByRole('button', { name: 'Rename Cabin' }))
	fireEvent.change(within(dialog).getByLabelText('Snapshot name'), { target: { value: 'Cab' } })
	fireEvent.keyDown(within(dialog).getByLabelText('Snapshot name'), { key: 'Escape' })
	expect(screen.getByRole('dialog', { name: 'Barn' })).toBeTruthy()
	expect(within(dialog).queryByLabelText('Snapshot name')).toBeNull()
	expect(within(dialog).getByText('Draft')).toBeTruthy()
	expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Rename Cabin' }))
	fireEvent.keyDown(document, { key: 'Escape' })
	expect(screen.queryByRole('dialog')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Manage Barn' }))
	const reopened = await screen.findByRole('dialog', { name: 'Barn' })
	expect(within(reopened).getByText('Draft')).toBeTruthy()
	fireEvent.click(within(reopened).getByRole('button', { name: 'Rename Cabin' }))
	expect(within(reopened).getByLabelText('Snapshot name')).toHaveProperty('value', 'Cab')
})
test('a parent re-render (the 12 s refresh) never moves focus or the caret out of a dialog field', async () => {
	memories = [capture('two', 'Barn'), capture('one', 'Cabin')]
	const dialogProps = {
		title: 'Barn',
		memories,
		target: { tab: 'snapshots', id: 'two' } as DialogTarget,
		onTarget: vi.fn(),
		onChanged: vi.fn(),
		onTrashed: vi.fn(),
	}
	const view = render(
		<MemoryRouter>
			<GalleryDialog {...dialogProps} onClose={() => undefined} />
		</MemoryRouter>
	)
	fireEvent.click(screen.getByRole('button', { name: 'Rename Cabin' }))
	const field = screen.getByLabelText('Snapshot name') as HTMLInputElement
	fireEvent.change(field, { target: { value: 'Cabin by the lake' } })
	field.setSelectionRange(5, 5)
	view.rerender(
		<MemoryRouter>
			<GalleryDialog {...dialogProps} memories={structuredClone(memories)} onClose={() => undefined} />
		</MemoryRouter>
	)
	expect(document.activeElement).toBe(field)
	expect([field.selectionStart, field.selectionEnd]).toEqual([5, 5])
	view.unmount()

	const server = { key: 'world', name: 'World', captures: memories, areas: [] }
	const sheet = render(
		<MemoryRouter>
			<ServerSheet server={server} name="World" onRename={vi.fn()} onClose={() => undefined} />
		</MemoryRouter>
	)
	const name = screen.getByLabelText('Server name') as HTMLInputElement
	name.focus()
	fireEvent.change(name, { target: { value: 'Worldwide' } })
	name.setSelectionRange(3, 3)
	sheet.rerender(
		<MemoryRouter>
			<ServerSheet server={{ ...server }} name="World" onRename={vi.fn()} onClose={() => undefined} />
		</MemoryRouter>
	)
	expect(document.activeElement).toBe(name)
	expect([name.selectionStart, name.selectionEnd]).toEqual([3, 3])
})
test('a saved snapshot name shows at once, before the refreshed list brings it back', async () => {
	memories = [capture('two', 'Barn'), capture('one', 'Cabin')]
	render(
		<MemoryRouter>
			<GalleryDialog
				title="Barn"
				memories={memories}
				target={{ tab: 'snapshots', id: 'two' }}
				onTarget={vi.fn()}
				onChanged={vi.fn()}
				onTrashed={vi.fn()}
				onClose={vi.fn()}
			/>
		</MemoryRouter>
	)
	fireEvent.click(screen.getByRole('button', { name: 'Rename Cabin' }))
	fireEvent.change(screen.getByLabelText('Snapshot name'), { target: { value: 'Shed' } })
	fireEvent.submit(screen.getByLabelText('Snapshot name').closest('form') as HTMLFormElement)
	await screen.findByText('Saved')
	expect(screen.getByText('Shed').tagName).toBe('STRONG')
	expect(screen.queryByText('Cabin')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Rename Shed' }))
	expect(screen.getByLabelText('Snapshot name')).toHaveProperty('value', 'Shed')
	expect(screen.queryByText('Draft — not saved yet')).toBeNull()
})
test('the server name keeps its draft across closing the sheet, can discard it, and confirms a save', async () => {
	page()
	fireEvent.click(await screen.findByRole('button', { name: 'Rename World' }))
	let sheet = screen.getByRole('dialog', { name: 'World' })
	expect(within(sheet).getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
	fireEvent.change(within(sheet).getByLabelText('Server name'), { target: { value: 'Friends' } })
	expect(within(sheet).getByText('Draft — not saved yet')).toBeTruthy()
	fireEvent.keyDown(document, { key: 'Escape' })
	expect(screen.queryByRole('dialog')).toBeNull()
	expect(screen.getByRole('heading', { level: 3, name: 'World' })).toBeTruthy()
	// The tile shows that an unsaved name waits behind its pencil.
	expect(
		within(screen.getByRole('heading', { level: 3, name: 'World' }).parentElement as HTMLElement).getByText('Draft')
	).toBeTruthy()

	fireEvent.click(screen.getByRole('button', { name: 'Rename World' }))
	sheet = screen.getByRole('dialog', { name: 'World' })
	expect(within(sheet).getByLabelText('Server name')).toHaveProperty('value', 'Friends')
	expect(within(sheet).getByText('Draft — not saved yet')).toBeTruthy()
	fireEvent.click(within(sheet).getByRole('button', { name: 'Discard draft' }))
	expect(within(sheet).getByLabelText('Server name')).toHaveProperty('value', 'World')
	expect(within(sheet).queryByText('Draft — not saved yet')).toBeNull()

	// An empty name saves nothing, neither from the button nor from Enter.
	fireEvent.change(within(sheet).getByLabelText('Server name'), { target: { value: '  ' } })
	expect(within(sheet).getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
	fireEvent.submit(within(sheet).getByLabelText('Server name').closest('form') as HTMLFormElement)
	expect(within(sheet).getByRole('status').textContent).toBe('')
	fireEvent.change(within(sheet).getByLabelText('Server name'), { target: { value: ' Friends SMP ' } })
	fireEvent.submit(within(sheet).getByLabelText('Server name').closest('form') as HTMLFormElement)
	expect(screen.getByRole('dialog', { name: 'Friends SMP' })).toBeTruthy()
	expect(within(sheet).getByRole('status').textContent).toBe('Saved')
	expect(within(sheet).queryByText('Draft — not saved yet')).toBeNull()
	expect(localStorage.getItem('minemories-form-drafts')).toBeNull()
	fireEvent.keyDown(document, { key: 'Escape' })
	expect(screen.getByRole('heading', { level: 3, name: 'Friends SMP' })).toBeTruthy()
	expect(screen.queryByText('Draft')).toBeNull()
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
	expect(mocks.createShare).toHaveBeenLastCalledWith({ id: 'two', scope: 'memory' })
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
