import { describe, expect, test } from 'vitest'
import { type Emitter, LightPool, mergeEmitters } from './light-pool'

function torch(x: number, y = 0, z = 0, intensity = 100, distance = 8): Emitter {
	return { x, y, z, r: 1, g: 0.5, b: 0.25, intensity, distance }
}

const origin = { x: 0, y: 0, z: 0 }

function slot(pool: LightPool, index = 0) {
	const found = pool.slots[index]
	if (!found) throw new Error('missing slot')
	return found
}

function xOf(pool: LightPool, index = 0) {
	return slot(pool, index).emitter?.x
}

describe('mergeEmitters', () => {
	test('merges emitters of one cell into a weighted area light and keeps distant ones apart', () => {
		const merged = mergeEmitters([torch(0, 0, 0, 100), torch(2, 0, 0, 300), torch(40)])
		expect(merged).toHaveLength(2)
		const group = merged.find(emitter => emitter.x < 10)
		expect(group?.x).toBeCloseTo(1.5)
		expect(group?.intensity).toBe(400)
		expect(group?.distance).toBeCloseTo(8 + 1.5)
		expect(group?.r).toBe(1)
		expect(group?.g).toBeCloseTo(0.5)
	})

	test('tolerates dark emitters and negative coordinates', () => {
		const merged = mergeEmitters([torch(-1, -1, -1, 0), torch(-2, -1, -1, 0)])
		expect(merged).toHaveLength(1)
		expect(Number.isFinite(merged[0]?.x)).toBe(true)
		expect(mergeEmitters([])).toEqual([])
	})
})

describe('LightPool', () => {
	test('settles on the emitters closest to the focus, at full level', () => {
		const pool = new LightPool(2)
		pool.setEmitters([torch(100), torch(10), torch(50)])
		pool.update(origin, Number.POSITIVE_INFINITY)
		const shown = pool.slots.map(slot => slot.emitter?.x).sort((a, b) => (a ?? 0) - (b ?? 0))
		expect(shown).toEqual([10, 50])
		expect(pool.slots.every(slot => slot.level === 1)).toBe(true)
	})

	test('a light enters gradually and a leaving one fades before its slot is reused', () => {
		const pool = new LightPool(1, 1)
		pool.setEmitters([torch(0), torch(200)])
		pool.update(origin, 0)
		expect(slot(pool)).toMatchObject({ level: 0 })
		expect(xOf(pool)).toBe(0)
		pool.update(origin, 0.5)
		expect(slot(pool).level).toBe(0.5)
		pool.update(origin, 5)
		expect(slot(pool).level).toBe(1)
		const far = { x: 200, y: 0, z: 0 }
		pool.update(far, 0.25)
		expect(xOf(pool)).toBe(0)
		expect(slot(pool).level).toBe(0.75)
		pool.update(far, 1)
		expect(slot(pool).level).toBe(0)
		expect(slot(pool).emitter).toBeNull()
		pool.update(far, 1)
		expect(xOf(pool)).toBe(200)
		expect(slot(pool).level).toBe(1)
	})

	test('a light that comes back while fading out is kept', () => {
		const pool = new LightPool(1, 1)
		pool.setEmitters([torch(0), torch(60)])
		pool.update(origin, 9)
		pool.update({ x: 60, y: 0, z: 0 }, 0.5)
		expect(slot(pool).level).toBe(0.5)
		pool.update(origin, 0.25)
		expect(xOf(pool)).toBe(0)
		expect(slot(pool).level).toBe(0.75)
	})

	test('lights do not swap at a near tie', () => {
		const pool = new LightPool(1)
		pool.setEmitters([torch(0), torch(10)])
		pool.update({ x: 4.9, y: 0, z: 0 }, 9)
		const first = xOf(pool)
		pool.update({ x: 5.1, y: 0, z: 0 }, 9)
		expect(xOf(pool)).toBe(first)
	})

	test('new emitters keep the lights that still exist and fade out the others', () => {
		const pool = new LightPool(2, 1)
		pool.setEmitters([torch(0), torch(30)])
		pool.update(origin, 9)
		pool.setEmitters([torch(30), torch(60, 0, 0, 1)])
		pool.update(origin, 0.5)
		expect(pool.slots.find(slot => slot.emitter?.x === 30)?.level).toBe(1)
		expect(pool.slots.find(slot => slot.emitter?.x === 0)?.level).toBe(0.5)
		pool.setEmitters([])
		pool.update(origin, 9)
		expect(pool.slots.every(slot => slot.emitter === null && slot.level === 0)).toBe(true)
	})

	test('a retiring light is not revived by a later emitter set', () => {
		const pool = new LightPool(1, 1)
		pool.setEmitters([torch(0)])
		pool.update(origin, 9)
		pool.setEmitters([])
		pool.update(origin, 0.5)
		pool.setEmitters([torch(0)])
		expect(slot(pool).level).toBe(0.5)
		pool.update(origin, 0.5)
		expect(slot(pool).level).toBe(0)
	})

	test('two thousand torches are served by a bounded pool', () => {
		const pool = new LightPool()
		pool.setEmitters(Array.from({ length: 2000 }, (_, i) => torch((i * 7) % 200, (i * 13) % 60, (i * 3) % 200)))
		pool.update({ x: 100, y: 30, z: 100 }, 9)
		expect(pool.slots.filter(slot => slot.emitter)).toHaveLength(12)
	})
})
