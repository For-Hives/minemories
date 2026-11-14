// @vitest-environment jsdom
import * as THREE from 'three'
import { afterEach, expect, test, vi } from 'vitest'
import { defaultControls, presetBindings } from './lib/flight-controls'
import { ViewerNavigation } from './viewer-navigation'

const TICK = 1 / 20

function setup() {
	const canvas = document.createElement('canvas')
	document.body.append(canvas)
	const camera = new THREE.PerspectiveCamera(45)
	const navigation = new ViewerNavigation(camera, canvas)
	const key = (type: string, code: string, init: KeyboardEventInit = {}) =>
		canvas.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init }))
	const pointer = (type: string, init: Record<string, unknown>) => {
		const event = new MouseEvent(type, { button: 0, bubbles: true, cancelable: true, ...init })
		for (const [name, value] of Object.entries(init)) Object.defineProperty(event, name, { value })
		canvas.dispatchEvent(event)
		return event
	}
	const ticks = (count: number) => {
		for (let index = 0; index < count; index++) navigation.update(TICK)
	}
	return { canvas, camera, navigation, key, pointer, ticks }
}

const yawOf = (camera: THREE.Camera) =>
	THREE.MathUtils.radToDeg(new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y)
const pitchOf = (camera: THREE.Camera) =>
	THREE.MathUtils.radToDeg(new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').x)

let locked: Element | null = null
Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked })

afterEach(() => {
	locked = null
	document.body.replaceChildren()
})

test('keys fly at Minecraft speeds, by physical position, and stop on blur', () => {
	const { canvas, camera, navigation, key, ticks } = setup()
	key('keydown', 'KeyW')
	ticks(5)
	expect(camera.position.z).toBe(0)
	navigation.setActive(true)
	expect(document.activeElement).toBe(canvas)
	key('keydown', 'KeyW')
	ticks(200)
	const before = camera.position.z
	ticks(20)
	// 10.9 blocks a second along -Z, the way the camera faces.
	expect(before - camera.position.z).toBeCloseTo(10.89, 1)
	key('keyup', 'KeyW')
	// Browser shortcuts and unbound keys are left alone.
	key('keydown', 'KeyS', { ctrlKey: true })
	key('keydown', 'KeyP')
	canvas.dispatchEvent(new Event('blur'))
	// The flight coasts to a stop, 0.91 of its speed left each tick.
	ticks(200)
	const resting = camera.position.clone()
	ticks(20)
	expect(camera.position.distanceTo(resting)).toBeLessThan(1e-6)
	key('keydown', 'Space')
	ticks(100)
	const low = camera.position.y
	ticks(20)
	expect(camera.position.y - low).toBeCloseTo(7.5, 4)
	navigation.dispose()
})

test('custom bindings, a bound modifier and the sprint key are honoured', () => {
	const { camera, navigation, key, ticks } = setup()
	navigation.setControls({
		...defaultControls,
		bindings: { ...presetBindings.minecraft, sprint: ['ControlLeft', null] },
	})
	navigation.setActive(true)
	key('keydown', 'ControlLeft', { ctrlKey: true })
	key('keydown', 'KeyW')
	ticks(200)
	const before = camera.position.z
	ticks(20)
	expect(before - camera.position.z).toBeCloseTo(21.78, 1)
	// Sprinting widens the view, and a postcard gets the camera's own one back.
	expect(camera.fov).toBeCloseTo((45 * 1.265) / 1.1)
	navigation.resetFov()
	expect(camera.fov).toBe(45)
	navigation.resetFov()
	navigation.setControls({ ...defaultControls, fovEffects: false })
	key('keydown', 'KeyW')
	ticks(5)
	expect(camera.fov).toBe(45)
	navigation.setActive(false)
	expect(camera.fov).toBe(45)
	navigation.dispose()
})

test('a click locks the mouse and turns like the game; leaving the lock releases the keys', () => {
	const { canvas, camera, navigation, key, pointer, ticks } = setup()
	const request = vi.fn(() => Promise.reject(new Error('unadjustedMovement unsupported')))
	canvas.requestPointerLock = request as unknown as typeof canvas.requestPointerLock
	document.exitPointerLock = vi.fn()
	navigation.setActive(true)
	pointer('pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0 })
	expect(request).toHaveBeenCalledWith({ unadjustedMovement: true })
	locked = canvas
	document.dispatchEvent(new Event('pointerlockchange'))
	pointer('pointerdown', { pointerId: 1, pointerType: 'mouse' })
	// The first move after locking carries the jump to the lock point: ignored, as is any glitch-sized jump.
	pointer('pointermove', { pointerId: 1, pointerType: 'mouse', movementX: 10, movementY: -10 })
	pointer('pointermove', { pointerId: 1, pointerType: 'mouse', movementX: -660, movementY: -400 })
	expect(yawOf(camera)).toBeCloseTo(0)
	pointer('pointermove', { pointerId: 1, pointerType: 'mouse', movementX: 100, movementY: 0 })
	// 0.15 degrees a pixel at the default sensitivity; a move to the right turns right.
	expect(yawOf(camera)).toBeCloseTo(-15)
	// Looking down stops straight down.
	for (let move = 0; move < 10; move++)
		pointer('pointermove', { pointerId: 1, pointerType: 'mouse', movementX: 0, movementY: 300 })
	expect(pitchOf(camera)).toBeCloseTo(-90)
	key('keydown', 'KeyW')
	locked = null
	document.dispatchEvent(new Event('pointerlockchange'))
	ticks(40)
	const resting = camera.position.clone()
	ticks(20)
	expect(camera.position.distanceTo(resting)).toBeLessThan(1e-6)
	locked = canvas
	document.dispatchEvent(new Event('pointerlockchange'))
	navigation.setActive(false)
	expect(document.exitPointerLock).toHaveBeenCalled()
	navigation.dispose()
})

test('without a pointer lock, dragging looks; a finger looks with its own sensitivity, inverted if asked', () => {
	const { canvas, camera, navigation, pointer } = setup()
	canvas.setPointerCapture = vi.fn(() => {
		throw new DOMException('No active pointer', 'InvalidStateError')
	})
	canvas.requestPointerLock = vi.fn(() => {
		throw new Error('blocked')
	}) as unknown as typeof canvas.requestPointerLock
	navigation.setControls({ ...defaultControls, invertY: true })
	navigation.setActive(true)
	pointer('pointerdown', { pointerId: 2, pointerType: 'mouse', clientX: 0, clientY: 0, button: 2 })
	pointer('pointerdown', { pointerId: 2, pointerType: 'mouse', clientX: 0, clientY: 0 })
	pointer('pointermove', { pointerId: 2, pointerType: 'mouse', clientX: 100, clientY: 0 })
	expect(yawOf(camera)).toBeCloseTo(-15)
	pointer('pointerup', { pointerId: 2 })
	pointer('pointermove', { pointerId: 2, pointerType: 'mouse', clientX: 300, clientY: 0 })
	expect(yawOf(camera)).toBeCloseTo(-15)
	pointer('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 0, clientY: 0 })
	// A second finger while the first one looks does nothing.
	pointer('pointerdown', { pointerId: 4, pointerType: 'touch', clientX: 0, clientY: 0 })
	pointer('pointermove', { pointerId: 4, pointerType: 'touch', clientX: 500, clientY: 0 })
	pointer('pointermove', { pointerId: 3, pointerType: 'touch', clientX: 0, clientY: 10 })
	// Inverted: dragging down looks up, 10 px × 0.15° × 2.
	expect(pitchOf(camera)).toBeCloseTo(3)
	canvas.dispatchEvent(new Event('pointercancel'))
	pointer('pointermove', { pointerId: 3, pointerType: 'touch', clientX: 0, clientY: 500 })
	expect(pitchOf(camera)).toBeCloseTo(3)
	// Nothing reacts while not flying.
	navigation.setActive(false)
	pointer('pointerdown', { pointerId: 5, pointerType: 'touch', clientX: 0, clientY: 0 })
	pointer('pointermove', { pointerId: 5, pointerType: 'touch', clientX: 500, clientY: 0 })
	expect(yawOf(camera)).toBeCloseTo(-15)
	navigation.dispose()
})

test('the stick and buttons fly, the wheel changes the speed, and a moved camera is followed', () => {
	const { canvas, camera, navigation, ticks } = setup()
	const speeds: number[] = []
	navigation.onSpeedChange = speed => speeds.push(speed)
	navigation.setActive(true)
	navigation.setTouch({ forward: 3, strafe: 0, up: true, down: false, sprint: true })
	ticks(200)
	const before = camera.position.clone()
	ticks(20)
	expect(before.z - camera.position.z).toBeCloseTo(21.78, 1)
	expect(camera.position.y - before.y).toBeCloseTo(7.5, 4)
	navigation.setTouch({ forward: 0, strafe: 0, up: false, down: false, sprint: false })
	const wheel = (deltaY: number) => {
		const event = new WheelEvent('wheel', { deltaY, deltaMode: 0, cancelable: true })
		canvas.dispatchEvent(event)
		return event
	}
	expect(wheel(-100).defaultPrevented).toBe(true)
	wheel(-40)
	expect(speeds).toHaveLength(1)
	expect(speeds[0]).toBeCloseTo(1.1)
	expect(navigation.speed).toBeCloseTo(1.1)
	// The scene recentres the camera: the flight carries on from there, at rest.
	camera.position.set(100, 50, 100)
	ticks(3)
	expect(camera.position.toArray()).toEqual([100, 50, 100])
	navigation.setActive(false)
	wheel(-100)
	expect(speeds).toHaveLength(1)
	// Flying again starts at the default speed.
	navigation.setActive(true)
	expect(navigation.speed).toBe(1)
	navigation.dispose()
})

test('reduced motion keeps the field of view still', () => {
	const listeners: Array<(event: { matches: boolean }) => void> = []
	window.matchMedia = vi.fn(() => ({
		matches: true,
		addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.push(listener),
	})) as unknown as typeof window.matchMedia
	const { camera, navigation, key, ticks } = setup()
	navigation.setActive(true)
	key('keydown', 'ShiftLeft')
	key('keydown', 'KeyW')
	ticks(40)
	expect(camera.fov).toBe(45)
	for (const listener of listeners) listener({ matches: false })
	ticks(40)
	expect(camera.fov).toBeGreaterThan(45)
	navigation.dispose()
	Reflect.deleteProperty(window, 'matchMedia')
})
