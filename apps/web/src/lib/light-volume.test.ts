import { expect, test } from 'vitest'
import {
	buildLightVolume,
	buildLightVolumeAsync,
	type LightSources,
	lightSourcesFrom,
	MAX_LIGHT_LEVEL,
} from './light-volume'

function sources(
	lights: { at: [number, number, number]; level: number; colour?: [number, number, number] }[]
): LightSources {
	return {
		positions: Float32Array.from(lights.flatMap(light => light.at)),
		colours: Float32Array.from(lights.flatMap(light => light.colour ?? [1, 1, 1])),
		levels: Float32Array.from(lights.map(light => light.level)),
	}
}

function at(volume: NonNullable<ReturnType<typeof buildLightVolume>>, x: number, y: number, z: number, channel = 0) {
	const [nx, ny] = volume.size
	const tx = Math.floor((x - volume.origin[0]) / volume.cell)
	const ty = Math.floor((y - volume.origin[1]) / volume.cell)
	const tz = Math.floor((z - volume.origin[2]) / volume.cell)
	return volume.data[((tz * ny + ty) * nx + tx) * 4 + channel]
}

test('nothing to light gives no volume', () => {
	expect(buildLightVolume(sources([]))).toBeNull()
	expect(buildLightVolume(sources([{ at: [0, 0, 0], level: 0.5 }]))).toBeNull()
	expect(buildLightVolume(sources([{ at: [Number.NaN, 0, 0], level: 14 }]))).toBeNull()
})

test('a light loses one level per block of Manhattan distance, down to nothing', () => {
	const volume = buildLightVolume(sources([{ at: [10.5, 20.5, 30.5], level: 14 }]))
	expect(volume).not.toBeNull()
	if (!volume) return
	expect(volume.cell).toBe(1)
	expect(at(volume, 10, 20, 30)).toBe(Math.round((14 * 255) / MAX_LIGHT_LEVEL))
	expect(at(volume, 13, 20, 30)).toBe(Math.round((11 * 255) / MAX_LIGHT_LEVEL))
	expect(at(volume, 11, 21, 31)).toBe(Math.round((11 * 255) / MAX_LIGHT_LEVEL))
	expect(at(volume, 24, 20, 30)).toBe(0)
	expect(at(volume, 10, 20, 30, 3)).toBe(255)
	expect(volume.origin).toEqual([10 - 14, 20 - 14, 30 - 14])
})

test('levels combine by the brightest per channel, never by a sum, and keep their colour', () => {
	const volume = buildLightVolume(
		sources([
			{ at: [0.5, 0.5, 0.5], level: 15, colour: [1, 0, 0] },
			{ at: [2.5, 0.5, 0.5], level: 15, colour: [0, 0, 1] },
			{ at: [1.5, 5.5, 0.5], level: 3, colour: [0, 1, 0] },
		])
	)
	if (!volume) throw new Error('missing volume')
	expect(at(volume, 1, 0, 0, 0)).toBe(Math.round((14 * 255) / 15))
	expect(at(volume, 1, 0, 0, 2)).toBe(Math.round((14 * 255) / 15))
	expect(at(volume, 0, 0, 0, 2)).toBe(Math.round((13 * 255) / 15))
	expect(at(volume, 1, 4, 0, 1)).toBe(Math.round((2 * 255) / 15))
	expect(at(volume, 1, 2, 0, 1)).toBe(0)
})

test('levels above 15, colours above 1 and lights at the edge are clamped', () => {
	const volume = buildLightVolume(sources([{ at: [0.5, 0.5, 0.5], level: 400, colour: [4, -1, 0.5] }]))
	if (!volume) throw new Error('missing volume')
	expect(at(volume, 0, 0, 0, 0)).toBe(255)
	expect(at(volume, 0, 0, 0, 1)).toBe(0)
	expect(at(volume, 0, 0, 0, 2)).toBe(128)
	expect(volume.size).toEqual([31, 31, 31])
})

test('a vast capture coarsens the volume to stay inside the texel budget and the texture side', () => {
	const spread = sources([
		{ at: [-128, -64, -128], level: 15 },
		{ at: [128, 320, 128], level: 15 },
	])
	const volume = buildLightVolume(spread, { budget: 4 * 1024 * 1024, maxSide: 512 })
	if (!volume) throw new Error('missing volume')
	const [nx, ny, nz] = volume.size
	expect(volume.cell).toBe(3)
	expect(nx * ny * nz).toBeLessThanOrEqual(4 * 1024 * 1024)
	expect(volume.data.length).toBe(nx * ny * nz * 4)
	expect(at(volume, -128, -64, -128)).toBeGreaterThan(200)
	const narrow = buildLightVolume(spread, { budget: 1e9, maxSide: 200 })
	expect(Math.max(...(narrow?.size ?? [0]))).toBeLessThanOrEqual(200)
	expect(narrow?.cell).toBe(3)
})

test('four thousand lights fit the budget at one texel per block', () => {
	const lights = Array.from({ length: 4000 }, (_, i) => ({
		at: [(i * 7) % 200, 60 + ((i * 13) % 40), (i * 31) % 200] as [number, number, number],
		level: 14,
		colour: [1, 0.8, 0.6] as [number, number, number],
	}))
	const volume = buildLightVolume(sources(lights))
	expect(volume?.cell).toBe(1)
})

test('the async build equals the synchronous one, yields between slices and can be cancelled', async () => {
	const lights = Array.from({ length: 300 }, (_, i) => ({
		at: [i % 40, (i * 3) % 10, (i * 7) % 40] as [number, number, number],
		level: 12,
	}))
	const input = sources(lights)
	let clock = 0
	const tick = () => (clock += 3)
	let yields = 0
	const built = await buildLightVolumeAsync(
		input,
		async () => void yields++,
		() => false,
		undefined,
		tick
	)
	expect(yields).toBeGreaterThan(1)
	const reference = buildLightVolume(input)?.data
	expect(built?.data.every((value, index) => value === reference?.[index])).toBe(true)
	expect(await buildLightVolumeAsync(sources([]), async () => {})).toBeNull()
	let calls = 0
	const cancelled = await buildLightVolumeAsync(
		input,
		async () => {},
		() => ++calls > 1,
		undefined,
		tick
	)
	expect(cancelled).toBeNull()
	const real = await buildLightVolumeAsync(sources([{ at: [0, 0, 0], level: 5 }]), async () => {})
	expect(real?.cell).toBe(1)
})

test('imported lights become flat sources: level from candela, warm tint, world positions', () => {
	const flat = lightSourcesFrom([
		{ position: { x: 1, y: 2, z: 3 }, color: { r: 1, g: 1, b: 1 }, intensity: 1400 },
		{ position: { x: -4, y: 5, z: 6 }, color: { r: 0.5, g: 0.5, b: 0.5 }, intensity: 300 },
	])
	expect([...flat.positions]).toEqual([1, 2, 3, -4, 5, 6])
	expect([...flat.levels]).toEqual([14, 3])
	expect(flat.colours[0]).toBe(1)
	expect(flat.colours[1]).toBeCloseTo(0.82)
	expect(flat.colours[2]).toBeCloseTo(0.65)
	expect(flat.colours[3]).toBeCloseTo(0.5)
})
