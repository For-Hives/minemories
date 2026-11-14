// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { CONTROLS_STORAGE_KEY, defaultControls } from '../lib/flight-controls'
import { chooseOption } from '../testing/site-select'
import type { ViewerScene } from '../viewer-scene'
import { ViewerStudio } from './ViewerStudio'

beforeEach(() => localStorage.clear())
afterEach(() => {
	cleanup()
	vi.useRealTimers()
})

function mount() {
	const flight = { setControls: vi.fn(), setTouch: vi.fn(), onSpeedChange: null as ((speed: number) => void) | null }
	const scene = {
		setWeather: vi.fn(),
		setQuality: vi.fn(),
		setLighting: vi.fn(),
		setTour: vi.fn(),
		setFirstPerson: vi.fn(),
		setMinutes: vi.fn(),
		resetView: vi.fn(),
		snapshot: vi.fn(),
		categories: vi.fn(() => []),
		isCategoryVisible: vi.fn(() => true),
		setCategoryVisible: vi.fn(),
		flight,
	}
	render(
		<I18nProvider initialLocale="en">
			<ViewerStudio sceneRef={{ current: scene as unknown as ViewerScene }} ready />
		</I18nProvider>
	)
	fireEvent.click(screen.getByRole('button', { name: 'First person' }))
	return scene
}

const lastControls = (scene: ReturnType<typeof mount>) => scene.flight.setControls.mock.lastCall?.[0]
const keyButton = (name: string) => screen.getByRole('button', { name })

test('keys are rebound by pressing them, remembered, and shown with the chosen layout', () => {
	const scene = mount()
	expect(lastControls(scene)).toEqual(defaultControls)
	fireEvent.click(screen.getByRole('button', { name: 'Controls' }))
	const forward = keyButton('Forward, key 1')
	expect(forward.textContent).toBe('W')
	fireEvent.click(forward)
	expect(forward.textContent).toBe('Press a key…')
	// The key goes to the binding, not to the viewer's own shortcuts.
	fireEvent.keyDown(window, { key: 'r', code: 'KeyR' })
	expect(scene.resetView).not.toHaveBeenCalled()
	expect(keyButton('Forward, key 1').textContent).toBe('R')
	expect(lastControls(scene).bindings.forward).toEqual(['KeyR', 'ArrowUp'])
	expect(JSON.parse(localStorage.getItem(CONTROLS_STORAGE_KEY) ?? '{}').bindings.forward[0]).toBe('KeyR')
	// Escape cancels, Tab is refused, Backspace empties the slot.
	fireEvent.click(keyButton('Forward, key 2'))
	fireEvent.keyDown(window, { code: 'Tab' })
	fireEvent.keyDown(window, { code: 'Escape' })
	expect(keyButton('Forward, key 2').textContent).toBe('↑')
	fireEvent.click(keyButton('Forward, key 2'))
	fireEvent.keyDown(window, { code: 'Backspace' })
	expect(keyButton('Forward, key 2').textContent).toBe('Not set')
	// Clicking a waiting slot again stops waiting.
	fireEvent.click(keyButton('Back, key 1'))
	fireEvent.click(keyButton('Back, key 1'))
	expect(keyButton('Back, key 1').textContent).toBe('S')
	// AZERTY labels the same physical keys.
	fireEvent.click(keyButton('Back, key 2'))
	fireEvent.keyDown(window, { code: 'KeyW' })
	chooseOption('Keyboard layout', 'AZERTY')
	expect(keyButton('Back, key 2').textContent).toBe('Z')
	expect(keyButton('Left, key 1').textContent).toBe('Q')
	expect(lastControls(scene).layout).toBe('azerty')
	// Ctrl can be bound, with a warning.
	expect(screen.queryByRole('alert')).toBeNull()
	fireEvent.click(keyButton('Sprint, key 1'))
	fireEvent.keyDown(window, { code: 'ControlLeft', ctrlKey: true })
	expect(screen.getByRole('alert').textContent).toContain('Ctrl+W closes the tab')
	expect(screen.getByRole('button', { name: 'Minecraft Java' }).getAttribute('aria-pressed')).toBe('false')
	fireEvent.click(screen.getByRole('button', { name: 'Minecraft Java' }))
	expect(screen.getByRole('button', { name: 'Minecraft Java' }).getAttribute('aria-pressed')).toBe('true')
	expect(lastControls(scene).bindings.down).toEqual(['ShiftLeft', null])
	expect(screen.getByRole('region', { name: 'Explore' }).textContent).toContain(
		'Z Q S D fly · Space up · Left Shift down · R or Z twice'
	)
	fireEvent.click(screen.getByRole('button', { name: 'Viewer' }))
	expect(lastControls(scene).bindings.sprint).toEqual(['ShiftLeft', 'ShiftRight'])
	cleanup()
	// Remembered for the next visit.
	const again = mount()
	expect(lastControls(again).layout).toBe('azerty')
})

test('sensitivity, inverted look and field of view effects are settings; Reset brings the defaults back', () => {
	const scene = mount()
	fireEvent.click(screen.getByRole('button', { name: 'Controls' }))
	fireEvent.change(screen.getByLabelText('Mouse sensitivity 50%'), { target: { value: '80' } })
	expect(lastControls(scene).sensitivity).toBe(0.8)
	fireEvent.change(screen.getByLabelText('Touch sensitivity 50%'), { target: { value: '20' } })
	expect(lastControls(scene).touchSensitivity).toBe(0.2)
	fireEvent.click(screen.getByLabelText('Invert vertical look'))
	expect(lastControls(scene).invertY).toBe(true)
	fireEvent.click(screen.getByLabelText('Wider view when flying fast'))
	expect(lastControls(scene).fovEffects).toBe(false)
	fireEvent.click(screen.getByRole('button', { name: 'Reset controls' }))
	expect(lastControls(scene)).toEqual(defaultControls)
	fireEvent.click(screen.getByRole('button', { name: 'Close controls' }))
	expect(screen.queryByRole('region', { name: 'Controls' })).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Controls' }))
	fireEvent.keyDown(window, { key: 'Escape' })
	expect(screen.queryByRole('region', { name: 'Controls' })).toBeNull()
})

test('a key that flies never also triggers a viewer shortcut while flying', () => {
	const scene = mount()
	fireEvent.click(screen.getByRole('button', { name: 'Controls' }))
	fireEvent.click(screen.getByRole('button', { name: 'Minecraft Java' }))
	fireEvent.click(screen.getByRole('button', { name: 'Close controls' }))
	fireEvent.keyDown(window, { key: 'r', code: 'KeyR' })
	expect(scene.resetView).not.toHaveBeenCalled()
	fireEvent.keyDown(window, { key: 't', code: 'KeyT' })
	expect(scene.setTour).toHaveBeenLastCalledWith(true)
})

test('the wheel speed shows for a moment', () => {
	vi.useFakeTimers()
	const scene = mount()
	act(() => scene.flight.onSpeedChange?.(1.5))
	expect(screen.getByRole('status').textContent).toBe('Flying speed 150%')
	act(() => scene.flight.onSpeedChange?.(1.6))
	act(() => vi.advanceTimersByTime(1499))
	expect(screen.getByRole('status').textContent).toBe('Flying speed 160%')
	act(() => vi.advanceTimersByTime(1))
	expect(screen.queryByRole('status')).toBeNull()
})

test('a finger brings the stick and climb buttons; the stick sprints at its edge', () => {
	const scene = mount()
	expect(screen.queryByRole('application', { name: 'Move' })).toBeNull()
	fireEvent.pointerDown(document.body, { pointerType: 'touch' })
	expect(document.querySelector('.viewer-studio')?.classList.contains('is-touch-flying')).toBe(true)
	expect(screen.getByRole('region', { name: 'Explore' }).textContent).toContain('Left thumb flies')
	const stick = screen.getByRole('application', { name: 'Move' })
	fireEvent.pointerDown(stick, { pointerId: 7, pointerType: 'touch', clientX: 24, clientY: 0 })
	expect(scene.flight.setTouch).toHaveBeenLastCalledWith({
		forward: -0,
		strafe: 0.5,
		up: false,
		down: false,
		sprint: false,
	})
	// A second finger on the stick is ignored.
	fireEvent.pointerDown(stick, { pointerId: 8, pointerType: 'touch', clientX: 0, clientY: 0 })
	fireEvent.pointerMove(stick, { pointerId: 8, pointerType: 'touch', clientX: 0, clientY: 48 })
	fireEvent.pointerMove(stick, { pointerId: 7, pointerType: 'touch', clientX: 0, clientY: -200 })
	expect(scene.flight.setTouch).toHaveBeenLastCalledWith({
		forward: 1,
		strafe: 0,
		up: false,
		down: false,
		sprint: true,
	})
	fireEvent.pointerUp(stick, { pointerId: 8 })
	fireEvent.pointerUp(stick, { pointerId: 7 })
	expect(scene.flight.setTouch).toHaveBeenLastCalledWith({
		forward: 0,
		strafe: 0,
		up: false,
		down: false,
		sprint: false,
	})
	fireEvent.pointerMove(stick, { pointerId: 7, pointerType: 'touch', clientX: 0, clientY: -48 })
	fireEvent.pointerCancel(stick)
	const up = screen.getByRole('button', { name: 'Fly up' })
	fireEvent.pointerDown(up, { pointerId: 9, pointerType: 'touch' })
	expect(scene.flight.setTouch).toHaveBeenLastCalledWith(expect.objectContaining({ up: true }))
	fireEvent.pointerUp(up, { pointerId: 9 })
	expect(scene.flight.setTouch).toHaveBeenLastCalledWith(expect.objectContaining({ up: false }))
	const down = screen.getByRole('button', { name: 'Fly down' })
	fireEvent.pointerDown(down, { pointerId: 10, pointerType: 'touch' })
	fireEvent.pointerCancel(down)
	expect(scene.flight.setTouch).toHaveBeenLastCalledWith(expect.objectContaining({ down: false }))
	expect(fireEvent.contextMenu(down)).toBe(false)
	const pinch = new Event('gesturestart', { cancelable: true })
	document.dispatchEvent(pinch)
	expect(pinch.defaultPrevented).toBe(true)
	// A mouse click hides them again; leaving the flight lets go of everything.
	fireEvent.pointerDown(document.body, { pointerType: 'mouse' })
	expect(screen.queryByRole('application', { name: 'Move' })).toBeNull()
	expect(scene.flight.setTouch).toHaveBeenLastCalledWith({
		forward: 0,
		strafe: 0,
		up: false,
		down: false,
		sprint: false,
	})
})
