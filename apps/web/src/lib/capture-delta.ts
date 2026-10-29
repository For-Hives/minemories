/**
 * Delivery of the film's GLB captures (docs/features/film-assets-pipeline.md).
 *
 * `bun run hero:assets` rebuilds S0 losslessly and ships S1..S4 (and personnages) as a byte delta against that S0, with a
 * manifest of content-hashed files. This module is the browser side, kept pure (no DOM, no module state): it reads the
 * manifest, downloads the base once, rebuilds each stage from its delta, checks the result, and falls back to the full
 * GLB served from the raw captures folder whenever anything fails. The self-contained file imports nothing, so the
 * pipeline imports this very file (Node strips the types) to prove that the shipped applier rebuilds the exact bytes.
 */

/** Largest GLB the applier agrees to allocate: a corrupt delta must not ask for gigabytes. */
export const MAX_GLB_BYTES = 64 * 1024 * 1024

export type CaptureKind = 'base' | 'delta'
export type CapturePriority = 'critical' | 'high' | 'low'

export interface CaptureEntry {
	/** File name of the optimised asset, relative to the manifest (content hashed: `S0.3f9c2a7b1d.glb`). */
	file: string
	kind: CaptureKind
	/** Logical name of the base for a delta (always `S0`). */
	base?: string
	/** Size in bytes of the GLB this entry stands for once rebuilt. */
	size: number
	/** SHA-256 (hex) of that rebuilt GLB. */
	sha256: string
	priority: CapturePriority
}

export interface CaptureManifest {
	version: 1
	files: Record<string, CaptureEntry>
}

export interface LoadedGlb {
	buffer: ArrayBuffer
	url: URL
}

export type GlbFetcher = (base: URL, name: string) => Promise<LoadedGlb>

/** Same shape as the film's own `AssetError`, so the scene reports `reason` the same way. */
export class CaptureFetchError extends Error {
	readonly file: string
	readonly url: string
	readonly reason: string
	constructor(file: string, url: string, reason: string) {
		super(`${file} : ${reason}`)
		this.file = file
		this.url = url
		this.reason = reason
	}
}

/** First byte of every delta: the format below. A change of format bumps it, and old clients fall back to the full GLB. */
export const DELTA_VERSION = 1

type Op = readonly [add: number, copy: number, from: number]

/** Reads LEB128-style numbers (7 bits per byte, low first) from `patch`, from `start`; `at()` is the read position. */
function numberReader(patch: Uint8Array, start: number): { varint: () => number; at: () => number } {
	let at = start
	const varint = (): number => {
		let value = 0
		let scale = 1
		for (let index = 0; index < 8; index++) {
			const byte = patch[at++]
			if (byte === undefined) throw new Error('delta: truncated')
			value += (byte & 127) * scale
			if (byte < 128) return value
			scale *= 128
		}
		throw new Error('delta: varint too long')
	}
	return { varint, at: () => at }
}

const unzigzag = (value: number): number => (value % 2 === 1 ? -(value + 1) / 2 : value / 2)

/** One operation: literal length, copy length and, for a copy, where it starts in the base (validated). */
function readOp(varint: () => number, previousEnd: number, baseLength: number, last: boolean): Op {
	const add = varint()
	const copy = varint()
	if (add === 0 && copy === 0 && !last) throw new Error('delta: empty operation')
	if (copy === 0) return [add, 0, 0]
	const from = previousEnd + unzigzag(varint())
	if (from < 0 || from + copy > baseLength) throw new Error('delta: copy outside the base')
	return [add, copy, from]
}

/** Reads the operation table at the head of a delta; `end` is where the literal bytes start. */
function readOps(baseLength: number, patch: Uint8Array): { ops: Op[]; end: number; literals: number; total: number } {
	if (patch[0] !== DELTA_VERSION) throw new Error('delta: unsupported version')
	const { varint, at } = numberReader(patch, 1)
	const count = varint()
	// every operation takes at least two bytes of table: a bigger count cannot be true, whatever it announces
	if (count > (patch.length - at()) / 2) throw new Error('delta: too many operations')
	const ops: Op[] = []
	let previousEnd = 0
	let total = 0
	let literals = 0
	for (let index = 0; index < count; index++) {
		const op = readOp(varint, previousEnd, baseLength, index === count - 1)
		if (op[1] > 0) previousEnd = op[2] + op[1]
		ops.push(op)
		literals += op[0]
		total += op[0] + op[1]
		if (total > MAX_GLB_BYTES) throw new Error('delta: result too large')
	}
	return { ops, end: at(), literals, total }
}

/**
 * Rebuilds a GLB from its base and a delta. Format: one version byte (`DELTA_VERSION`), a varint `n`, then `n` pairs
 * `[addLen, copyLen]` (and, when `copyLen` is not zero, a zigzag varint = copy offset minus the end of the previous
 * copy), then the literal bytes of every pair in order. Each pair means: `addLen` literal bytes, then `copyLen` bytes
 * copied from the base. Only the last pair may be empty. Throws on any inconsistency (unknown version, truncated delta,
 * copy outside the base, size above `MAX_GLB_BYTES` or different from `expectedSize`, which is checked before the
 * output is allocated).
 */
export function applyDelta(base: Uint8Array, patch: Uint8Array, expectedSize?: number): Uint8Array {
	const { ops, end, literals, total } = readOps(base.length, patch)
	if (end + literals !== patch.length) throw new Error('delta: wrong length')
	if (expectedSize !== undefined && total !== expectedSize) throw new Error('delta: unexpected size')
	const out = new Uint8Array(total)
	let at = end
	let to = 0
	for (const [add, copy, from] of ops) {
		out.set(patch.subarray(at, at + add), to)
		at += add
		to += add
		out.set(base.subarray(from, from + copy), to)
		to += copy
	}
	return out
}

const KINDS: readonly string[] = ['base', 'delta']
const PRIORITIES: readonly string[] = ['critical', 'high', 'low']
const SHA256 = /^[0-9a-f]{64}$/
const SAFE_FILE = /^[\w-]+\.[0-9a-f]{10}\.(glb|patch)$/

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEntry(value: unknown): CaptureEntry | null {
	if (!isRecord(value)) return null
	const { file, kind, base, size, sha256, priority } = value
	if (typeof file !== 'string' || !SAFE_FILE.test(file)) return null
	if (typeof kind !== 'string' || !KINDS.includes(kind)) return null
	if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0 || size > MAX_GLB_BYTES) return null
	if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return null
	if (typeof priority !== 'string' || !PRIORITIES.includes(priority)) return null
	if (kind === 'delta' && typeof base !== 'string') return null
	const entry: CaptureEntry = { file, kind: kind as CaptureKind, size, sha256, priority: priority as CapturePriority }
	if (typeof base === 'string') entry.base = base
	return entry
}

/** Validates a manifest read from the network; anything unexpected gives `null` (the film then uses the raw captures). */
export function parseCaptureManifest(value: unknown): CaptureManifest | null {
	if (!isRecord(value) || value.version !== 1 || !isRecord(value.files)) return null
	// no prototype: a capture called `constructor` or `__proto__` is just a name
	const files: Record<string, CaptureEntry> = Object.create(null)
	for (const [name, raw] of Object.entries(value.files)) {
		const entry = parseEntry(raw)
		if (!entry) return null
		files[name] = entry
	}
	return { version: 1, files }
}

type FetchLike = (input: URL, init?: { priority?: 'low' | 'high' | 'auto' }) => Promise<Response>

/** Downloads and validates the manifest; `null` on any failure (network, status, JSON, shape). */
export async function loadCaptureManifest(
	url: URL,
	fetchImpl: FetchLike = (input, init) => fetch(input, init)
): Promise<CaptureManifest | null> {
	try {
		const response = await fetchImpl(url)
		if (!response.ok) return null
		return parseCaptureManifest(await response.json())
	} catch {
		return null
	}
}

async function sha256Hex(bytes: Uint8Array, subtle: SubtleCrypto | undefined): Promise<string | null> {
	if (!subtle) return null
	const digest = new Uint8Array(await subtle.digest('SHA-256', bytes as BufferSource))
	return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

export interface GlbFetcherOptions {
	/** Resolves to the manifest, or `null` when it could not be loaded. */
	manifest: Promise<CaptureManifest | null>
	/** Folder the manifest's file names are relative to. */
	assets: URL
	fetch?: FetchLike
	/** `crypto.subtle`; absent on insecure origins, in which case the hash check is skipped (the size check stays). */
	subtle?: SubtleCrypto | undefined
}

/** What the film exposes (`window.__hero.captureFallbacks`) so a test can tell "optimised" from "silently the full files". */
export interface FallbackStats {
	count: number
	last: string | null
}

/**
 * Builds the film's `fetchGlb`. The base (`S0`) is downloaded once; a stage is rebuilt from its delta. A stage whose
 * delta is missing, corrupt or of the wrong size or hash, or whose base is unavailable, is fetched in full from the raw
 * captures folder instead, exactly as the film did before the pipeline. Every such fallback is warned about in the
 * console and counted in `stats`.
 */
export function createGlbFetcher(options: GlbFetcherOptions): GlbFetcher & { stats: FallbackStats } {
	const request: FetchLike = options.fetch ?? ((input, init) => fetch(input, init))
	const stats: FallbackStats = { count: 0, last: null }
	// one download per base file, failures included: a base that failed is not asked for again during the session
	const bases = new Map<string, Promise<Uint8Array>>()

	// `limit`: a base is exactly `entry.size`; a delta is never bigger than its target plus its few bytes of table
	const download = async (url: URL, entry: CaptureEntry, limit: number): Promise<Uint8Array> => {
		const response = await request(url, entry.priority === 'low' ? { priority: 'low' } : undefined)
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		const announced = Number(response.headers.get('content-length'))
		if (announced > limit) throw new Error('response too large')
		const bytes = new Uint8Array(await response.arrayBuffer())
		if (bytes.length > limit) throw new Error('response too large')
		return bytes
	}
	const verify = async (bytes: Uint8Array, entry: CaptureEntry): Promise<Uint8Array> => {
		if (bytes.length !== entry.size) throw new Error('size mismatch')
		const hash = await sha256Hex(bytes, options.subtle)
		if (hash !== null && hash !== entry.sha256) throw new Error('hash mismatch')
		return bytes
	}
	const optimisedBase = (entry: CaptureEntry): Promise<Uint8Array> => {
		let pending = bases.get(entry.file)
		if (!pending) {
			pending = download(new URL(entry.file, options.assets), entry, entry.size).then(bytes => verify(bytes, entry))
			bases.set(entry.file, pending)
		}
		return pending
	}
	const full = async (base: URL, name: string): Promise<LoadedGlb> => {
		const url = new URL(`${name}.glb`, base)
		let response: Response
		try {
			response = await request(url)
		} catch (error) {
			throw new CaptureFetchError(`${name}.glb`, url.href, `network (${(error as Error).message})`)
		}
		if (!response.ok) throw new CaptureFetchError(`${name}.glb`, url.href, `HTTP ${response.status}`)
		return { buffer: await response.arrayBuffer(), url }
	}
	const optimised = async (base: URL, name: string, manifest: CaptureManifest): Promise<LoadedGlb> => {
		const entry = manifest.files[name]
		if (!entry) throw new Error('not in the manifest')
		const target = new URL(`${name}.glb`, base)
		if (entry.kind === 'base') return { buffer: (await optimisedBase(entry)).slice().buffer, url: target }
		const baseEntry = manifest.files[entry.base ?? '']
		if (baseEntry?.kind !== 'base') throw new Error('unknown base')
		const [reference, patch] = await Promise.all([
			optimisedBase(baseEntry),
			download(new URL(entry.file, options.assets), entry, entry.size + 64),
		])
		return {
			buffer: (await verify(applyDelta(reference, patch, entry.size), entry)).buffer as ArrayBuffer,
			url: target,
		}
	}
	const fallback = (name: string, reason: string): void => {
		stats.count++
		stats.last = reason
		console.warn('[hero-assets] fallback', name, reason)
	}

	const fetcher = async (base: URL, name: string): Promise<LoadedGlb> => {
		const manifest = await options.manifest
		if (manifest) {
			try {
				return await optimised(base, name, manifest)
			} catch (error) {
				fallback(name, (error as Error).message)
			}
		} else fallback(name, 'manifest unavailable')
		return full(base, name)
	}
	return Object.assign(fetcher, { stats })
}
