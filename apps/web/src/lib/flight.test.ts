import { expect, test } from 'vitest'
import {
	clampSpeed,
	comfortableFov,
	createFlight,
	FLYING_SPEED,
	FlightClock,
	type FlightInput,
	flightFov,
	flightPosition,
	horizontalPush,
	idleInput,
	MAX_CATCH_UP_TICKS,
	MAX_FLYING_SPEED,
	MIN_FLYING_SPEED,
	placeFlight,
	scrollSpeed,
	tickFlight,
	turnDegreesPerPixel,
	WheelNotches,
} from './flight'

const held = (input: Partial<FlightInput>): FlightInput => ({ ...idleInput, ...input })

/** Blocks per second once the speed has settled (after 200 ticks), on the axis that moves. */
function steadySpeed(input: FlightInput, axis: 0 | 1 | 2, yaw = 0): number {
	const flight = createFlight([0, 0, 0])
	for (let tick = 0; tick < 200; tick++) tickFlight(flight, input, yaw)
	const before = flight.position[axis]
	tickFlight(flight, input, yaw)
	return Math.abs(flight.position[axis] - before) * 20
}

test('flight settles at Minecraft speeds: 10.9 blocks/s, 21.8 sprinting, 7.5 up or down', () => {
	expect(steadySpeed(held({ forward: 1 }), 2)).toBeCloseTo(10.89, 1)
	expect(steadySpeed(held({ forward: 1, sprint: true }), 2)).toBeCloseTo(21.78, 1)
	expect(steadySpeed(held({ up: true }), 1)).toBeCloseTo(7.5, 5)
	expect(steadySpeed(held({ down: true }), 1)).toBeCloseTo(7.5, 5)
	// Sprinting does not climb faster: the vertical push uses the plain flying speed.
	expect(steadySpeed(held({ up: true, forward: 1, sprint: true }), 1)).toBeCloseTo(7.5, 5)
	// Up and down together cancel out.
	expect(steadySpeed(held({ up: true, down: true }), 1)).toBe(0)
})

test('forward follows the yaw, never the pitch, and diagonals are no faster than straight lines', () => {
	const quarter = Math.PI / 2
	expect(horizontalPush(held({ forward: 1 }), 0, 1)).toEqual([0, -0.98])
	const left = horizontalPush(held({ forward: 1 }), quarter, 1)
	expect(left[0]).toBeCloseTo(-0.98)
	expect(left[1]).toBeCloseTo(0)
	const right = horizontalPush(held({ strafe: 1 }), 0, 1)
	expect(right).toEqual([0.98, 0])
	const diagonal = horizontalPush(held({ forward: 1, strafe: 1 }), 0, 1)
	expect(Math.hypot(...diagonal)).toBeCloseTo(1)
	const gentle = horizontalPush(held({ forward: 0.5 }), 0, 1)
	expect(gentle[1]).toBeCloseTo(-0.49)
	expect(horizontalPush(held({ forward: 1e-5 }), 0, 1)).toEqual([0, 0])
	expect(
		steadySpeed(held({ forward: 1, strafe: 1 }), 0) ** 2 + steadySpeed(held({ forward: 1, strafe: 1 }), 2) ** 2
	).toBeCloseTo(10.89 ** 2 / 0.98 ** 2, -1)
})

test('a second forward press within the trigger window starts a sprint; one past it does not', () => {
	const tap = (gap: number) => {
		const flight = createFlight([0, 0, 0])
		tickFlight(flight, held({ forward: 1 }), 0)
		for (let tick = 0; tick < gap; tick++) tickFlight(flight, idleInput, 0)
		tickFlight(flight, held({ forward: 1 }), 0)
		return flight.sprinting
	}
	expect(tap(1)).toBe(true)
	expect(tap(5)).toBe(true)
	expect(tap(6)).toBe(false)
	// Holding forward is not a second press.
	const held1 = createFlight([0, 0, 0])
	for (let tick = 0; tick < 5; tick++) tickFlight(held1, held({ forward: 1 }), 0)
	expect(held1.sprinting).toBe(false)
	// Sneaking clears a pending double tap.
	const sneaked = createFlight([0, 0, 0])
	tickFlight(sneaked, held({ forward: 1 }), 0)
	tickFlight(sneaked, held({ down: true }), 0)
	tickFlight(sneaked, idleInput, 0)
	tickFlight(sneaked, held({ forward: 1 }), 0)
	expect(sneaked.sprinting).toBe(false)
	// A gentle push does not trigger one.
	const gentle = createFlight([0, 0, 0])
	tickFlight(gentle, held({ forward: 0.5 }), 0)
	tickFlight(gentle, idleInput, 0)
	tickFlight(gentle, held({ forward: 0.5 }), 0)
	expect(gentle.sprinting).toBe(false)
})

test('the sprint key starts a sprint with forward held, and releasing forward ends it', () => {
	const flight = createFlight([0, 0, 0])
	tickFlight(flight, held({ sprint: true }), 0)
	expect(flight.sprinting).toBe(false)
	tickFlight(flight, held({ forward: 1, sprint: true }), 0)
	expect(flight.sprinting).toBe(true)
	// Still sprinting with the key released while forward stays held.
	tickFlight(flight, held({ forward: 1 }), 0)
	expect(flight.sprinting).toBe(true)
	tickFlight(flight, held({ strafe: 1 }), 0)
	expect(flight.sprinting).toBe(false)
	// The key held from the start of a forward press sprints at once.
	const fresh = createFlight([0, 0, 0])
	tickFlight(fresh, held({ forward: 1, sprint: true }), 0)
	expect(fresh.sprinting).toBe(true)
})

test('the field of view widens while flying and more while sprinting, halfway each tick', () => {
	const flight = createFlight([0, 0, 0])
	expect(flightFov(flight, 1)).toBeCloseTo(1.1)
	tickFlight(flight, held({ forward: 1, sprint: true }), 0)
	expect(flight.fov).toBeCloseTo(1.1 + (1.265 - 1.1) / 2)
	expect(flightFov(flight, 0.5)).toBeCloseTo((1.1 + flight.fov) / 2)
	for (let tick = 0; tick < 30; tick++) tickFlight(flight, held({ forward: 1 }), 0)
	expect(flight.fov).toBeCloseTo(1.265)
})

test('positions interpolate between ticks and a teleport stops the flight', () => {
	const flight = createFlight([1, 2, 3])
	tickFlight(flight, held({ forward: 1 }), 0)
	const [x, y, z] = flightPosition(flight, 0.5)
	expect([x, y]).toEqual([1, 2])
	expect(z).toBeCloseTo(3 - 0.049 / 2)
	placeFlight(flight, [10, 20, 30])
	expect(flightPosition(flight, 0.3)).toEqual([10, 20, 30])
	expect(flight.velocity).toEqual([0, 0, 0])
	tickFlight(flight, idleInput, 0)
	expect(flight.position).toEqual([10, 20, 30])
})

test('the clock runs 20 ticks a second, carries the remainder and never runs away', () => {
	const clock = new FlightClock()
	let ticks = 0
	const count = () => {
		ticks++
	}
	expect(clock.advance(0.075, count)).toBeCloseTo(0.5)
	expect(ticks).toBe(1)
	clock.advance(0.025, count)
	expect(ticks).toBe(2)
	clock.advance(-1, count)
	expect(ticks).toBe(2)
	clock.advance(60, count)
	expect(ticks).toBe(2 + MAX_CATCH_UP_TICKS)
	clock.reset()
	expect(clock.advance(0, count)).toBe(0)
})

test('scrolling steps the flying speed like a spectator, within its bounds', () => {
	expect(scrollSpeed(FLYING_SPEED, 1)).toBeCloseTo(0.055)
	expect(scrollSpeed(FLYING_SPEED, -3)).toBeCloseTo(0.035)
	expect(scrollSpeed(FLYING_SPEED, 100)).toBe(MAX_FLYING_SPEED)
	expect(scrollSpeed(FLYING_SPEED, -100)).toBe(MIN_FLYING_SPEED)
	expect(clampSpeed(Number.NaN)).toBeNaN()
	expect(createFlight([0, 0, 0], 1).flyingSpeed).toBe(MAX_FLYING_SPEED)
	const wheel = new WheelNotches()
	expect(wheel.add(-100, 0)).toBe(1)
	expect(wheel.add(30, 0)).toBe(0)
	expect(wheel.add(30, 0)).toBe(0)
	expect(wheel.add(40, 0)).toBe(-1)
	expect(wheel.add(3, 1)).toBe(0)
	expect(wheel.add(1, 1)).toBe(-1)
	// A page is three notches, on top of the 32 pixels left from the lines above.
	expect(wheel.add(-1, 2)).toBe(2)
	// An unknown mode reads as pixels.
	expect(new WheelNotches().add(-100, 9)).toBe(1)
})

test('mouse turning matches the game: 0.15 degrees per pixel at the default sensitivity', () => {
	expect(turnDegreesPerPixel(0.5)).toBeCloseTo(0.15)
	expect(turnDegreesPerPixel(0)).toBeCloseTo(0.0096)
	expect(turnDegreesPerPixel(1)).toBeCloseTo(0.6144)
	expect(turnDegreesPerPixel(5)).toBeCloseTo(0.6144)
})

test('a narrow screen widens the vertical field of view until the view is 50 degrees across, up to 90', () => {
	const across = (vertical: number, aspect: number) =>
		2 * Math.atan(Math.tan((vertical / 2) * (Math.PI / 180)) * aspect) * (180 / Math.PI)
	// A laptop keeps the camera's own 45 degrees (67 across).
	expect(comfortableFov(45, 1280 / 800)).toBe(45)
	// A tablet in portrait reaches 50 across.
	expect(across(comfortableFov(45, 820 / 1180), 820 / 1180)).toBeCloseTo(50)
	// A phone in portrait stops at 90 vertical, about 49 across instead of 22.
	expect(comfortableFov(45, 390 / 844)).toBeCloseTo(90, 0)
	expect(across(comfortableFov(45, 390 / 844), 390 / 844)).toBeGreaterThan(45)
	expect(comfortableFov(45, 0)).toBe(90)
})
