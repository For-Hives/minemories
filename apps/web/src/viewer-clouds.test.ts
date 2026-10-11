import { Vector3 } from 'three'
import { afterEach, expect, it, vi } from 'vitest'
import { hashSeed, MinecraftClouds } from './viewer-clouds'

afterEach(() => vi.unstubAllGlobals())

function stubTexture() {
	const pixels = new Uint8ClampedArray(256 * 256 * 4).fill(255)
	vi.stubGlobal(
		'Image',
		class {
			onload = () => undefined
			set src(_value: string) {
				this.onload()
			}
		}
	)
	vi.stubGlobal('document', {
		createElement: () => ({
			getContext: () => ({ drawImage: () => undefined, getImageData: () => ({ data: pixels }) }),
		}),
	})
}

it('anchors the cloud layer to the capture, moves it independently of lighting, and hides it outside the overworld', () => {
	stubTexture()
	const clouds = new MinecraftClouds()
	clouds.setBaseHeight(120)
	clouds.setContext({ x: -123, y: 64, z: 300, dayTime: 100, dimension: 'minecraft:overworld', biome: null, seed: '42' })
	clouds.update(new Vector3(), 0)
	expect(clouds.position.y).toBe(120)
	const before = clouds.position.x
	clouds.update(new Vector3(), 1)
	expect(clouds.position.x).toBeCloseTo(before - 0.6)
	clouds.setContext({ x: 0, y: 100, z: 0, dayTime: 0, dimension: 'minecraft:the_nether', biome: null, seed: null })
	clouds.update(new Vector3(), 1)
	expect(clouds.visible).toBe(false)
	const onDispose = vi.fn()
	clouds.addEventListener('dispose', onDispose)
	clouds.dispose()
	expect(onDispose).toHaveBeenCalledOnce()
})

it('offsets the pattern by seed so worlds stay distinct', () => {
	expect(hashSeed(null)).toEqual({ x: 0, z: 0 })
	expect(hashSeed('42')).toEqual(hashSeed('42'))
	expect(hashSeed('42')).not.toEqual(hashSeed('43'))
	stubTexture()
	const first = new MinecraftClouds()
	const second = new MinecraftClouds()
	first.setContext({ x: 0, y: 64, z: 0, dayTime: 0, dimension: 'minecraft:overworld', biome: null, seed: '42' })
	second.setContext({ x: 0, y: 64, z: 0, dayTime: 0, dimension: 'minecraft:overworld', biome: null, seed: '43' })
	first.update(new Vector3(), 0)
	second.update(new Vector3(), 0)
	expect(first.position.x).not.toBe(second.position.x)
	first.dispose()
	second.dispose()
})
