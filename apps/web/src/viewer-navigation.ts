import * as THREE from 'three'
import {
	createFlight,
	FLYING_SPEED,
	FlightClock,
	type FlightInput,
	type FlightState,
	flightFov,
	flightPosition,
	placeFlight,
	scrollSpeed,
	tickFlight,
	turnDegreesPerPixel,
	WheelNotches,
} from './lib/flight'
import { actionFor, type ControlSettings, defaultControls, type FlightAction, riskyKey } from './lib/flight-controls'

const DEGREE = Math.PI / 180
/** A finger covers a phone screen in a few hundred pixels: it turns twice as far per pixel as a mouse. */
const TOUCH_TURN = 2
const MAX_PITCH = 90 * DEGREE
/**
 * More than this in one locked mouse event is not a hand moving but a browser glitch (Chrome sometimes reports the
 * jump to the lock point, or a spurious one): ignored, so the view never spins on its own.
 */
const MAX_LOCKED_MOVE = 400

/** Touch and on-screen buttons: a joystick's forward and strafe, and held actions. */
export type FlightTouch = { forward: number; strafe: number; up: boolean; down: boolean; sprint: boolean }

/**
 * Free flight through the capture, with Minecraft's spectator controls and speeds (`lib/flight`): no collision,
 * through walls and floors. Keys are read by physical position with the visitor's bindings; the mouse turns the
 * view once the pointer is locked (a click), or while dragging when the browser refuses the lock; a finger drags
 * to look; the wheel changes the flying speed.
 */
export class ViewerNavigation {
	active = false
	/** Called with the flying speed as a share of the default (1 = 100%) when the wheel changes it. */
	onSpeedChange: ((speed: number) => void) | null = null
	private controls: ControlSettings = defaultControls
	private readonly keys = new Map<string, FlightAction>()
	private touch: FlightTouch = { forward: 0, strafe: 0, up: false, down: false, sprint: false }
	private readonly flight: FlightState
	private readonly clock = new FlightClock()
	private readonly wheel = new WheelNotches()
	private yaw = 0
	private pitch = 0
	private readonly rendered = new THREE.Vector3()
	private readonly orientation = new THREE.Quaternion()
	private baseFov: number
	private reducedMotion = false
	private lookPointer: number | null = null
	/** The first mouse move after a lock can carry the whole jump to the lock point: it is skipped. */
	private skipLockedMove = false
	private pointerX = 0
	private pointerY = 0
	private readonly abort = new AbortController()

	constructor(
		private readonly camera: THREE.PerspectiveCamera,
		private readonly canvas: HTMLCanvasElement
	) {
		this.flight = createFlight([camera.position.x, camera.position.y, camera.position.z])
		this.baseFov = camera.fov
		canvas.tabIndex = 0
		const options = { signal: this.abort.signal }
		canvas.addEventListener('keydown', this.keyDown, options)
		window.addEventListener('keyup', this.keyUp, options)
		canvas.addEventListener('blur', this.clear, options)
		window.addEventListener('blur', this.clear, options)
		document.addEventListener('visibilitychange', this.clear, options)
		document.addEventListener('pointerlockchange', this.lockChange, options)
		canvas.addEventListener('pointerdown', this.pointerDown, options)
		canvas.addEventListener('pointermove', this.pointerMove, options)
		canvas.addEventListener('pointerup', this.pointerUp, options)
		canvas.addEventListener('pointercancel', this.pointerUp, options)
		canvas.addEventListener('lostpointercapture', this.pointerUp, options)
		canvas.addEventListener('wheel', this.wheelTurn, { ...options, passive: false })
		const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
		this.reducedMotion = Boolean(motion?.matches)
		motion?.addEventListener?.(
			'change',
			event => {
				this.reducedMotion = event.matches
			},
			options
		)
	}

	setControls(controls: ControlSettings): void {
		this.controls = controls
		this.keys.clear()
		if (!controls.fovEffects) this.resetFov()
	}

	/** Starts flying from where the camera is, or stops and gives the mouse back. */
	setActive(active: boolean): void {
		if (active && !this.active) {
			this.baseFov = this.camera.fov
			this.sync()
			this.flight.flyingSpeed = FLYING_SPEED
		}
		if (!active && this.active) {
			this.resetFov()
			if (document.pointerLockElement === this.canvas) document.exitPointerLock?.()
		}
		this.active = active
		this.clear()
		this.touch = { forward: 0, strafe: 0, up: false, down: false, sprint: false }
		if (active) this.canvas.focus({ preventScroll: true })
	}

	/** Joystick and on-screen buttons. */
	setTouch(touch: FlightTouch): void {
		this.touch = { ...touch, forward: clampUnit(touch.forward), strafe: clampUnit(touch.strafe) }
	}

	/** Flying speed as a share of the default one. */
	get speed(): number {
		return this.flight.flyingSpeed / FLYING_SPEED
	}

	/** The camera's own field of view, without the flight's widening: for postcards. */
	resetFov(): void {
		if (this.camera.fov === this.baseFov) return
		this.camera.fov = this.baseFov
		this.camera.updateProjectionMatrix()
	}

	update(delta: number): void {
		if (!this.active) return
		// The scene moved the camera (a new capture, a recentre): fly on from there.
		if (!(this.camera.position.equals(this.rendered) && this.camera.quaternion.equals(this.orientation))) this.sync()
		const input = this.input()
		const alpha = this.clock.advance(delta, () => tickFlight(this.flight, input, this.yaw))
		this.camera.position.set(...flightPosition(this.flight, alpha))
		this.rendered.copy(this.camera.position)
		if (!this.controls.fovEffects || this.reducedMotion) return
		// Minecraft widens 1.1x while flying: the viewer's own field of view is the flying one.
		const fov = (this.baseFov * flightFov(this.flight, alpha)) / 1.1
		if (Math.abs(fov - this.camera.fov) < 1e-4) return
		this.camera.fov = fov
		this.camera.updateProjectionMatrix()
	}

	dispose(): void {
		this.clear()
		this.abort.abort()
	}

	private sync(): void {
		const { x, y, z } = this.camera.position
		placeFlight(this.flight, [x, y, z])
		const rotation = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ')
		this.yaw = rotation.y
		this.pitch = THREE.MathUtils.clamp(rotation.x, -MAX_PITCH, MAX_PITCH)
		this.rendered.copy(this.camera.position)
		this.orientation.copy(this.camera.quaternion)
		this.clock.reset()
	}

	private input(): FlightInput {
		const held = new Set(this.keys.values())
		const axis = (positive: FlightAction, negative: FlightAction) =>
			Number(held.has(positive)) - Number(held.has(negative))
		return {
			forward: clampUnit(axis('forward', 'back') + this.touch.forward),
			strafe: clampUnit(axis('right', 'left') + this.touch.strafe),
			up: held.has('up') || this.touch.up,
			down: held.has('down') || this.touch.down,
			sprint: held.has('sprint') || this.touch.sprint,
		}
	}

	private turn(dx: number, dy: number, degreesPerPixel: number): void {
		const step = degreesPerPixel * DEGREE
		const vertical = this.controls.invertY ? -1 : 1
		this.yaw -= dx * step
		this.pitch = THREE.MathUtils.clamp(this.pitch - dy * step * vertical, -MAX_PITCH, MAX_PITCH)
		this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'))
		this.orientation.copy(this.camera.quaternion)
	}

	private clear = () => {
		this.keys.clear()
		this.lookPointer = null
		this.clock.reset()
	}

	private keyDown = (event: KeyboardEvent) => {
		if (!this.active) return
		// Browser shortcuts (Ctrl+F…) pass through, unless the modifier itself is a bound key.
		if ((event.ctrlKey || event.metaKey) && !riskyKey(event.code)) return
		const action = actionFor(this.controls.bindings, event.code)
		if (!action) return
		event.preventDefault()
		this.keys.set(event.code, action)
	}

	private keyUp = (event: KeyboardEvent) => {
		this.keys.delete(event.code)
	}

	private lockChange = () => {
		if (document.pointerLockElement === this.canvas) this.skipLockedMove = true
		else this.clear()
	}

	private pointerDown = (event: PointerEvent) => {
		if (!this.active || event.button !== 0) return
		this.canvas.focus({ preventScroll: true })
		if (event.pointerType === 'mouse' && this.lockPointer()) return
		if (this.lookPointer !== null) return
		this.lookPointer = event.pointerId
		this.pointerX = event.clientX
		this.pointerY = event.clientY
		try {
			this.canvas.setPointerCapture?.(event.pointerId)
		} catch {
			// The pointer is already gone, or a mouse lock is starting: the drag still follows it over the canvas.
		}
	}

	/** Locks the mouse like the game does; false when the browser cannot, so dragging looks instead. */
	private lockPointer(): boolean {
		if (document.pointerLockElement === this.canvas) return true
		if (typeof this.canvas.requestPointerLock !== 'function') return false
		// Chrome reports the jump to the lock point as a move, sometimes before the lock event.
		this.skipLockedMove = true
		const fallback = () => {
			try {
				this.canvas.requestPointerLock()?.catch(() => undefined)
			} catch {
				// Refused (just released with Escape, or not allowed): dragging still looks around.
			}
		}
		try {
			// Raw mouse movement where the browser supports it, as the game reads it.
			this.canvas.requestPointerLock({ unadjustedMovement: true })?.catch(fallback)
		} catch {
			fallback()
		}
		return false
	}

	private pointerMove = (event: PointerEvent) => {
		if (!this.active) return
		if (document.pointerLockElement === this.canvas) {
			const jump = Math.abs(event.movementX) > MAX_LOCKED_MOVE || Math.abs(event.movementY) > MAX_LOCKED_MOVE
			if (this.skipLockedMove || jump) this.skipLockedMove = false
			else this.turn(event.movementX, event.movementY, turnDegreesPerPixel(this.controls.sensitivity))
			return
		}
		if (event.pointerId !== this.lookPointer) return
		const degrees =
			event.pointerType === 'touch'
				? turnDegreesPerPixel(this.controls.touchSensitivity) * TOUCH_TURN
				: turnDegreesPerPixel(this.controls.sensitivity)
		this.turn(event.clientX - this.pointerX, event.clientY - this.pointerY, degrees)
		this.pointerX = event.clientX
		this.pointerY = event.clientY
	}

	private pointerUp = (event: Event) => {
		const id = (event as PointerEvent).pointerId
		if (id === undefined || id === this.lookPointer) this.lookPointer = null
	}

	private wheelTurn = (event: WheelEvent) => {
		if (!this.active) return
		event.preventDefault()
		const notches = this.wheel.add(event.deltaY, event.deltaMode)
		if (notches === 0) return
		this.flight.flyingSpeed = scrollSpeed(this.flight.flyingSpeed, notches)
		this.onSpeedChange?.(this.speed)
	}
}

function clampUnit(value: number): number {
	return Math.min(1, Math.max(-1, value))
}
