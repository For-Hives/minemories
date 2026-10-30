import { createHash } from 'node:crypto'
import { beforeEach, expect, test, vi } from 'vitest'
import {
	applyDelta,
	CaptureFetchError,
	type CaptureManifest,
	createGlbFetcher,
	loadCaptureManifest,
	MAX_GLB_BYTES,
	parseCaptureManifest,
} from './capture-delta'

const text = (value: string) => new TextEncoder().encode(value)
const hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function varint(value: number): number[] {
	const out: number[] = []
	let rest = value
	while (rest >= 128) {
		out.push((rest % 128) | 128)
		rest = Math.floor(rest / 128)
	}
	out.push(rest)
	return out
}
const zigzag = (move: number) => (move < 0 ? -2 * move - 1 : 2 * move)
/** The format written down in capture-delta.ts, built by hand: ops are [literal, copyOffset, copyLength]. */
function patchOf(ops: [string, number, number][]): Uint8Array {
	const meta = [...varint(ops.length)]
	const literals: number[] = []
	let previousEnd = 0
	for (const [literal, from, copy] of ops) {
		meta.push(...varint(literal.length), ...varint(copy))
		if (copy > 0) {
			meta.push(...varint(zigzag(from - previousEnd)))
			previousEnd = from + copy
		}
		literals.push(...text(literal))
	}
	return Uint8Array.from([1, ...meta, ...literals])
}

beforeEach(() => {
	vi.restoreAllMocks()
	vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

const BASE = text('0123456789abcdefghijklmnopqrstuvwxyz')

test('applyDelta mixes literals and copies from the base, in both directions', () => {
	// "<base 10..15><-XY-><base 0..4><base 30..35>" : forward copy, literal, backward copy, forward copy
	const patch = patchOf([
		['', 10, 6],
		['-XY-', 0, 5],
		['', 30, 6],
	])
	expect(new TextDecoder().decode(applyDelta(BASE, patch))).toBe('abcdef-XY-01234uvwxyz')
	expect(applyDelta(BASE, patchOf([['all new', 0, 0]]))).toEqual(text('all new'))
	expect(applyDelta(BASE, patchOf([]))).toEqual(new Uint8Array(0))
})

test('applyDelta reads multi-byte numbers (offsets and lengths above 127)', () => {
	const base = Uint8Array.from({ length: 70000 }, (_, i) => i % 251)
	const out = applyDelta(
		base,
		patchOf([
			['', 300, 40000],
			['', 69000, 900],
		])
	)
	expect(out.length).toBe(40900)
	expect(out[0]).toBe(base[300])
	expect(out[40000]).toBe(base[69000])
})

test('applyDelta refuses every inconsistent delta', () => {
	expect(() => applyDelta(BASE, new Uint8Array(0))).toThrow('unsupported version')
	expect(() => applyDelta(BASE, Uint8Array.from([2, 0]))).toThrow('unsupported version')
	expect(() => applyDelta(BASE, Uint8Array.from([1]))).toThrow('truncated')
	expect(() => applyDelta(BASE, Uint8Array.from([1, 1, 5, 0x80]))).toThrow('truncated')
	expect(() => applyDelta(BASE, Uint8Array.from([1, ...Array(9).fill(128)]))).toThrow('varint too long')
	expect(() => applyDelta(BASE, Uint8Array.from([1, 200, 1, 0, 0]))).toThrow('too many operations')
	expect(() => applyDelta(BASE, patchOf([['', 30, 20]]))).toThrow('copy outside the base')
	expect(() => applyDelta(BASE, Uint8Array.from([1, 1, 0, 1, zigzag(-5)]))).toThrow('copy outside the base')
	expect(() => applyDelta(BASE, Uint8Array.from([...patchOf([['ab', 0, 0]]), 0]))).toThrow('wrong length')
	expect(() => applyDelta(BASE, patchOf([['abc', 0, 0]]).subarray(0, 4))).toThrow('wrong length')
	expect(() =>
		applyDelta(
			BASE,
			patchOf([
				['', 0, 0],
				['x', 0, 0],
			])
		)
	).toThrow('empty operation')
	expect(
		applyDelta(
			BASE,
			patchOf([
				['x', 0, 0],
				['', 0, 0],
			])
		)
	).toEqual(text('x'))
	const huge = Uint8Array.from([1, 1, ...varint(MAX_GLB_BYTES + 1), 0])
	expect(() => applyDelta(BASE, huge)).toThrow('result too large')
})

test('applyDelta checks the announced size before allocating', () => {
	const patch = patchOf([['abc', 0, 0]])
	expect(applyDelta(BASE, patch, 3)).toEqual(text('abc'))
	expect(() => applyDelta(BASE, patch, 4)).toThrow('unexpected size')
})

const entry = (file: string, bytes: Uint8Array, extra: Record<string, unknown> = {}) => ({
	file,
	kind: 'base',
	size: bytes.length,
	sha256: hex(bytes),
	priority: 'critical',
	...extra,
})

test('parseCaptureManifest accepts the pipeline manifest and rejects anything else', () => {
	const good = {
		version: 1,
		files: {
			S0: entry('S0.cccccccccc.glb', BASE),
			S1: entry('S1.dddddddddd.patch', BASE, { kind: 'delta', base: 'S0', priority: 'low' }),
		},
	}
	expect(parseCaptureManifest(good)).toEqual(good)
	const bad = (patch: Record<string, unknown>) =>
		parseCaptureManifest({ version: 1, files: { S0: { ...entry('S0.cccccccccc.glb', BASE), ...patch } } })
	expect(bad({})).not.toBeNull()
	for (const patch of [
		{ file: 3 },
		{ file: '../S0.glb' },
		{ file: 'S0.glb' },
		{ file: 'S0.abc.glb' },
		{ file: 'S0.aaaaaaaaaa.txt' },
		{ kind: 'full' },
		{ kind: 7 },
		{ size: 0 },
		{ size: 1.5 },
		{ size: MAX_GLB_BYTES + 1 },
		{ size: 'big' },
		{ sha256: 'xyz' },
		{ sha256: 4 },
		{ priority: 'urgent' },
		{ priority: 1 },
		{ kind: 'delta' },
	])
		expect(bad(patch)).toBeNull()
	expect(parseCaptureManifest(null)).toBeNull()
	expect(parseCaptureManifest([])).toBeNull()
	expect(parseCaptureManifest({ version: 2, files: {} })).toBeNull()
	expect(parseCaptureManifest({ version: 1, files: 4 })).toBeNull()
	expect(parseCaptureManifest({ version: 1, files: { S0: null } })).toBeNull()
})

const url = (path: string) => new URL(path, 'https://site.test/')
const response = (body: Uint8Array | string, status = 200) =>
	new Response(typeof body === 'string' ? body : (body.buffer as ArrayBuffer), { status })

test('loadCaptureManifest returns null for every failure and the manifest otherwise', async () => {
	const good = { version: 1, files: { S0: entry('S0.cccccccccc.glb', BASE) } }
	expect(await loadCaptureManifest(url('/m.json'), async () => response(JSON.stringify(good)))).toEqual(good)
	expect(await loadCaptureManifest(url('/m.json'), async () => response('{}', 404))).toBeNull()
	expect(await loadCaptureManifest(url('/m.json'), async () => response('not json'))).toBeNull()
	expect(await loadCaptureManifest(url('/m.json'), async () => response('{"version":3}'))).toBeNull()
	expect(await loadCaptureManifest(url('/m.json'), async () => Promise.reject(new Error('offline')))).toBeNull()
	vi.stubGlobal('fetch', async () => response(JSON.stringify(good)))
	expect(await loadCaptureManifest(url('/m.json'))).toEqual(good)
	vi.unstubAllGlobals()
})

// S0 = BASE; S1 = rebuilt from a delta; both also exist as full raw files for the fallback
const S1 = text('abcdef-XY-01234uvwxyz')
const S1_PATCH = patchOf([
	['', 10, 6],
	['-XY-', 0, 5],
	['', 30, 6],
])
const MANIFEST: CaptureManifest = {
	version: 1,
	files: {
		S0: entry('S0.aaaaaaaaaa.glb', BASE) as CaptureManifest['files'][string],
		S1: entry('S1.bbbbbbbbbb.patch', S1, {
			kind: 'delta',
			base: 'S0',
			priority: 'low',
		}) as CaptureManifest['files'][string],
	},
}
const RAW_BASE = url('/hero/captures/')
const ASSETS = url('/hero/captures-opt/')

function server(overrides: Record<string, () => Response | Promise<Response>> = {}) {
	const files: Record<string, Uint8Array> = {
		'/hero/captures-opt/S0.aaaaaaaaaa.glb': BASE,
		'/hero/captures-opt/S1.bbbbbbbbbb.patch': S1_PATCH,
		'/hero/captures/S0.glb': text('RAW S0'),
		'/hero/captures/S1.glb': text('RAW S1'),
	}
	const calls: { path: string; priority: string | undefined }[] = []
	const fetchImpl = vi.fn(async (input: URL, init?: { priority?: 'low' | 'high' | 'auto' }) => {
		calls.push({ path: input.pathname, priority: init?.priority })
		const custom = overrides[input.pathname]
		if (custom) return custom()
		const body = files[input.pathname]
		return body ? response(body.slice()) : response('missing', 404)
	})
	return { fetchImpl, calls }
}
const bytesOf = async (promise: Promise<{ buffer: ArrayBuffer }>) => new Uint8Array((await promise).buffer)

test('the base is downloaded once and each stage is rebuilt from its delta, the deltas at low priority', async () => {
	const { fetchImpl, calls } = server()
	const fetcher = createGlbFetcher({
		manifest: Promise.resolve(MANIFEST),
		assets: ASSETS,
		fetch: fetchImpl,
		subtle: crypto.subtle,
	})
	const [s0, s1] = await Promise.all([fetcher(RAW_BASE, 'S0'), fetcher(RAW_BASE, 'S1')])
	expect(new Uint8Array(s0.buffer)).toEqual(BASE)
	expect(new Uint8Array(s1.buffer)).toEqual(S1)
	expect(s0.url.href).toBe('https://site.test/hero/captures/S0.glb')
	expect(s1.url.href).toBe('https://site.test/hero/captures/S1.glb')
	expect(calls.filter(call => call.path.endsWith('S0.aaaaaaaaaa.glb'))).toHaveLength(1)
	expect(calls.find(call => call.path.endsWith('S1.bbbbbbbbbb.patch'))?.priority).toBe('low')
	expect(calls.find(call => call.path.endsWith('S0.aaaaaaaaaa.glb'))?.priority).toBeUndefined()
	// the film may transfer or reuse a buffer it was given: the base kept for later stages is never the one handed out
	new Uint8Array(s0.buffer).fill(0)
	expect(await bytesOf(fetcher(RAW_BASE, 'S1'))).toEqual(S1)
	expect(calls.filter(call => call.path.endsWith('S0.aaaaaaaaaa.glb'))).toHaveLength(1)
})

test('without a manifest, or for a name it does not list, the full raw GLB is fetched', async () => {
	const none = server()
	const noManifest = createGlbFetcher({ manifest: Promise.resolve(null), assets: ASSETS, fetch: none.fetchImpl })
	expect(await bytesOf(noManifest(RAW_BASE, 'S1'))).toEqual(text('RAW S1'))
	expect(none.calls.map(call => call.path)).toEqual(['/hero/captures/S1.glb'])
	const unlisted = createGlbFetcher({ manifest: Promise.resolve(MANIFEST), assets: ASSETS, fetch: server().fetchImpl })
	await expect(unlisted(RAW_BASE, 'S9')).rejects.toMatchObject({ reason: 'HTTP 404', file: 'S9.glb' })
})

test('every failure of the optimised path falls back to the full GLB', async () => {
	const subtle = crypto.subtle
	const attempt = async (fetchImpl: ReturnType<typeof server>['fetchImpl'], manifest = MANIFEST, name = 'S1') =>
		bytesOf(
			createGlbFetcher({ manifest: Promise.resolve(manifest), assets: ASSETS, fetch: fetchImpl, subtle })(
				RAW_BASE,
				name
			)
		)
	// delta missing
	expect(
		await attempt(server({ '/hero/captures-opt/S1.bbbbbbbbbb.patch': () => response('x', 404) }).fetchImpl)
	).toEqual(text('RAW S1'))
	// delta corrupt (truncated)
	expect(
		await attempt(server({ '/hero/captures-opt/S1.bbbbbbbbbb.patch': () => response(S1_PATCH.slice(0, 3)) }).fetchImpl)
	).toEqual(text('RAW S1'))
	// delta valid but wrong content (hash mismatch)
	const other = patchOf([['X'.repeat(S1.length), 0, 0]])
	expect(await attempt(server({ '/hero/captures-opt/S1.bbbbbbbbbb.patch': () => response(other) }).fetchImpl)).toEqual(
		text('RAW S1')
	)
	// base unavailable: both the base and its deltas fall back
	const noBase = server({ '/hero/captures-opt/S0.aaaaaaaaaa.glb': () => response('x', 500) })
	expect(await attempt(noBase.fetchImpl, MANIFEST, 'S0')).toEqual(text('RAW S0'))
	expect(await attempt(noBase.fetchImpl)).toEqual(text('RAW S1'))
	// base of the wrong size
	expect(
		await attempt(server({ '/hero/captures-opt/S0.aaaaaaaaaa.glb': () => response('short') }).fetchImpl, MANIFEST, 'S0')
	).toEqual(text('RAW S0'))
	// delta whose base is not in the manifest, or is itself a delta
	const orphan = { version: 1, files: { S1: { ...MANIFEST.files.S1, base: 'S0' } } } as CaptureManifest
	expect(await attempt(server().fetchImpl, orphan)).toEqual(text('RAW S1'))
	const chained = { version: 1, files: { S0: MANIFEST.files.S1, S1: MANIFEST.files.S1 } } as CaptureManifest
	expect(await attempt(server().fetchImpl, chained)).toEqual(text('RAW S1'))
	const noBaseName = { version: 1, files: { S1: { ...MANIFEST.files.S1 } } } as CaptureManifest
	delete (noBaseName.files.S1 as { base?: string }).base
	expect(await attempt(server().fetchImpl, noBaseName)).toEqual(text('RAW S1'))
})

test('a base that failed is not downloaded again during the session', async () => {
	const { fetchImpl, calls } = server({ '/hero/captures-opt/S0.aaaaaaaaaa.glb': () => response('x', 503) })
	const fetcher = createGlbFetcher({ manifest: Promise.resolve(MANIFEST), assets: ASSETS, fetch: fetchImpl })
	expect(await bytesOf(fetcher(RAW_BASE, 'S1'))).toEqual(text('RAW S1'))
	expect(await bytesOf(fetcher(RAW_BASE, 'S1'))).toEqual(text('RAW S1'))
	expect(await bytesOf(fetcher(RAW_BASE, 'S0'))).toEqual(text('RAW S0'))
	expect(calls.filter(call => call.path.endsWith('S0.aaaaaaaaaa.glb'))).toHaveLength(1)
})

test('two different bases are cached separately', async () => {
	const other = BASE.slice().reverse()
	const manifest = {
		version: 1,
		files: {
			S0: MANIFEST.files.S0,
			S9: entry('S9.eeeeeeeeee.glb', other),
			S1: entry('S1.bbbbbbbbbb.patch', applyDelta(other, S1_PATCH), { kind: 'delta', base: 'S9', priority: 'low' }),
		},
	} as unknown as CaptureManifest
	const { fetchImpl } = server({ '/hero/captures-opt/S9.eeeeeeeeee.glb': () => response(other.slice()) })
	const fetcher = createGlbFetcher({
		manifest: Promise.resolve(manifest),
		assets: ASSETS,
		fetch: fetchImpl,
		subtle: crypto.subtle,
	})
	expect(await bytesOf(fetcher(RAW_BASE, 'S0'))).toEqual(BASE)
	expect(await bytesOf(fetcher(RAW_BASE, 'S1'))).toEqual(applyDelta(other, S1_PATCH))
})

test('an announced length above the size in the manifest is refused before the body is read', async () => {
	const huge = () => new Response(S1_PATCH.slice(), { headers: { 'content-length': '99999999' } })
	const { fetchImpl } = server({ '/hero/captures-opt/S1.bbbbbbbbbb.patch': huge })
	const fetcher = createGlbFetcher({ manifest: Promise.resolve(MANIFEST), assets: ASSETS, fetch: fetchImpl })
	expect(await bytesOf(fetcher(RAW_BASE, 'S1'))).toEqual(text('RAW S1'))
	expect(fetcher.stats.last).toContain('too large')
	// no announced length (chunked): the body read is checked too
	const chunked = server({ '/hero/captures-opt/S1.bbbbbbbbbb.patch': () => response(new Uint8Array(500)) })
	const second = createGlbFetcher({ manifest: Promise.resolve(MANIFEST), assets: ASSETS, fetch: chunked.fetchImpl })
	expect(await bytesOf(second(RAW_BASE, 'S1'))).toEqual(text('RAW S1'))
	expect(second.stats.last).toBe('response too large')
})

test('every fallback is reported: console warning, counter, last reason; a clean load reports none', async () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	const clean = createGlbFetcher({ manifest: Promise.resolve(MANIFEST), assets: ASSETS, fetch: server().fetchImpl })
	await clean(RAW_BASE, 'S0')
	await clean(RAW_BASE, 'S1')
	expect(clean.stats).toEqual({ count: 0, last: null })
	expect(warn).not.toHaveBeenCalled()
	const broken = createGlbFetcher({
		manifest: Promise.resolve(MANIFEST),
		assets: ASSETS,
		fetch: server({ '/hero/captures-opt/S1.bbbbbbbbbb.patch': () => response('x', 404) }).fetchImpl,
	})
	await broken(RAW_BASE, 'S1')
	expect(broken.stats).toEqual({ count: 1, last: 'HTTP 404' })
	expect(warn).toHaveBeenCalledWith('[hero-assets] fallback', 'S1', 'HTTP 404')
	const noManifest = createGlbFetcher({ manifest: Promise.resolve(null), assets: ASSETS, fetch: server().fetchImpl })
	await noManifest(RAW_BASE, 'S0')
	expect(noManifest.stats).toEqual({ count: 1, last: 'manifest unavailable' })
	warn.mockRestore()
})

test('a name that only exists on Object.prototype is not in the manifest', async () => {
	const parsed = parseCaptureManifest(JSON.parse(JSON.stringify({ version: 1, files: { S0: MANIFEST.files.S0 } })))
	expect(parsed?.files.constructor).toBeUndefined()
	const fetcher = createGlbFetcher({ manifest: Promise.resolve(parsed), assets: ASSETS, fetch: server().fetchImpl })
	await expect(fetcher(RAW_BASE, 'constructor')).rejects.toMatchObject({ reason: 'HTTP 404' })
})

test('without crypto.subtle only the size is checked', async () => {
	const wrongContent = patchOf([['X'.repeat(S1.length), 0, 0]])
	const { fetchImpl } = server({ '/hero/captures-opt/S1.bbbbbbbbbb.patch': () => response(wrongContent) })
	const fetcher = createGlbFetcher({ manifest: Promise.resolve(MANIFEST), assets: ASSETS, fetch: fetchImpl })
	expect(await bytesOf(fetcher(RAW_BASE, 'S1'))).toEqual(text('X'.repeat(S1.length)))
})

test("the full fetch reports network and HTTP failures in the film's own error shape", async () => {
	const down = createGlbFetcher({
		manifest: Promise.resolve(null),
		assets: ASSETS,
		fetch: async () => Promise.reject(new Error('offline')),
	})
	const failure = await down(RAW_BASE, 'S0').catch((error: unknown) => error)
	expect(failure).toBeInstanceOf(CaptureFetchError)
	expect(failure).toMatchObject({
		file: 'S0.glb',
		url: 'https://site.test/hero/captures/S0.glb',
		reason: 'network (offline)',
	})
	expect((failure as Error).message).toBe('S0.glb : network (offline)')
	vi.stubGlobal('fetch', async () => response(BASE.slice()))
	expect(await bytesOf(createGlbFetcher({ manifest: Promise.resolve(null), assets: ASSETS })(RAW_BASE, 'S0'))).toEqual(
		BASE
	)
	vi.unstubAllGlobals()
})
