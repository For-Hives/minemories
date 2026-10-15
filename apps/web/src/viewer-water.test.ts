import * as THREE from 'three'
import { expect, test } from 'vitest'
import { prepareWater } from './viewer-water'

test('water gets rippled reflections while glass retains its imported rendering', () => {
	const water = new THREE.MeshStandardMaterial({ name: 'minecraft:water / minecraft:block/water_still' })
	const glass = new THREE.MeshStandardMaterial({ name: 'minecraft:glass', transparent: true, roughness: 0.3 })
	const time = { value: 0 }
	expect(prepareWater(water, time)).toBe(true)
	const compile = water.onBeforeCompile
	water.roughness = 0.9
	water.envMapIntensity = 0.1
	expect(prepareWater(water, time)).toBe(true)
	expect(water.onBeforeCompile).toBe(compile)
	expect(water.roughness).toBeLessThan(0.2)
	expect(water.envMapIntensity).toBeGreaterThan(1)
	expect(prepareWater(glass, time)).toBe(false)
	expect(glass.roughness).toBe(0.3)
	water.dispose()
	glass.dispose()
})
