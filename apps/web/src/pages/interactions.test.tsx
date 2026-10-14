// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { UnsupportedGlbError } from '../lib/glb'
import { AuthPage } from './AuthPage'
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
	fileInputHidden: '',
	useAppContext: () => mocks.context,
	Eyebrow: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))
vi.mock('../auth-client', () => ({ authClient: { signIn: { email: mocks.signIn }, signUp: { email: mocks.signUp } } }))
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
		resetView = mocks.resetView
		setCaptureContext = mocks.setCaptureContext
	},
}))
beforeEach(() => {
	vi.clearAllMocks()
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
})
function mount(children: ReactNode) {
	return render(<MemoryRouter>{children}</MemoryRouter>)
}
function credentials() {
	fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'test@example.com' } })
	fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-test-password' } })
}

test('gallery explains a full quota, unfinished uploads and pending deletion without hiding captures', async () => {
	mocks.storage.mockResolvedValue({
		usedBytes: 2 * 1024 ** 3,
		limitBytes: 2 * 1024 ** 3,
		availableBytes: 0,
		reservedBytes: 1024,
		pendingDeletionBytes: 2048,
	})
	mount(<GalleryPage />)
	const storage = await screen.findByRole('region', { name: 'Gallery storage' })
	expect(storage.textContent).toContain('0 B available of 2 GiB')
	expect(storage.textContent).toContain('local GLB file on your computer')
	expect(storage.textContent).toContain('Delete forever in Trash')
	expect(storage.textContent).toContain('Deletion is still in progress for 2 KiB')
	expect(storage.textContent).toContain('Uploads are reserving 1 KiB')
	expect(screen.getByRole('link', { name: /Open a local GLB/ })).toBeTruthy()
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
	expect(screen.getByRole('region', { name: 'Gallery storage' }).textContent).toContain('1 KiB available')
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
	expect(screen.getByRole('region', { name: 'Gallery storage' }).textContent).toContain('0 B available')
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
			await vi.advanceTimersByTimeAsync(12_000)
		})
		expect(screen.getByRole('region', { name: 'Gallery storage' }).textContent).toContain('2 GiB available')
		if (!finish) throw new Error('Missing pending request')
		await act(async () => {
			finish?.()
		})
		expect(screen.getByRole('region', { name: 'Gallery storage' }).textContent).toContain('2 GiB available')
	}
)
test('login submits credentials, refreshes the session and opens the gallery', async () => {
	mount(<AuthPage mode="login" />)
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
	fireEvent.click(screen.getByRole('button', { name: /Create my space/ }))
	expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Email already used')
	expect(mocks.signUp).toHaveBeenCalledWith({
		name: 'Builder',
		email: 'test@example.com',
		password: 'long-test-password',
	})
	expect(mocks.navigate).not.toHaveBeenCalled()
	expect(screen.getByRole('button', { name: /Create my space/ }).hasAttribute('disabled')).toBe(false)
})
test('gallery retries a failed refresh', async () => {
	mocks.list.mockRejectedValueOnce(new Error('Storage unavailable'))
	mount(<GalleryPage />)
	expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Storage unavailable')
	fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))
	await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
	expect(mocks.list).toHaveBeenCalledTimes(2)
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
		expect(await screen.findByText(/gone in 59d/)).toBeTruthy()
		mocks.listTrash.mockResolvedValue([])
		fireEvent.click(screen.getByRole('button', { name: /Restore/ }))
		await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith({ id: 'protected-capture' }))
		await waitFor(() => expect(screen.queryByText(/gone in 59d/)).toBeNull())
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
	const button = screen.getAllByRole('button', { name: /Link my server/ })[0]
	if (!button) throw new Error('Pairing button missing')
	fireEvent.click(button)
	await act(async () => {})
	expect(screen.getByRole('button', { name: 'Copy the pairing code' }).textContent).toBe('123 456')
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1100)
	})
	const message = {
		paired: 'Your mod is paired.',
		expired: 'This code expired. Generate a new one.',
		error: 'Verification failed. Check that the API is running.',
	}[status]
	if (!message) throw new Error('Missing status message')
	expect(screen.getByText(message)).toBeTruthy()
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
	const button = screen.getAllByRole('button', { name: /Link my server/ })[0]
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
	expect(screen.getByText('Téléchargement du souvenir…')).toBeTruthy()
	expect(mocks.loadFile).not.toHaveBeenCalled()
	await act(async () => {
		finish?.(new Response(new Blob(['glTF'])))
	})
	await waitFor(() => expect(mocks.loadFile).toHaveBeenCalledOnce())
	expect(mocks.loadFile.mock.calls[0]?.[0].name).toBe('memory.glb')
	view.unmount()
	vi.unstubAllGlobals()
})

test('failed memory downloads replace the progress indicator with an error', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
	render(
		<MemoryRouter initialEntries={['/viewer?memory=missing']}>
			<ViewerPage />
		</MemoryRouter>
	)
	expect(await screen.findByText('Could not load this memory.')).toBeTruthy()
	expect(screen.queryByText('Téléchargement du souvenir…')).toBeNull()
	expect(mocks.loadFile).not.toHaveBeenCalled()
	vi.unstubAllGlobals()
})

test.each(['local', 'gallery'])('the %s viewer shows the embedded-resource error and clears loading', async source => {
	const message =
		'GLB invalide ou trop complexe : réexporte une zone plus petite avec ses textures et sa géométrie intégrées.'
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
		expect(await screen.findByText(message)).toBeTruthy()
		expect(screen.getByRole('status').querySelector('.animate-viewer-spin')).toBeNull()
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
				mocks.viewerEvents?.onLoading('Chargement du modèle et des textures…')
				finish = resolve
			})
	)
	mount(<ViewerPage />)
	expect(screen.getByRole('status').textContent).toContain('Chargement du modèle')
	expect(screen.getByRole('status').querySelector('.animate-viewer-spin')).toBeTruthy()
	await act(async () => {
		mocks.viewerEvents?.onLoading('Préparation de l’affichage 3D…')
	})
	expect(screen.getByRole('status').textContent).toContain('Préparation')
	await act(async () => {
		mocks.viewerEvents?.onEmptyChange(false)
		mocks.viewerEvents?.onLoading(null)
		finish?.()
	})
	expect(screen.queryByRole('status')).toBeNull()
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
	const button = screen.getAllByRole('button', { name: 'Relier mon Minecraft' })[0]
	if (!button) throw new Error('Pairing action missing')
	fireEvent.click(button)
	await act(async () => {})
	expect(screen.getByRole('button', { name: 'Copier le code d’appairage' }).textContent).toBe('123 456')
	expect(screen.getByText('En attente de Minecraft…')).toBeTruthy()
	view.unmount()
	localStorage.clear()
})
