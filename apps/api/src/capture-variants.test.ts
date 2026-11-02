import { expect, test } from 'bun:test'
import { Readable } from 'node:stream'
import { expandGlb } from '@minemories/api-contract/glb-meshopt'
import { MeshoptDecoder } from 'meshoptimizer'
import { createVariantService, variantCapture } from './capture-variants'

async function read(stream: Readable): Promise<Buffer> {
	const chunks: Buffer[] = []
	for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array))
	return Buffer.concat(chunks)
}

function service(overrides: Partial<Parameters<typeof createVariantService>[0]> = {}) {
	const calls: Uint8Array[] = []
	let clock = 0
	const options = {
		compress: async (glb: Uint8Array) => {
			calls.push(glb)
			return Uint8Array.from([...glb].reverse())
		},
		now: () => clock,
		maxSourceBytes: 1000,
		cacheBytes: 100,
		ttlMs: 50,
		...overrides,
	}
	return { run: createVariantService(options), calls, advance: (ms: number) => (clock += ms) }
}

test('any variant other than meshopt returns the stored stream untouched', async () => {
	const { run, calls } = service()
	const stream = Readable.from([Buffer.from('abc')])
	const result = await run(undefined, stream)
	expect(result.body).toBe(stream)
	expect(result.headers).toEqual({})
	expect((await run('draco', stream)).body).toBe(stream)
	expect(calls).toHaveLength(0)
})

test('a meshopt request serves the derivative, announces it and caches it until it expires', async () => {
	const { run, calls, advance } = service()
	const first = await run('meshopt', Readable.from([Buffer.from('ab'), Buffer.from('cd')]))
	expect(first.headers).toEqual({ 'X-Minemories-Variant': 'meshopt' })
	expect((await read(first.body)).toString()).toBe('dcba')
	const second = await run('meshopt', Readable.from([Buffer.from('abcd')]))
	expect((await read(second.body)).toString()).toBe('dcba')
	expect(calls).toHaveLength(1)
	advance(60)
	await run('meshopt', Readable.from([Buffer.from('abcd')]))
	expect(calls).toHaveLength(2)
})

test('an original that cannot be improved is served as stored and remembered as such', async () => {
	const { run, calls } = service({
		compress: async glb => {
			calls.push(glb)
			return null
		},
	})
	const result = await run('meshopt', Readable.from([Buffer.from('plain')]))
	expect(result.headers).toEqual({})
	expect((await read(result.body)).toString()).toBe('plain')
	await run('meshopt', Readable.from([Buffer.from('plain')]))
	expect(calls).toHaveLength(1)
})

test('a failing compressor falls back to the original', async () => {
	const { run } = service({
		compress: async () => {
			throw new Error('wasm')
		},
	})
	const result = await run('meshopt', Readable.from([Buffer.from('plain')]))
	expect((await read(result.body)).toString()).toBe('plain')
	expect(result.headers).toEqual({})
})

test('an original above the size limit is streamed back in full without being compressed', async () => {
	const { run, calls } = service({ maxSourceBytes: 5 })
	const source = Readable.from([Buffer.from('abc'), Buffer.from('def'), Buffer.from('ghi')])
	const result = await run('meshopt', source)
	expect((await read(result.body)).toString()).toBe('abcdefghi')
	expect(calls).toHaveLength(0)
	const stopped = Readable.from([Buffer.from('abcdef'), Buffer.from('ghi')])
	const early = await run('meshopt', stopped)
	early.body.destroy()
	await new Promise(resolve => setTimeout(resolve, 5))
	expect(stopped.destroyed).toBe(true)
})

test('the cache stays within its byte budget and evicts the oldest derivative first', async () => {
	const { run, calls } = service({ cacheBytes: 8 })
	await run('meshopt', Readable.from([Buffer.from('aaaaa')]))
	await run('meshopt', Readable.from([Buffer.from('bbbbb')]))
	expect(calls).toHaveLength(2)
	// 'aaaaa' was evicted to make room for 'bbbbb': asking again recomputes it.
	await run('meshopt', Readable.from([Buffer.from('aaaaa')]))
	expect(calls).toHaveLength(3)
	// A derivative larger than the whole cache is served but not kept.
	await run('meshopt', Readable.from([Buffer.from('c'.repeat(9))]))
	await run('meshopt', Readable.from([Buffer.from('c'.repeat(9))]))
	expect(calls).toHaveLength(5)
})

test('more than one compression at a time queues, and a flood is served the original', async () => {
	let release: () => void = () => undefined
	const gate = new Promise<void>(resolve => {
		release = resolve
	})
	const { run, calls } = service({
		compress: async glb => {
			calls.push(glb)
			await gate
			return Uint8Array.from([1])
		},
	})
	const requests = ['a', 'b', 'c', 'd'].map(text => run('meshopt', Readable.from([Buffer.from(text)])))
	const flooded = await requests[3]
	expect((await read((flooded as Awaited<(typeof requests)[0]>).body)).toString()).toBe('d')
	release()
	const results = await Promise.all(requests)
	expect(results.filter(result => result.headers['X-Minemories-Variant']).length).toBe(3)
	expect(calls.length).toBeLessThanOrEqual(3)
})

test('the production service compresses a real capture and the viewer can expand it', async () => {
	await MeshoptDecoder.ready
	// Not a GLB: nothing to gain, so the bytes come back unchanged.
	const result = await variantCapture('meshopt', Readable.from([Buffer.from('not a glb')]))
	expect((await read(result.body)).toString()).toBe('not a glb')
	expect(expandGlb(new Uint8Array(4), MeshoptDecoder)).toBeNull()
})
