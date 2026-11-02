import { expect, test } from 'vitest'
import { compressedSample } from '../testing/quads-glb'
import { expandMeshoptGlb, VARIANT_HEADER, withMeshoptVariant } from './glb-meshopt'

test('the variant is requested with the right query separator and announced by one header', () => {
	expect(withMeshoptVariant('/api/memories/1/file')).toBe('/api/memories/1/file?variant=meshopt')
	expect(withMeshoptVariant('/file?x=1')).toBe('/file?x=1&variant=meshopt')
	expect(VARIANT_HEADER).toBe('X-Minemories-Variant')
})

test('a Meshopt variant expands to a smaller-to-transfer file with identical geometry bytes', async () => {
	const { plain, compressed } = await compressedSample()
	expect(compressed.byteLength).toBeLessThan(plain.byteLength / 2)
	const expanded = await expandMeshoptGlb(compressed)
	expect(expanded).not.toBeNull()
	const text = new TextDecoder().decode(expanded?.subarray(20, 400))
	expect(text).not.toContain('EXT_meshopt_compression')
	// Positions, indices and the image are byte-identical to the plain file once expanded.
	const bin = (glb: Uint8Array) => {
		const view = new DataView(glb.buffer, glb.byteOffset)
		return glb.subarray(28 + view.getUint32(12, true))
	}
	expect(Array.from(bin(expanded as Uint8Array))).toEqual(Array.from(bin(plain)))
})

test('bytes that are not a variant, and corrupted variants, expand to nothing', async () => {
	expect(await expandMeshoptGlb(new Uint8Array(30))).toBeNull()
	const { compressed } = await compressedSample(50)
	const view = new DataView(compressed.buffer, compressed.byteOffset)
	const corrupted = compressed.slice()
	corrupted.fill(0xff, 28 + view.getUint32(12, true) + 8)
	expect(await expandMeshoptGlb(corrupted)).toBeNull()
})
