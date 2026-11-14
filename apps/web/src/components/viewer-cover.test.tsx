// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import type { ViewerScene } from '../viewer-scene'
import { pictureOf } from './ViewerCover'
import { ViewerStudio } from './ViewerStudio'

const api = vi.hoisted(() => ({
	serverProfile: vi.fn(),
	setCover: vi.fn(),
}))
vi.mock('../api-client', () => ({ apiClient: { memories: api } }))

const shot = (letter: string, length = 64) => `data:image/jpeg;base64,${letter.repeat(length)}`

beforeEach(() => {
	api.serverProfile.mockResolvedValue({
		key: '["server","Lalaland"]',
		name: null,
		cover: null,
		defaultName: 'Lalaland',
	})
	api.setCover.mockResolvedValue({ ok: true })
})
afterEach(cleanup)

function mount(memoryId: string | null = 'frame-1') {
	const snapshot = vi.fn((_width: number, _height: number, _quality: number) => shot('A'))
	const scene = {
		setWeather: vi.fn(),
		setQuality: vi.fn(),
		setLighting: vi.fn(),
		setTour: vi.fn(),
		setFirstPerson: vi.fn(),
		setMinutes: vi.fn(),
		resetView: vi.fn(),
		snapshot,
		categories: vi.fn(() => []),
		isCategoryVisible: vi.fn(() => true),
		currentView: vi.fn(() => null),
		flight: { setControls: vi.fn(), setTouch: vi.fn(), onSpeedChange: null },
	}
	render(
		<I18nProvider initialLocale="en">
			<MemoryRouter>
				<ViewerStudio sceneRef={{ current: scene as unknown as ViewerScene }} memoryId={memoryId} ready />
			</MemoryRouter>
		</I18nProvider>
	)
	return { scene, snapshot }
}

function open() {
	fireEvent.click(screen.getByRole('button', { name: 'Server picture' }))
	return screen.getByRole('region', { name: 'Your server’s picture' })
}

test('the view on screen shows as the gallery card and the public card, named as the server, then is saved', async () => {
	const { snapshot } = mount()
	const panel = open()
	expect(snapshot).toHaveBeenCalledWith(400, 250, 0.8)
	const pictures = panel.querySelectorAll('img')
	expect([...pictures].map(image => image.getAttribute('src'))).toEqual([shot('A'), shot('A')])
	const name = (await within(panel).findByDisplayValue('Lalaland')) as HTMLInputElement
	expect(within(panel).getAllByText('Lalaland')).toHaveLength(2)
	// Typed as the game names it, the server keeps the game's name (no rename).
	fireEvent.click(within(panel).getByRole('button', { name: 'Use this picture' }))
	await waitFor(() => expect(api.setCover).toHaveBeenCalledWith({ id: 'frame-1', image: shot('A'), name: null }))
	expect(await screen.findByText('Saved: this view is now your server’s picture.')).toBeTruthy()
	expect(screen.queryByRole('region', { name: 'Your server’s picture' })).toBeNull()
	// A new name and a retaken view after moving the camera.
	const again = open()
	await within(again).findByDisplayValue('Lalaland')
	fireEvent.change(within(again).getByLabelText('Server name'), { target: { value: '  Our town ' } })
	expect(within(again).getAllByText('Our town')).toHaveLength(2)
	snapshot.mockReturnValue(shot('B'))
	fireEvent.click(within(again).getByRole('button', { name: 'Retake from this view' }))
	expect(again.querySelector('img')?.getAttribute('src')).toBe(shot('B'))
	fireEvent.click(within(again).getByRole('button', { name: 'Use this picture' }))
	await waitFor(() =>
		expect(api.setCover).toHaveBeenLastCalledWith({ id: 'frame-1', image: shot('B'), name: 'Our town' })
	)
	expect(name).toBeTruthy()
})

test('a failed save keeps the panel with a message; Escape and the cross close it', async () => {
	mount()
	let panel = open()
	await within(panel).findByDisplayValue('Lalaland')
	api.setCover.mockRejectedValueOnce(new Error('offline'))
	fireEvent.click(within(panel).getByRole('button', { name: 'Use this picture' }))
	expect(await within(panel).findByText('Could not save the picture. Try again.')).toBeTruthy()
	expect(within(panel).getByRole('button', { name: 'Use this picture' }).hasAttribute('disabled')).toBe(false)
	fireEvent.keyDown(window, { key: 'Escape' })
	expect(screen.queryByRole('region', { name: 'Your server’s picture' })).toBeNull()
	panel = open()
	fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
	expect(screen.queryByRole('region', { name: 'Your server’s picture' })).toBeNull()
	// Opening Atmosphere or Share closes it, and the reverse.
	open()
	fireEvent.click(screen.getByRole('button', { name: 'Atmosphere' }))
	expect(screen.queryByRole('region', { name: 'Your server’s picture' })).toBeNull()
})

test('without a profile the name is only sent when typed; a view that cannot be captured cannot be saved', async () => {
	api.serverProfile.mockRejectedValue(new Error('older API'))
	const { snapshot } = mount()
	let panel = open()
	await act(async () => undefined)
	fireEvent.click(within(panel).getByRole('button', { name: 'Use this picture' }))
	await waitFor(() => expect(api.setCover).toHaveBeenCalledWith({ id: 'frame-1', image: shot('A') }))
	panel = open()
	fireEvent.change(within(panel).getByLabelText('Server name'), { target: { value: 'Typed' } })
	fireEvent.click(within(panel).getByRole('button', { name: 'Use this picture' }))
	await waitFor(() => expect(api.setCover).toHaveBeenLastCalledWith({ id: 'frame-1', image: shot('A'), name: 'Typed' }))
	snapshot.mockReturnValue(null as unknown as string)
	panel = open()
	expect(within(panel).getByRole('alert').textContent).toBe(
		'This view could not be captured. Move the camera, then retake.'
	)
	expect(within(panel).getByRole('button', { name: 'Use this picture' }).hasAttribute('disabled')).toBe(true)
})

test('only the owner of a capture gets the button', () => {
	mount(null)
	expect(screen.queryByRole('button', { name: 'Server picture' })).toBeNull()
})

test('a busy view is saved at a lower quality until it fits, or not at all', () => {
	const sizes: Record<number, number> = { 0.8: 99_000, 0.65: 97_000, 0.5: 60_000 }
	const scene = { snapshot: vi.fn((_w: number, _h: number, quality: number) => shot('C', sizes[quality] ?? 200_000)) }
	expect(pictureOf(scene as unknown as ViewerScene)).toHaveLength(shot('C', 60_000).length)
	expect(scene.snapshot.mock.calls.map(call => call[2])).toEqual([0.8, 0.65, 0.5])
	const huge = { snapshot: () => shot('D', 200_000) }
	expect(pictureOf(huge as unknown as ViewerScene)).toBeNull()
	expect(pictureOf(null)).toBeNull()
})
