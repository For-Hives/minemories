// Spectator flight as Minecraft Java 1.21.1 computes it, tick by tick, so the viewer moves, climbs, sprints and
// turns at the game's speeds. Constants read from the 1.21.1 client:
// - Abilities.flyingSpeed 0.05; Player.getFlyingSpeed doubles it while sprinting.
// - LivingEntity: the input is scaled by 0.98, normalized only past length 1 (Entity.getInputVector), then the
//   horizontal velocity keeps 0.91 of itself each tick in the air.
// - LocalPlayer.aiStep: jump and sneak add ±flyingSpeed × 3 to the vertical velocity (the raw speed, not the
//   sprint-doubled one); Player.travel then keeps 0.6 of the vertical velocity it had before moving.
// - Sprint: a second forward press within 7 ticks, or the sprint key while forward is held; it stops when forward
//   is released. (In 1.21.1 a double tap only starts a sprint on the ground: the viewer always flies, so it accepts
//   it in the air too.)
// - AbstractClientPlayer.getFieldOfViewModifier: ×1.1 while flying, ×1.15 more while sprinting; GameRenderer moves
//   halfway towards it each tick.
// - MouseHandler.turnPlayer: (sensitivity × 0.6 + 0.2)³ × 8, then Entity.turn: × 0.15 degrees per pixel.
// - Spectator scroll: flyingSpeed ± 0.005 per notch, up to 0.2.
// Steady speeds: 10.9 blocks/s flying, 21.8 sprinting, 7.5 up or down.

export const TICKS_PER_SECOND = 20
export const FLYING_SPEED = 0.05
export const MIN_FLYING_SPEED = 0.005
export const MAX_FLYING_SPEED = 0.2
export const SPEED_STEP = 0.005
export const SPRINT_TRIGGER_TICKS = 7
/** At most this many ticks per frame: a stalled tab resumes where it was instead of jumping. */
export const MAX_CATCH_UP_TICKS = 10

const INPUT_SCALE = 0.98
const AIR_FRICTION = 0.91
const VERTICAL_KEEP = 0.6
const VERTICAL_FACTOR = 3
const SPRINT_IMPULSE = 0.8
const FLYING_FOV = 1.1
const SPRINTING_FOV = 1.15

export type Vector = [number, number, number]

/** One tick of held controls. `forward` and `strafe` run from -1 to 1 (right is positive). */
export type FlightInput = {
	forward: number
	strafe: number
	up: boolean
	down: boolean
	sprint: boolean
}

export type FlightState = {
	position: Vector
	previous: Vector
	velocity: Vector
	flyingSpeed: number
	sprinting: boolean
	sprintTriggerTime: number
	/** Last tick's forward and sneak, which a new sprint is measured against. */
	wasForward: boolean
	wasDown: boolean
	fov: number
	previousFov: number
}

export const idleInput: FlightInput = { forward: 0, strafe: 0, up: false, down: false, sprint: false }

export function createFlight(position: Vector, flyingSpeed = FLYING_SPEED): FlightState {
	return {
		position: [...position],
		previous: [...position],
		velocity: [0, 0, 0],
		flyingSpeed: clampSpeed(flyingSpeed),
		sprinting: false,
		sprintTriggerTime: 0,
		wasForward: false,
		wasDown: false,
		fov: FLYING_FOV,
		previousFov: FLYING_FOV,
	}
}

/** Moves the flight to `position` at rest, as a teleport does. */
export function placeFlight(state: FlightState, position: Vector): void {
	state.position = [...position]
	state.previous = [...position]
	state.velocity = [0, 0, 0]
	state.sprinting = false
	state.sprintTriggerTime = 0
}

function updateSprint(state: FlightState, input: FlightInput): void {
	if (state.sprintTriggerTime > 0) state.sprintTriggerTime--
	const forward = input.forward >= SPRINT_IMPULSE
	if (input.down) state.sprintTriggerTime = 0
	const canStart = !state.sprinting && forward
	if (canStart && !state.wasForward && !state.wasDown) {
		if (state.sprintTriggerTime > 0 || input.sprint) state.sprinting = true
		else state.sprintTriggerTime = SPRINT_TRIGGER_TICKS
	}
	if (canStart && input.sprint) state.sprinting = true
	if (state.sprinting && input.forward <= 1e-5) state.sprinting = false
	state.wasForward = forward
	state.wasDown = input.down
}

/**
 * Horizontal push for this tick, in the viewer's axes: yaw 0 looks along -Z, as a three.js camera does. Pitch
 * plays no part: Minecraft flight climbs only with the up and down keys.
 */
export function horizontalPush(input: FlightInput, yaw: number, speed: number): [number, number] {
	let strafe = input.strafe * INPUT_SCALE
	let forward = input.forward * INPUT_SCALE
	const lengthSquared = strafe * strafe + forward * forward
	if (lengthSquared < 1e-7) return [0, 0]
	if (lengthSquared > 1) {
		const length = Math.sqrt(lengthSquared)
		strafe /= length
		forward /= length
	}
	strafe *= speed
	forward *= speed
	const sin = Math.sin(yaw)
	const cos = Math.cos(yaw)
	// `+ 0` turns a negative zero into zero.
	return [strafe * cos - forward * sin + 0, -strafe * sin - forward * cos + 0]
}

/** One game tick (1/20 s). */
export function tickFlight(state: FlightState, input: FlightInput, yaw: number): void {
	state.previous = [...state.position]
	state.previousFov = state.fov
	updateSprint(state, input)
	const vertical = Number(input.up) - Number(input.down)
	state.velocity[1] += vertical * state.flyingSpeed * VERTICAL_FACTOR
	const speed = state.sprinting ? state.flyingSpeed * 2 : state.flyingSpeed
	const [pushX, pushZ] = horizontalPush(input, yaw, speed)
	state.velocity[0] += pushX
	state.velocity[2] += pushZ
	const [x, y, z] = state.position
	const [vx, vy, vz] = state.velocity
	state.position = [x + vx, y + vy, z + vz]
	state.velocity[0] *= AIR_FRICTION
	state.velocity[2] *= AIR_FRICTION
	state.velocity[1] *= VERTICAL_KEEP
	const target = FLYING_FOV * (state.sprinting ? SPRINTING_FOV : 1)
	state.fov += (target - state.fov) * 0.5
}

/** Position between the last two ticks, `alpha` from 0 (previous) to 1 (current). */
export function flightPosition(state: FlightState, alpha: number): Vector {
	const [ax, ay, az] = state.previous
	const [bx, by, bz] = state.position
	return [ax + (bx - ax) * alpha, ay + (by - ay) * alpha, az + (bz - az) * alpha]
}

/** Field of view factor between the last two ticks. */
export function flightFov(state: FlightState, alpha: number): number {
	return state.previousFov + (state.fov - state.previousFov) * alpha
}

/** Runs the ticks a frame of `seconds` owes, at most MAX_CATCH_UP_TICKS, and returns how far into the next one it is. */
export class FlightClock {
	private accumulator = 0

	advance(seconds: number, tick: () => void): number {
		this.accumulator += Math.max(0, seconds) * TICKS_PER_SECOND
		let ticks = Math.floor(this.accumulator)
		if (ticks > MAX_CATCH_UP_TICKS) {
			ticks = MAX_CATCH_UP_TICKS
			this.accumulator = MAX_CATCH_UP_TICKS
		}
		for (let index = 0; index < ticks; index++) tick()
		this.accumulator -= ticks
		return this.accumulator
	}

	reset(): void {
		this.accumulator = 0
	}
}

export function clampSpeed(speed: number): number {
	return Math.min(MAX_FLYING_SPEED, Math.max(MIN_FLYING_SPEED, speed))
}

/** Flying speed after `notches` of the scroll wheel (up is positive), like the spectator's. */
export function scrollSpeed(speed: number, notches: number): number {
	return clampSpeed(Math.round((speed + notches * SPEED_STEP) / SPEED_STEP) * SPEED_STEP)
}

/** Degrees the view turns per pixel of mouse movement at a Minecraft sensitivity (0 to 1, 0.5 by default). */
export function turnDegreesPerPixel(sensitivity: number): number {
	const factor = Math.min(1, Math.max(0, sensitivity)) * 0.6 + 0.2
	return factor ** 3 * 8 * 0.15
}

const PIXELS_PER_NOTCH = 100
/** WheelEvent.deltaMode: pixels, lines (about 33 pixels), pages (three notches). */
const DELTA_SCALE: Record<number, number> = { 0: 1, 1: 33, 2: PIXELS_PER_NOTCH * 3 }

/**
 * Turns wheel events into whole notches: a mouse wheel gives one per click, a trackpad's stream of small deltas adds
 * up instead of jumping to the top speed.
 */
export class WheelNotches {
	private pixels = 0

	add(deltaY: number, deltaMode: number): number {
		this.pixels -= deltaY * (DELTA_SCALE[deltaMode] ?? 1)
		const notches = Math.trunc(this.pixels / PIXELS_PER_NOTCH)
		this.pixels -= notches * PIXELS_PER_NOTCH
		return notches + 0
	}
}

/** Narrowest horizontal field of view a flight keeps, in degrees: a portrait phone would otherwise see 22°. */
export const MIN_HORIZONTAL_FOV = 50
/** Widest vertical field of view that rule may reach, in degrees, before the edges stretch too much. */
export const MAX_VERTICAL_FOV = 90

/**
 * Vertical field of view (degrees) for a screen of `aspect` (width / height): the camera's own `base`, raised until
 * the view is at least MIN_HORIZONTAL_FOV wide, never past MAX_VERTICAL_FOV.
 */
export function comfortableFov(base: number, aspect: number): number {
	const half = (MIN_HORIZONTAL_FOV / 2) * (Math.PI / 180)
	const needed = 2 * Math.atan(Math.tan(half) / Math.max(aspect, 1e-3)) * (180 / Math.PI)
	return Math.min(MAX_VERTICAL_FOV, Math.max(base, needed))
}
