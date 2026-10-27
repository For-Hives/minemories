// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act, type ReactNode } from 'react'
import { Link, MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SiteLayout } from '../components/SiteLayout'
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
		snapshot = () => null
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
	vi.unstubAllEnvs()
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
			fireEvent.click(screen.getByRole('button', { name: '↻ Refresh' }))
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
	await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('alert')))
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
	expect(screen.getByRole('status').querySelector('.cinema-loading-line')).toBeTruthy()
	await act(async () => {
		mocks.viewerEvents?.onLoading('Preparing the 3D display…')
	})
	expect(screen.getByRole('status').textContent).toContain('Preparing the 3D display')
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

test('gallery offers one evolving world only for complete identities and excludes ambiguous old remote captures', async () => {
	const identity = {
		worldId: 'a'.repeat(64),
		zoneId: 'b'.repeat(64),
		captureMode: 'around',
		captureBounds: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 2 },
		captureOrigin: { x: 1, y: 1, z: 1 },
	}
	mocks.list.mockResolvedValue([
		{
			id: 'known',
			name: 'Known',
			size: 100,
			createdAt: '2026-10-01T12:00:00Z',
			metadata: { ...identity, worldName: 'Local', serverName: null, seed: '1', x: 1, y: 1, z: 1 },
		},
		{
			id: 'ambiguous',
			name: 'Old remote',
			size: 100,
			createdAt: '2026-10-01T12:00:00Z',
			metadata: { ...identity, worldName: null, serverName: 'Remote', seed: null, x: 1, y: 1, z: 1 },
		},
		{
			id: 'legacy',
			name: 'Legacy',
			size: 100,
			createdAt: '2026-10-01T12:00:00Z',
			metadata: { worldName: 'Legacy', serverName: null, seed: '1', x: null, y: null, z: null },
		},
	])
	mount(<GalleryPage />)
	const header = await screen.findAllByRole('link', { name: '▶ Open the world' })
	expect(header.map(link => link.getAttribute('href'))).toEqual(['/viewer?memory=known&timelapse=1'])
	fireEvent.click(await screen.findByRole('button', { name: /^Local/ }))
	fireEvent.click(screen.getByRole('button', { name: /^Remote/ }))
	fireEvent.click(screen.getByRole('button', { name: /^Legacy/ }))
	const links = screen.getAllByRole('link', { name: '▶ Open the world' })
	expect(links).toHaveLength(2)
	expect(new Set(links.map(link => link.getAttribute('href')))).toEqual(new Set(['/viewer?memory=known&timelapse=1']))
	expect(screen.getByText(/Evolving world · 1/)).toBeTruthy()
	expect(screen.getByText('Old remote')).toBeTruthy()
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
	fireEvent.click(screen.getByRole('link', { name: 'Create a space' }))
	expect(screen.getByLabelText('Display name')).toBeTruthy()
	expect(screen.getByLabelText('Email address')).toHaveProperty('value', 'test@example.com')
	expect(screen.getByLabelText('Password')).toHaveProperty('value', '')
	fireEvent.click(screen.getByRole('link', { name: 'Sign in' }))
	expect(screen.queryByLabelText('Display name')).toBeNull()
	fireEvent.click(screen.getByRole('link', { name: 'Create a space' }))
	credentials()
	fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Builder' } })
	fireEvent.click(screen.getByRole('button', { name: /Create my space/ }))
	await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/account', { replace: true }))
})

test('guests can open a local capture directly without authentication', () => {
	mount(<AuthPage mode="login" />)
	const input = screen.getByLabelText('Open my capture')
	fireEvent.change(input, { target: { files: [] } })
	expect(mocks.navigate).not.toHaveBeenCalled()
	const file = new File(['glb fixture'], 'cabin.glb', { type: 'model/gltf-binary' })
	fireEvent.change(input, { target: { files: [file] } })
	expect(mocks.context.setViewerFile).toHaveBeenCalledWith(file)
	expect(mocks.navigate).toHaveBeenCalledWith('/viewer')
	expect(mocks.signIn).not.toHaveBeenCalled()
	expect(screen.getByRole('link', { name: /Explore the public gallery/ }).getAttribute('href')).toBe('/explorer')
})

test('authentication uses a focused shell with help, language and legal links', () => {
	render(
		<MemoryRouter initialEntries={['/login']}>
			<SiteLayout>
				<AuthPage mode="login" />
			</SiteLayout>
		</MemoryRouter>
	)
	expect(screen.getByRole('main')).toBeTruthy()
	expect(screen.getByRole('link', { name: 'Need help?' }).getAttribute('href')).toBe('/faq')
	expect(screen.getByRole('combobox', { name: 'Language' })).toBeTruthy()
	expect(screen.getByRole('navigation', { name: 'Legal' })).toBeTruthy()
	expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull()
	expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('aria-current')).toBe('page')
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
	expect(screen.queryByLabelText('Open my capture')).toBeNull()
	expect(screen.getByRole('link', { name: /Explore the public gallery/ }).getAttribute('href')).toBe('/explorer')
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
	expect(screen.getByText('/explorer')).toBeTruthy()
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
	await screen.findByText('The first memory is still to come.')
	expect(screen.queryByRole('link', { name: /Open a local GLB/ })).toBeNull()
	expect(screen.queryByRole('button', { name: /Choose a local file/ })).toBeNull()
	expect(screen.getByText('Link your mod to send your first capture.')).toBeTruthy()
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
	fireEvent.click(await screen.findByRole('button', { name: 'Link my server ↗' }))
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
	fireEvent.click(screen.getByRole('button', { name: 'Link my server ↗' }))
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
	fireEvent.click(screen.getByRole('button', { name: 'Link my server ↗' }))
	await screen.findByRole('alert')
	fireEvent.click(screen.getByRole('button', { name: 'Link my server ↗' }))
	await screen.findByText('123 456')
	expect(mocks.create).toHaveBeenCalledTimes(2)
})
