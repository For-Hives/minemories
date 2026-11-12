// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { act, type ReactNode } from 'react'
import { Link, MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SiteLayout } from '../components/SiteLayout'
import { I18nProvider, translate } from '../i18n/I18n'
import { UnsupportedGlbError } from '../lib/glb'
import { AuthPage } from './AuthPage'
import { ContentLayout } from './ContentPages'
import { GalleryPage } from './GalleryPage'
import { ViewerPage } from './ViewerPage'

const mocks = vi.hoisted(() => ({
	viewerEvents: null as null | { onLoading(message: string | null): void; onEmptyChange(empty: boolean): void },
	context: {
		session: null as null | { user: { name: string } },
		isPending: false,
		refreshSession: vi.fn(),
		notify: vi.fn(),
		viewerFile: null as File | null,
		setViewerFile: vi.fn(),
	},
	signIn: vi.fn(),
	signUp: vi.fn(),
	signOut: vi.fn(),
	navigate: vi.fn(),
	list: vi.fn(),
	storage: vi.fn(),
	listTrash: vi.fn(),
	restore: vi.fn(),
	status: vi.fn(),
	create: vi.fn(),
	check: vi.fn(),
	loadFile: vi.fn(),
	dispose: vi.fn(),
	setMinutes: vi.fn(),
	resetView: vi.fn(),
	setCaptureContext: vi.fn(),
}))
vi.mock('../app-context', () => ({ useAppContext: () => mocks.context }))
vi.mock('../components/ui', () => ({
	buttonDark: '',
	buttonLime: '',
	buttonOutline: '',
	buttonQuiet: '',
	fileInputHidden: '',
	useAppContext: () => mocks.context,
	Eyebrow: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))
vi.mock('../auth-client', () => ({
	authClient: { signIn: { email: mocks.signIn }, signUp: { email: mocks.signUp }, signOut: mocks.signOut },
}))
vi.mock('../api-client', () => ({
	apiBase: 'http://localhost:3001',
	apiClient: {
		account: { storage: mocks.storage },
		memories: { list: mocks.list, listTrash: mocks.listTrash, restore: mocks.restore },
		pairing: { status: mocks.status, create: mocks.create, check: mocks.check },
	},
}))
vi.mock('react-router', async importOriginal => ({
	...(await importOriginal<typeof import('react-router')>()),
	useNavigate: () => mocks.navigate,
}))
vi.mock('../viewer-scene', () => ({
	formatClock: (minutes: number) => String(minutes),
	ViewerScene: class {
		constructor(_canvas: HTMLCanvasElement, events: NonNullable<typeof mocks.viewerEvents>) {
			mocks.viewerEvents = events
		}
		loadFile = mocks.loadFile
		dispose = mocks.dispose
		setMinutes = mocks.setMinutes
		setLighting = vi.fn()
		resetView = mocks.resetView
		setCaptureContext = mocks.setCaptureContext
		snapshot = () => null
	},
}))
beforeEach(() => {
	vi.clearAllMocks()
	// Form drafts live in localStorage: one test's typing must not reach the next.
	localStorage.clear()
	mocks.context.session = null
	mocks.context.isPending = false
	mocks.context.viewerFile = null
	mocks.signIn.mockResolvedValue({ error: null })
	mocks.signUp.mockResolvedValue({ error: null })
	mocks.list.mockResolvedValue([])
	mocks.storage.mockResolvedValue({
		usedBytes: 0,
		limitBytes: 2 * 1024 ** 3,
		availableBytes: 2 * 1024 ** 3,
		reservedBytes: 0,
		pendingDeletionBytes: 0,
	})
	mocks.listTrash.mockResolvedValue([])
	mocks.restore.mockResolvedValue({ ok: true })
	mocks.status.mockResolvedValue({ paired: false })
	mocks.create.mockResolvedValue({ code: '123456', expiresAt: '2026-09-30T14:00:00Z' })
	mocks.check.mockResolvedValue({ status: 'pending' })
	mocks.loadFile.mockResolvedValue(undefined)
})
afterEach(() => {
	cleanup()
	vi.useRealTimers()
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
})
function mount(children: ReactNode) {
	return render(<MemoryRouter>{children}</MemoryRouter>)
}
function credentials() {
	fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'test@example.com' } })
	fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-test-password' } })
}

test('a full gallery says where new memories go and how to make room, in one line of numbers', async () => {
	mocks.storage.mockResolvedValue({
		usedBytes: 2 * 1024 ** 3,
		limitBytes: 2 * 1024 ** 3,
		availableBytes: 0,
		reservedBytes: 1024,
		pendingDeletionBytes: 2048,
	})
	mount(<GalleryPage />)
	const storage = await screen.findByRole('region', { name: 'Gallery storage' })
	expect(storage.textContent).toContain('2 GiB/ 2 GiB')
	expect(storage.textContent).toContain(
		'Your gallery is full. New memories stay on your computer. To make room, use Delete forever in Trash.'
	)
	expect(storage.textContent).not.toMatch(/reserving|Deletion is still/)
	expect(storage.querySelector('details')).toBeNull()
	expect(screen.getByRole('link', { name: /Open a local GLB/ })).toBeTruthy()
})

test('a nearly full gallery still accepts uploads, so it does not claim to be full', async () => {
	mocks.storage.mockResolvedValue({
		usedBytes: 1000,
		limitBytes: 1024,
		availableBytes: 24,
		reservedBytes: 0,
		pendingDeletionBytes: 0,
	})
	mount(<GalleryPage />)
	const storage = await screen.findByRole('region', { name: 'Gallery storage' })
	expect(storage.querySelector('[data-level="full"]')).toBeTruthy()
	expect(storage.textContent).not.toContain('Your gallery is full.')
})

test('gallery storage loads, refreshes and discards stale numbers after a failed refresh', async () => {
	vi.useFakeTimers()
	let resolve:
		| ((value: Awaited<ReturnType<typeof import('../api-client').apiClient.account.storage>>) => void)
		| undefined
	mocks.storage.mockReturnValueOnce(
		new Promise(result => {
			resolve = result
		})
	)
	mount(<GalleryPage />)
	expect(screen.getByText('Checking available storage…')).toBeTruthy()
	await act(async () => {
		resolve?.({ usedBytes: 0, limitBytes: 1024, availableBytes: 1024, reservedBytes: 0, pendingDeletionBytes: 0 })
	})
	expect(screen.getByRole('region', { name: 'Gallery storage' }).textContent).toContain('0 B/ 1 KiB')
	mocks.storage.mockResolvedValueOnce({
		usedBytes: 1024,
		limitBytes: 1024,
		availableBytes: 0,
		reservedBytes: 0,
		pendingDeletionBytes: 0,
	})
	await act(async () => {
		await vi.advanceTimersByTimeAsync(12_000)
	})
	expect(screen.getByRole('region', { name: 'Gallery storage' }).textContent).toContain('Your gallery is full.')
	mocks.storage.mockRejectedValueOnce(new Error('private fixture failure'))
	await act(async () => {
		await vi.advanceTimersByTimeAsync(12_000)
	})
	expect(screen.queryByRole('region', { name: 'Gallery storage' })).toBeNull()
	expect(screen.getByText('Storage information is unavailable. Your captures remain accessible.')).toBeTruthy()
})

test.each([false, true])(
	'late storage response cannot replace a newer count or clear it on failure (%s)',
	async fails => {
		vi.useFakeTimers()
		let finish: (() => void) | undefined
		mocks.storage.mockReturnValueOnce(
			new Promise((resolve, reject) => {
				finish = fails
					? () => reject(new Error('old private failure'))
					: () =>
							resolve({
								usedBytes: 1024,
								limitBytes: 1024,
								availableBytes: 0,
								reservedBytes: 0,
								pendingDeletionBytes: 0,
							})
			})
		)
		mount(<GalleryPage />)
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
		})
		expect(screen.getByRole('region', { name: 'Gallery storage' }).textContent).toContain('0 B/ 2 GiB')
		if (!finish) throw new Error('Missing pending request')
		await act(async () => {
			finish?.()
		})
		expect(screen.getByRole('region', { name: 'Gallery storage' }).textContent).toContain('0 B/ 2 GiB')
	}
)
test('login submits credentials, refreshes the session and opens the gallery', async () => {
	mount(<AuthPage mode="login" />)
	expect(screen.getByRole('link', { name: 'Just visiting?' }).getAttribute('href')).toBe('/explore')
	credentials()
	fireEvent.click(screen.getByRole('button', { name: /Sign in/ }))
	await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/gallery', { replace: true }))
	expect(mocks.signIn).toHaveBeenCalledWith({ email: 'test@example.com', password: 'long-test-password' })
	expect(mocks.context.refreshSession).toHaveBeenCalledOnce()
})
test('registration submits the display name and exposes server errors', async () => {
	mocks.signUp.mockResolvedValue({ error: { message: 'Email already used' } })
	mount(<AuthPage mode="register" />)
	credentials()
	fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '  Builder  ' } })
	fireEvent.click(screen.getByRole('button', { name: /Create my account/ }))
	expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Email already used')
	await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('alert')))
	expect(mocks.signUp).toHaveBeenCalledWith({
		name: 'Builder',
		email: 'test@example.com',
		password: 'long-test-password',
	})
	expect(mocks.navigate).not.toHaveBeenCalled()
	expect(screen.getByRole('button', { name: /Create my account/ }).hasAttribute('disabled')).toBe(false)
})
test('gallery retries a failed refresh', async () => {
	mocks.list.mockRejectedValueOnce(new Error('Storage unavailable'))
	mount(<GalleryPage />)
	expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Storage unavailable')
	fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))
	await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
	expect(mocks.list).toHaveBeenCalledTimes(2)
})

test('gallery refresh turns while it reloads and ignores repeated clicks', async () => {
	mount(<GalleryPage />)
	await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1))
	let finish: (() => void) | undefined
	mocks.list.mockReturnValueOnce(new Promise(resolve => (finish = () => resolve([]))))
	const refresh = screen.getByRole('button', { name: 'Refresh' })
	expect(refresh.getAttribute('aria-busy')).toBe('false')
	fireEvent.click(refresh)
	expect(refresh.getAttribute('aria-busy')).toBe('true')
	fireEvent.click(refresh)
	expect(mocks.list).toHaveBeenCalledTimes(2)
	await act(async () => {
		finish?.()
	})
	await waitFor(() => expect(refresh.getAttribute('aria-busy')).toBe('false'))
})

test('trash displays the server recovery deadline for a migrated capture', async () => {
	vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-02-01T12:00:00Z'))
	mocks.listTrash.mockResolvedValue([
		{
			id: 'protected-capture',
			name: 'Recovered cabin',
			size: 20,
			createdAt: '2025-01-01T00:00:00Z',
			deletedAt: '2025-01-02T00:00:00Z',
			purgeAt: '2026-04-01T12:00:00Z',
			metadata: { thumbnail: null, icon: null },
		},
	])
	try {
		mount(<GalleryPage />)
		expect(await screen.findByText(/Gone in 59 days/)).toBeTruthy()
		mocks.listTrash.mockResolvedValue([])
		fireEvent.click(screen.getByRole('button', { name: /Restore/ }))
		await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith({ id: 'protected-capture' }))
		await waitFor(() => expect(screen.queryByText(/Gone in 59 days/)).toBeNull())
	} finally {
		vi.restoreAllMocks()
	}
})
test.each(['paired', 'expired', 'error'])('pairing polling reaches %s and stops after unmount', async status => {
	vi.useFakeTimers()
	if (status === 'error') mocks.check.mockRejectedValue(new Error('Offline'))
	else mocks.check.mockResolvedValue({ status })
	const view = mount(<GalleryPage />)
	await act(async () => {})
	const button = screen.getAllByRole('button', { name: /Get a code/ })[0]
	if (!button) throw new Error('Pairing button missing')
	fireEvent.click(button)
	await act(async () => {})
	expect(screen.getByRole('button', { name: 'Copy the code' }).textContent).toBe('123 456')
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1100)
	})
	const message = {
		paired: 'Your game is connected.',
		expired: 'This code expired. Generate a new one.',
		error: 'The code could not be checked. Get a new one.',
	}[status]
	if (!message) throw new Error('Missing status message')
	expect(screen.getAllByText(message).length).toBeGreaterThan(0)
	view.unmount()
	await act(async () => {
		await vi.advanceTimersByTimeAsync(20_000)
	})
	expect(mocks.check).toHaveBeenCalledOnce()
})
test('viewer loads a local file, handles errors and disposes its scene', async () => {
	const file = new File(['broken'], 'capture.glb')
	mocks.context.viewerFile = file
	mocks.loadFile.mockRejectedValue(new Error('Invalid GLB'))
	const view = mount(<ViewerPage />)
	expect(await screen.findByText('Invalid GLB')).toBeTruthy()
	expect(mocks.loadFile).toHaveBeenCalledWith(file)
	expect(screen.queryByRole('button', { name: /Night/ })).toBeNull()
	act(() => mocks.viewerEvents?.onEmptyChange(false))
	fireEvent.click(screen.getByRole('button', { name: /Night/ }))
	expect(mocks.setMinutes).toHaveBeenCalledWith(0)
	view.unmount()
	expect(mocks.dispose).toHaveBeenCalledOnce()
})
test('viewer file picker selects a file and opens the local viewer', () => {
	mount(<ViewerPage />)
	const file = new File(['glTF'], 'local.glb')
	fireEvent.change(screen.getByLabelText('Choose a GLB'), { target: { files: [file] } })
	expect(mocks.context.setViewerFile).toHaveBeenCalledWith(file)
	expect(mocks.navigate).toHaveBeenCalledWith('/viewer', { replace: true })
})

test('unmount cancels a pending pairing response without notifying or polling again', async () => {
	vi.useFakeTimers()
	let finish: ((value: { status: string }) => void) | undefined
	mocks.check.mockImplementation(
		() =>
			new Promise(resolve => {
				finish = resolve
			})
	)
	const view = mount(<GalleryPage />)
	await act(async () => {})
	const button = screen.getAllByRole('button', { name: /Get a code/ })[0]
	if (!button) throw new Error('Pairing button missing')
	fireEvent.click(button)
	await act(async () => {})
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1100)
	})
	view.unmount()
	await act(async () => {
		finish?.({ status: 'paired' })
		await vi.advanceTimersByTimeAsync(20_000)
	})
	expect(mocks.context.notify).not.toHaveBeenCalled()
	expect(mocks.check).toHaveBeenCalledOnce()
})

test('gallery memory takes precedence over a previous local file and shows download progress', async () => {
	mocks.context.viewerFile = new File(['old'], 'previous.glb')
	let finish: ((response: Response) => void) | undefined
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise<Response>(resolve => {
					finish = resolve
				})
		)
	)
	const view = render(
		<MemoryRouter initialEntries={['/viewer?memory=remote-id']}>
			<ViewerPage />
		</MemoryRouter>
	)
	expect(screen.getByText('Downloading the memory…')).toBeTruthy()
	expect(mocks.loadFile).not.toHaveBeenCalled()
	await act(async () => {
		finish?.(new Response(new Blob(['glTF'])))
	})
	await waitFor(() => expect(mocks.loadFile).toHaveBeenCalledOnce())
	expect(mocks.loadFile.mock.calls[0]?.[0].name).toBe('memory.glb')
	view.unmount()
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
})

test('failed memory downloads replace the progress indicator with an error', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
	render(
		<MemoryRouter initialEntries={['/viewer?memory=missing']}>
			<ViewerPage />
		</MemoryRouter>
	)
	expect(await screen.findByText('This memory is unavailable or access was revoked.')).toBeTruthy()
	expect(screen.queryByText('Téléchargement du souvenir…')).toBeNull()
	expect(mocks.loadFile).not.toHaveBeenCalled()
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
})

test.each(['local', 'gallery'])('the %s viewer shows the embedded-resource error and clears loading', async source => {
	const message = 'Invalid or overly complex GLB. Export a smaller area with embedded textures and geometry.'
	mocks.loadFile.mockImplementation(() => {
		mocks.viewerEvents?.onLoading(null)
		return Promise.reject(new UnsupportedGlbError(message))
	})
	if (source === 'local') mocks.context.viewerFile = new File(['unsafe'], 'external.glb')
	else vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['unsafe']))))
	try {
		render(
			<MemoryRouter initialEntries={[source === 'local' ? '/viewer' : '/viewer?memory=external']}>
				<ViewerPage />
			</MemoryRouter>
		)
		expect(
			await screen.findByText(
				'Invalid or overly complex GLB. Export a smaller area with embedded textures and geometry.'
			)
		).toBeTruthy()
		expect(screen.getByRole('alert').querySelector('.cinema-loading-line')).toBeNull()
		expect(screen.queryByText('Téléchargement du souvenir…')).toBeNull()
	} finally {
		vi.unstubAllGlobals()
	}
})

test('viewer keeps an animated loading status through model and GPU preparation', async () => {
	mocks.context.viewerFile = new File(['glTF'], 'capture.glb')
	let finish: (() => void) | undefined
	mocks.loadFile.mockImplementation(
		() =>
			new Promise<void>(resolve => {
				mocks.viewerEvents?.onLoading('Loading the model and textures…')
				finish = resolve
			})
	)
	mount(<ViewerPage />)
	expect(screen.getByRole('status').textContent).toContain('Loading the model')
	// the world-loading screen of the landing, over the stage: its chunk map and percentage
	expect(screen.getByRole('status').querySelector('.boot-map canvas')).toBeTruthy()
	expect(screen.getByRole('status').querySelector('.boot-pc')?.textContent).toBe('0%')
	await act(async () => {
		mocks.viewerEvents?.onLoading('Preparing the 3D display…')
	})
	expect(screen.getByRole('status').textContent).toContain('Preparing the 3D display')
	await act(async () => {
		mocks.viewerEvents?.onEmptyChange(false)
		mocks.viewerEvents?.onLoading(null)
		finish?.()
	})
	// a load that ended before the screen showed leaves without playing it
	await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
})

test('French translation does not change pairing state identifiers or hide the pending code', async () => {
	localStorage.clear()
	mocks.check.mockResolvedValue({ status: 'pending' })
	const view = mount(
		<I18nProvider initialLocale="fr">
			<GalleryPage />
		</I18nProvider>
	)
	await act(async () => {})
	const button = screen.getAllByRole('button', { name: /Obtenir un code/ })[0]
	if (!button) throw new Error('Pairing action missing')
	fireEvent.click(button)
	await act(async () => {})
	expect(screen.getByRole('button', { name: 'Copier le code' }).textContent).toBe('123 456')
	expect(screen.getByText('En attente de Minecraft…')).toBeTruthy()
	expect(
		screen.getByText('Dans Minecraft : M → tape ce code → Se connecter. Valable 5 minutes, une seule fois.')
	).toBeTruthy()
	// While a code waits, the empty gallery neither repeats where to type it nor offers a second code.
	expect(screen.queryByText('Dans Minecraft\u00a0: M → tape ce code → Se connecter.')).toBeNull()
	expect(screen.queryByText('Installe le mod, puis connecte ton jeu avec un code.')).toBeNull()
	expect(screen.queryByRole('button', { name: 'Obtenir un code' })).toBeNull()
	expect(document.body.textContent).not.toMatch(/[Rr]elier|appair/)
	view.unmount()
	localStorage.clear()
})

// Old remote tags without scope or seed are unidentified: they never stack with another capture.
test('gallery View opens the newest snapshot, with the timeline once an area holds several complete snapshots', async () => {
	const identity = {
		worldId: 'a'.repeat(64),
		zoneId: 'b'.repeat(64),
		captureMode: 'around',
		captureBounds: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 2 },
		captureOrigin: { x: 1, y: 1, z: 1 },
	}
	const entry = (id: string, name: string, createdAt: string, metadata: Record<string, unknown>) => ({
		id,
		name,
		size: 100,
		createdAt,
		metadata: { x: 1, y: 1, z: 1, capturedAt: null, ...metadata },
	})
	mocks.list.mockResolvedValue([
		entry('old', 'Old base', '2026-09-01T12:00:00Z', { ...identity, worldName: 'Local', serverName: null, seed: '1' }),
		entry('new', 'New base', '2026-10-01T12:00:00Z', { ...identity, worldName: 'Local', serverName: null, seed: '1' }),
		entry('solo', 'Solo', '2026-10-01T12:00:00Z', { ...identity, worldName: 'Alone', serverName: null, seed: '2' }),
		entry('remote-1', 'Remote one', '2026-09-01T12:00:00Z', {
			...identity,
			worldName: null,
			serverName: 'Remote',
			seed: null,
		}),
		entry('remote-2', 'Remote two', '2026-10-01T12:00:00Z', {
			...identity,
			worldName: null,
			serverName: 'Remote',
			seed: null,
		}),
		entry('legacy', 'Legacy', '2026-10-01T12:00:00Z', {
			worldName: 'Legacy',
			serverName: null,
			seed: '1',
			x: null,
			y: null,
			z: null,
		}),
	])
	localStorage.clear()
	mount(<GalleryPage />)
	const view = async (server: string, name: string) => {
		fireEvent.click(await screen.findByRole('button', { name: server }))
		expect(screen.getByRole('button', { name: server }).getAttribute('aria-pressed')).toBe('true')
		return (await screen.findByRole('link', { name })).getAttribute('href')
	}
	expect(await view('Local', 'View New base')).toBe('/viewer?memory=new&timelapse=1')
	expect(screen.getByRole('link', { name: 'Open · Local' }).getAttribute('href')).toBe('/viewer?memory=new&timelapse=1')
	expect(screen.getByRole('link', { name: 'Open · Alone' }).getAttribute('href')).toBe('/viewer?memory=solo')
	expect(screen.queryByRole('link', { name: 'View Solo' })).toBeNull()
	expect(await view('Alone', 'View Solo')).toBe('/viewer?memory=solo')
	expect(await view('Remote', 'View Remote two')).toBe('/viewer?memory=remote-2')
	expect(await view('Legacy', 'View Legacy')).toBe('/viewer?memory=legacy')
	expect(screen.queryByRole('link', { name: 'Timeline' })).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Rename Remote' }))
	const sheet = screen.getByRole('dialog', { name: 'Remote' })
	expect(within(sheet).getByText('Remote two')).toBeTruthy()
	fireEvent.change(within(sheet).getByLabelText('Server name'), { target: { value: 'Friends SMP' } })
	fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
	expect(screen.getByRole('dialog', { name: 'Friends SMP' })).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Close' }))
	expect(screen.getByRole('heading', { level: 3, name: 'Friends SMP' })).toBeTruthy()
	expect(screen.getByRole('button', { name: 'Friends SMP' })).toBeTruthy()
	fireEvent.contextMenu(screen.getByRole('button', { name: 'Friends SMP' }), { clientX: 40, clientY: 50 })
	const menu = screen.getByRole('menu', { name: 'Friends SMP' })
	expect(
		within(menu)
			.getAllByRole('menuitem')
			.map(item => item.textContent)
	).toEqual(['Open', 'Details', 'Rename this server'])
	fireEvent.keyDown(menu, { key: 'ArrowDown' })
	fireEvent.keyDown(menu, { key: 'ArrowUp' })
	fireEvent.click(within(menu).getByRole('menuitem', { name: 'Rename this server' }))
	expect(screen.queryByRole('menu')).toBeNull()
	fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restore “Remote”' }))
	fireEvent.keyDown(document, { key: 'Escape' })
	expect(screen.getByRole('button', { name: 'Remote' })).toBeTruthy()
	fireEvent.contextMenu(screen.getByRole('button', { name: 'Remote' }))
	fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
	expect(screen.queryByRole('menu')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Remote' }))
	fireEvent.contextMenu(screen.getByRole('article', { name: 'Remote two' }), { clientX: 10, clientY: 10 })
	const card = screen.getByRole('menu', { name: 'Remote two' })
	expect(
		within(card)
			.getAllByRole('menuitem')
			.map(item => item.textContent)
	).toEqual(['View', 'Details', 'Share', 'Public publication', 'Rename this snapshot', 'Move to trash'])
	fireEvent.click(within(card).getByRole('menuitem', { name: 'Details' }))
	const details = screen.getByRole('dialog', { name: 'Remote two' })
	expect(within(details).getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true')
	expect(within(details).getByText('X')).toBeTruthy()
	fireEvent.click(within(details).getByRole('button', { name: 'Close' }))
	fireEvent.contextMenu(screen.getByRole('article', { name: 'Remote two' }))
	fireEvent.pointerDown(document.body)
	expect(screen.queryByRole('menu')).toBeNull()
	expect(localStorage.getItem('minemories-stack-names')).not.toContain('Remote')
})

test('private viewer reports disabled restoration instead of parsing HTTP 202 and aborts its pending action on leave', async () => {
	const availability = {
		state: 'cold',
		readyObjects: 0,
		totalObjects: 2,
		restorationAvailable: false,
		retryAfterSeconds: null,
	}
	const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ availability }, { status: 202 }))
	vi.stubGlobal('fetch', fetch)
	const view = render(
		<MemoryRouter initialEntries={['/viewer?memory=cold-capture']}>
			<ViewerPage />
		</MemoryRouter>
	)
	await screen.findByRole('heading', { name: 'This memory is archived.' })
	expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy()
	expect(mocks.loadFile).not.toHaveBeenCalled()
	expect(screen.queryByText('Téléchargement du souvenir…')).toBeNull()
	view.unmount()
	expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
})

test('password visibility preserves the value, never submits, and resets outside the field', () => {
	mount(<AuthPage mode="login" />)
	const input = screen.getByLabelText('Password') as HTMLInputElement
	fireEvent.change(input, { target: { value: 'a private test phrase' } })
	fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
	expect(input.type).toBe('text')
	expect(input.value).toBe('a private test phrase')
	expect(mocks.signIn).not.toHaveBeenCalled()
	const hide = screen.getByRole('button', { name: 'Hide password' })
	fireEvent.blur(input, { relatedTarget: hide })
	expect(input.type).toBe('text')
	fireEvent.click(hide)
	expect(input.type).toBe('password')
	fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
	fireEvent.blur(input, { relatedTarget: screen.getByLabelText('Email address') })
	expect(input.type).toBe('password')
	expect(input.autocomplete).toBe('current-password')
})

test('registration keeps password guidance accessible and announces Caps Lock', () => {
	mount(<AuthPage mode="register" />)
	const input = screen.getByLabelText('Password') as HTMLInputElement
	expect(input.minLength).toBe(12)
	expect(input.autocomplete).toBe('new-password')
	const described = input
		.getAttribute('aria-describedby')
		?.split(' ')
		.map(id => document.getElementById(id)?.textContent)
		.join(' ')
	expect(described).toContain('At least 12 characters')
	const event = new KeyboardEvent('keydown', { bubbles: true, key: 'A' })
	Object.defineProperty(event, 'getModifierState', { value: () => true })
	fireEvent(input, event)
	expect(screen.getByRole('status').textContent).toBe('Caps Lock is on.')
	fireEvent.keyUp(input, { key: 'CapsLock' })
	expect(screen.getByRole('status').textContent).toBe('')
	expect(screen.getByText(/At least 12 characters/)).toBeTruthy()
})

test('switching auth modes keeps the intended destination through successful registration', async () => {
	function AuthRoute() {
		const location = useLocation()
		return <AuthPage key={location.pathname} mode={location.pathname === '/register' ? 'register' : 'login'} />
	}
	render(
		<MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/account' } }]}>
			<AuthRoute />
		</MemoryRouter>
	)
	credentials()
	fireEvent.click(screen.getByRole('link', { name: 'Create an account' }))
	expect(screen.getByLabelText('Display name')).toBeTruthy()
	expect(screen.getByLabelText('Email address')).toHaveProperty('value', 'test@example.com')
	expect(screen.getByLabelText('Password')).toHaveProperty('value', '')
	fireEvent.click(screen.getByRole('link', { name: 'Sign in' }))
	expect(screen.queryByLabelText('Display name')).toBeNull()
	fireEvent.click(screen.getByRole('link', { name: 'Create an account' }))
	credentials()
	fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Builder' } })
	fireEvent.click(screen.getByRole('button', { name: /Create my account/ }))
	await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/account', { replace: true }))
})

test('guests can open a local capture directly without authentication', () => {
	mount(<AuthPage mode="login" />)
	const input = screen.getByLabelText('Open a file')
	fireEvent.change(input, { target: { files: [] } })
	expect(mocks.navigate).not.toHaveBeenCalled()
	const file = new File(['glb fixture'], 'cabin.glb', { type: 'model/gltf-binary' })
	fireEvent.change(input, { target: { files: [file] } })
	expect(mocks.context.setViewerFile).toHaveBeenCalledWith(file)
	expect(mocks.navigate).toHaveBeenCalledWith('/viewer')
	expect(mocks.signIn).not.toHaveBeenCalled()
})

test('authentication keeps the site header with its language control', () => {
	render(
		<MemoryRouter initialEntries={['/login']}>
			<SiteLayout>
				<AuthPage mode="login" />
			</SiteLayout>
		</MemoryRouter>
	)
	expect(screen.getByRole('main')).toBeTruthy()
	expect(screen.getByRole('button', { name: 'Language English (US)' }).getAttribute('aria-haspopup')).toBe('listbox')
	expect(screen.getAllByRole('navigation', { name: 'Main navigation' }).length).toBeGreaterThan(0)
	fireEvent.click(screen.getAllByRole('button', { name: 'Product' })[0] as HTMLElement)
	expect(screen.getAllByRole('link', { name: 'How it works' }).length).toBeGreaterThan(0)
	expect(screen.getByRole('link', { name: 'Install the mod' }).getAttribute('href')).toBe('/installation')
	expect(
		screen.getAllByRole('link', { name: 'Sign in' }).some(link => link.getAttribute('aria-current') === 'page')
	).toBe(true)
	expect(screen.getByRole('contentinfo').textContent).toContain(
		'Minemories is not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.'
	)
})

test('the footer groups the site into product, guides, help, legal and elsewhere, with no retired page', () => {
	render(
		<MemoryRouter initialEntries={['/faq']}>
			<SiteLayout>
				<p>Body</p>
			</SiteLayout>
		</MemoryRouter>
	)
	const footer = screen.getByRole('contentinfo')
	for (const group of ['Product', 'Guides', 'Help', 'Legal', 'Elsewhere'])
		expect(within(footer).getByRole('navigation', { name: group })).toBeTruthy()
	expect(within(footer).getByRole('link', { name: 'Found a bug? Tell us on GitHub' }).getAttribute('href')).toBe(
		'https://github.com/For-Hives/minemories/issues'
	)
	expect(within(footer).getByRole('link', { name: 'How do I share a link?' }).getAttribute('href')).toBe('/sharing')
	for (const [name, href] of [
		['What if my server shuts down?', '/server-closing'],
		['Open my build in Blender', '/guides/minecraft-blender'],
		['Is it safe?', '/safety'],
	] as const)
		expect(within(footer).getByRole('link', { name }).getAttribute('href')).toBe(href)
	expect(within(footer).getByRole('link', { name: 'CurseForge' })).toBeTruthy()
	expect(within(footer).queryByRole('link', { name: 'Modrinth' })).toBeNull()
	const hrefs = within(footer)
		.getAllByRole('link')
		.map(link => link.getAttribute('href'))
	for (const retired of ['/discover', '/blog', '/changelog', '/ranking', '/nostalgia', '/open-source'])
		expect(hrefs).not.toContain(retired)
	expect(footer.textContent).toContain('Minemories is not an official Minecraft product.')
})

test('signing out forgets every unsaved form draft kept in this browser', async () => {
	mocks.context.session = { user: { name: 'Alex' } }
	mocks.signOut.mockResolvedValue({})
	localStorage.setItem('minemories-form-drafts', JSON.stringify({ x: { value: 'Private name', savedAt: Date.now() } }))
	render(
		<MemoryRouter initialEntries={['/account']}>
			<SiteLayout>
				<p>Body</p>
			</SiteLayout>
		</MemoryRouter>
	)
	fireEvent.click(screen.getByRole('button', { name: 'Alex — My account' }))
	fireEvent.click(screen.getAllByRole('button', { name: 'Sign out' })[0] as HTMLElement)
	expect(localStorage.getItem('minemories-form-drafts')).toBeNull()
	await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/'))
	expect(mocks.signOut).toHaveBeenCalledOnce()
	expect(mocks.context.refreshSession).toHaveBeenCalled()
})

test('the header and footer brand show the logo camera before the word, and a content page header the whole logo', () => {
	const view = render(
		<MemoryRouter initialEntries={['/missing-page']}>
			<SiteLayout>
				<ContentLayout eyebrow="404" title="Page not found">
					<p>Body</p>
				</ContentLayout>
			</SiteLayout>
		</MemoryRouter>
	)
	const brands = screen.getAllByRole('link', { name: 'Minemories' })
	expect(brands).toHaveLength(2)
	for (const brand of brands) expect(brand.querySelector('img')?.getAttribute('alt')).toBe('')
	// The header shows the whole logo alone (its name comes from the link's aria-label); the footer keeps the small mark and the word.
	const [header, footer] = brands
	expect(header?.querySelector('img')?.getAttribute('src')).toBe('/brand/minemories-logo.svg')
	expect(footer?.querySelector('img')?.getAttribute('src')).toBe('/brand/minemories-mark.svg')
	expect(header?.textContent).toBe('')
	expect(header?.querySelector('img')?.className).toBe('mm-brand-mark mm-brand-mark--solo')
	expect(footer?.textContent).toBe('Minemories')
	expect(footer?.querySelector('img')?.className).toBe('mm-brand-mark')
	// The full trademark notice sits in the footer of every page.
	expect(screen.getByRole('contentinfo').textContent).toContain(
		'Minemories is not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.'
	)
	const logo = view.container.querySelector('.mm-content-header img')
	expect(logo?.getAttribute('src')).toBe('/brand/minemories-logo.svg')
	expect(logo?.className).toBe('mm-brand-logo mm-content-logo')
})

test('pending authentication prevents duplicate submission and lets the user retry after failure', async () => {
	let finish: ((result: { error: { message: string } }) => void) | undefined
	mocks.signIn.mockReturnValueOnce(
		new Promise(resolve => {
			finish = resolve
		})
	)
	mount(<AuthPage mode="login" />)
	credentials()
	const button = screen.getByRole('button', { name: /Sign in/ })
	fireEvent.click(button)
	expect(button).toHaveProperty('disabled', true)
	expect(button.closest('form')?.getAttribute('aria-busy')).toBe('true')
	fireEvent.submit(button.closest('form') as HTMLFormElement)
	expect(mocks.signIn).toHaveBeenCalledOnce()
	await act(async () => {
		finish?.({ error: { message: 'Please retry' } })
	})
	await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('alert')))
	expect(button).toHaveProperty('disabled', false)
	expect(button.closest('form')?.getAttribute('aria-busy')).toBe('false')
	expect(screen.getByLabelText('Email address')).toHaveProperty('value', 'test@example.com')
	fireEvent.click(button)
	await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/gallery', { replace: true }))
})

test('a late sign-in response cannot redirect a visitor who has left the form', async () => {
	let finish: ((result: { error: null }) => void) | undefined
	mocks.signIn.mockReturnValueOnce(
		new Promise(resolve => {
			finish = resolve
		})
	)
	const view = mount(<AuthPage mode="login" />)
	credentials()
	fireEvent.click(screen.getByRole('button', { name: /Sign in/ }))
	view.unmount()
	await act(async () => {
		finish?.({ error: null })
	})
	expect(mocks.navigate).not.toHaveBeenCalled()
	expect(mocks.context.refreshSession).not.toHaveBeenCalled()
})

test('production auth and site navigation offer discovery without local file inputs', () => {
	vi.stubEnv('DEV', false)
	const view = render(
		<MemoryRouter initialEntries={['/login']}>
			<SiteLayout>
				<AuthPage mode="login" />
			</SiteLayout>
		</MemoryRouter>
	)
	expect(screen.queryByLabelText('Open a file')).toBeNull()
	expect(view.container.querySelector('input[type=file]')).toBeNull()
	view.unmount()
	const site = mount(
		<SiteLayout>
			<p>Public page</p>
		</SiteLayout>
	)
	expect(screen.queryByLabelText('Open a local GLB')).toBeNull()
	expect(site.container.querySelector('input[type=file]')).toBeNull()
})

test('production viewer without a memory opens discovery and ignores a stored local file', () => {
	vi.stubEnv('DEV', false)
	mocks.context.viewerFile = new File(['old'], 'previous.glb')
	function Location() {
		return <output>{useLocation().pathname}</output>
	}
	const view = render(
		<MemoryRouter initialEntries={['/viewer']}>
			<ViewerPage />
			<Location />
		</MemoryRouter>
	)
	expect(screen.getByText('/gallery')).toBeTruthy()
	expect(mocks.loadFile).not.toHaveBeenCalled()
	expect(view.container.querySelector('input[type=file]')).toBeNull()
})

test('production gallery still loads remote captures and rejects local drops', async () => {
	vi.stubEnv('DEV', false)
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['glTF']))))
	const view = render(
		<MemoryRouter initialEntries={['/viewer?memory=remote-id']}>
			<ViewerPage />
		</MemoryRouter>
	)
	await waitFor(() => expect(mocks.loadFile).toHaveBeenCalledOnce())
	expect(view.container.querySelector('input[type=file]')).toBeNull()
	const stage = screen.getByLabelText('Interactive 3D scene').parentElement
	if (!stage) throw new Error('Missing viewer stage')
	const file = new File(['test'], 'dropped.glb')
	fireEvent.dragEnter(stage, { dataTransfer: { files: [file] } })
	fireEvent.drop(stage, { dataTransfer: { files: [file] } })
	expect(mocks.context.setViewerFile).not.toHaveBeenCalled()
	expect(mocks.loadFile).toHaveBeenCalledOnce()
	expect(screen.queryByText('Drop your world here')).toBeNull()
})

test('production empty gallery guides pairing without offering local imports', async () => {
	vi.stubEnv('DEV', false)
	mount(<GalleryPage />)
	await screen.findByRole('heading', { name: 'No memories yet' })
	expect(screen.queryByRole('link', { name: /Open a local GLB/ })).toBeNull()
	expect(screen.queryByRole('button', { name: /Choose a local file/ })).toBeNull()
	expect(screen.getByText('Install the mod, then connect your game with a code.')).toBeTruthy()
	expect(screen.getByRole('button', { name: 'Get a code' })).toBeTruthy()
	expect(screen.getByRole('link', { name: /No mod yet\? Install Minemories/ }).getAttribute('href')).toBe(
		'/installation'
	)
})

test('a connected game with no memory yet says how to take the first one and send older ones', async () => {
	mocks.status.mockResolvedValue({ paired: true })
	mount(<GalleryPage />)
	expect(await screen.findByRole('heading', { level: 3, name: 'Your game is connected.' })).toBeTruthy()
	expect(screen.getByRole('heading', { level: 2, name: 'Your game is connected.' })).toBeTruthy()
	expect(screen.getByText('Press M → Take a memory. It will show up here.')).toBeTruthy()
	expect(screen.getByText('Memories from before? M → My memories → Send this memory.')).toBeTruthy()
	expect(screen.getByRole('button', { name: 'New code ↗' })).toBeTruthy()
	expect(screen.queryByRole('link', { name: /Install Minemories/ })).toBeNull()
})

test('a connected game silent for two months asks to check the mod, never to connect again', async () => {
	mocks.status.mockResolvedValue({ paired: true })
	mocks.list.mockResolvedValue([
		{ id: 'old', name: 'Old base', size: 100, createdAt: '2020-01-01T12:00:00Z', metadata: { capturedAt: null } },
	])
	mount(<GalleryPage />)
	expect(
		await screen.findByText(
			'No new memory for two months. Check that the mod is installed: in Minecraft, M should show Connected.'
		)
	).toBeTruthy()
	expect(screen.getByRole('heading', { level: 2, name: 'Your game is connected.' })).toBeTruthy()
	expect(screen.queryByRole('heading', { name: 'Connect your game to your gallery.' })).toBeNull()
	expect(screen.queryByRole('button', { name: /Get a code/ })).toBeNull()
	expect(screen.getByRole('button', { name: 'New code ↗' })).toBeTruthy()
})

test('leaving the private viewer aborts a pending download and never loads its late response', async () => {
	let finish: ((response: Response) => void) | undefined
	const fetcher = vi.fn(
		(_url: string, _init?: RequestInit) =>
			new Promise<Response>(resolve => {
				finish = resolve
			})
	)
	vi.stubGlobal('fetch', fetcher)
	const view = render(
		<MemoryRouter initialEntries={['/viewer?memory=abandoned']}>
			<ViewerPage />
		</MemoryRouter>
	)
	await waitFor(() => expect(fetcher).toHaveBeenCalled())
	const signal = fetcher.mock.calls[0]?.[1]?.signal
	view.unmount()
	expect(signal?.aborted).toBe(true)
	await act(async () => {
		finish?.(new Response(new Blob(['glTF'])))
	})
	expect(mocks.loadFile).not.toHaveBeenCalled()
	expect(mocks.dispose).toHaveBeenCalledTimes(1)
})

test('changing the remote capture aborts its old request and ignores the late file', async () => {
	let finishOld: ((response: Response) => void) | undefined
	const fetcher = vi
		.fn()
		.mockImplementationOnce(
			() =>
				new Promise<Response>(resolve => {
					finishOld = resolve
				})
		)
		.mockResolvedValueOnce(new Response('next'))
	vi.stubGlobal('fetch', fetcher)
	render(
		<MemoryRouter initialEntries={['/viewer?memory=old']}>
			<Link to="/viewer?memory=next">Next capture</Link>
			<ViewerPage />
		</MemoryRouter>
	)
	await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
	const signal = fetcher.mock.calls[0]?.[1]?.signal as AbortSignal
	fireEvent.click(screen.getByRole('link', { name: 'Next capture' }))
	await waitFor(() => expect(mocks.loadFile).toHaveBeenCalledTimes(1))
	expect(signal.aborted).toBe(true)
	expect(fetcher.mock.calls[1]?.[0]).toContain('/api/memories/next/file')
	expect(mocks.loadFile.mock.calls[0]?.[0].name).toBe('memory.glb')
	await act(async () => finishOld?.(new Response(new Blob(['obsolete capture']))))
	expect(mocks.loadFile).toHaveBeenCalledTimes(1)
})

test('a delayed previous pairing status cannot hide a newly requested code', async () => {
	let finish: ((status: { paired: boolean }) => void) | undefined
	mocks.status.mockReturnValueOnce(
		new Promise(resolve => {
			finish = resolve
		})
	)
	mount(<GalleryPage />)
	fireEvent.click(await screen.findByRole('button', { name: 'Get a code ↗' }))
	await screen.findByText('123 456')
	await act(async () => finish?.({ paired: true }))
	expect(screen.getByText('123 456')).toBeTruthy()
	expect(screen.getByText('Waiting for Minecraft…')).toBeTruthy()
})

test('leaving while a code is being created aborts both requests and never starts polling', async () => {
	vi.useFakeTimers()
	let finish: ((pairing: { code: string; expiresAt: string }) => void) | undefined
	mocks.create.mockReturnValueOnce(
		new Promise(resolve => {
			finish = resolve
		})
	)
	const view = mount(<GalleryPage />)
	fireEvent.click(screen.getByRole('button', { name: 'Get a code ↗' }))
	const statusSignal = mocks.status.mock.calls[0]?.[1]?.signal as AbortSignal
	const createSignal = mocks.create.mock.calls[0]?.[1]?.signal as AbortSignal
	view.unmount()
	expect(statusSignal.aborted).toBe(true)
	expect(createSignal.aborted).toBe(true)
	await act(async () => {
		finish?.({ code: '654321', expiresAt: '2026-10-16T20:00:00Z' })
		await vi.advanceTimersByTimeAsync(5000)
	})
	expect(mocks.check).not.toHaveBeenCalled()
	expect(mocks.context.notify).not.toHaveBeenCalled()
})
test('code creation failure remains recoverable and releases the busy control', async () => {
	mocks.create.mockRejectedValueOnce(new Error('Pairing unavailable'))
	mount(<GalleryPage />)
	fireEvent.click(screen.getByRole('button', { name: 'Get a code ↗' }))
	// The raw transport message never reaches the page: the failure is shown with a translated sentence.
	expect((await screen.findByRole('alert')).textContent).toContain('Could not create the code.')
	expect(screen.queryByText(/Pairing unavailable/)).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Get a code ↗' }))
	await screen.findByText('123 456')
	expect(mocks.create).toHaveBeenCalledTimes(2)
})
test('in French, gallery and pairing failures render the translated sentence, not the English key', async () => {
	mocks.list.mockRejectedValueOnce(new Error('private storage path'))
	mocks.create.mockRejectedValueOnce(new Error('Pairing unavailable'))
	render(
		<I18nProvider initialLocale="fr">
			<MemoryRouter>
				<GalleryPage />
			</MemoryRouter>
		</I18nProvider>
	)
	const loadError = translate('fr', 'The gallery is unavailable.')
	expect(loadError).not.toBe('The gallery is unavailable.')
	expect(await screen.findByText(loadError)).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: `${translate('fr', 'Get a code')} ↗` }))
	const pairingError = translate('fr', 'Could not create the code.')
	expect(pairingError).not.toBe('Could not create the code.')
	await waitFor(() =>
		expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes(pairingError))).toBe(true)
	)
	expect(screen.queryByText(/Could not create the code|The gallery is unavailable|Pairing unavailable/)).toBeNull()
})
