// The pipeline itself (no file system writes): raw captures in, content-hashed optimised assets + manifest out.
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { makeVerifiedDelta } from './delta.mjs'
import { proveEquivalent, sha256 } from './equivalence.mjs'
import { inventoryOfAll } from './inventory.mjs'
import { rebuildGlb } from './rebuild.mjs'

export const brotli = bytes =>
	brotliCompressSync(bytes, {
		params: {
			[constants.BROTLI_PARAM_QUALITY]: 11,
			[constants.BROTLI_PARAM_LGWIN]: 24,
			[constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
		},
	})
export const gzip = bytes => gzipSync(bytes, { level: 9 })

const hashedName = (name, bytes, extension) => `${name}.${sha256(bytes).slice(0, 10)}.${extension}`

/**
 * @typedef {object} CaptureConfig
 * @property {string} name logical name, also the raw file name (`<name>.glb`)
 * @property {'stage' | 'characters'} role
 * @property {'critical' | 'high' | 'low'} priority
 * @property {boolean} [delta] shipped as a delta against the base capture
 */

/** Rebuilds one capture and refuses it unless the independent decoder finds it identical to the source. */
async function rebuildProven(capture, source, tools, log) {
	const { glb, stats } = await rebuildGlb(source, tools.rebuildTools)
	const proof = await proveEquivalent(source, glb, tools.proofDecoder)
	if (proof.mismatches.length > 0)
		throw new Error(
			`${capture.name}: rebuilt capture differs from the source: ${proof.mismatches.slice(0, 5).join(', ')}`
		)
	log(`${capture.name}: ${source.length} -> ${glb.length} bytes, ${proof.compared} items identical after decoding`)
	return { glb, proof: { compared: proof.compared, ...stats } }
}

/** What is shipped for one capture: the payload (GLB or delta), its compressed copies and its manifest rows. */
function shipCapture(capture, { glb, proof }, source, config, base) {
	const isDelta = capture.delta === true
	const payload = isDelta ? makeVerifiedDelta(base, glb) : glb
	const file = hashedName(capture.name, payload, isDelta ? 'patch' : 'glb')
	const compressed = { br: brotli(payload), gz: gzip(payload) }
	// what the browser reads (kept small: it is on the critical path)
	const entry = {
		file,
		kind: isDelta ? 'delta' : 'base',
		...(isDelta ? { base: config.base } : {}),
		size: glb.length,
		sha256: sha256(glb),
		priority: capture.priority,
	}
	return {
		files: [
			[file, payload],
			[`${file}.br`, compressed.br],
			[`${file}.gz`, compressed.gz],
		],
		entry,
		// what the CI and the docs read
		detail: {
			...entry,
			role: capture.role,
			bytes: { raw: payload.length, gzip: compressed.gz.length, brotli: compressed.br.length },
			source: { file: `${capture.name}.glb`, bytes: source.length, sha256: sha256(source) },
			proof,
		},
	}
}

/**
 * @param {{ base: string, captures: CaptureConfig[] }} config
 * @param {Record<string, Uint8Array>} sources raw GLB bytes by capture name
 * @param {{ rebuildTools: import('./rebuild.mjs').Tools, proofDecoder: object, toolchain: Record<string, string> }} tools
 * @param {(line: string) => void} [log]
 */
export async function runPipeline(config, sources, tools, log = () => undefined) {
	const baseCapture = config.captures.find(capture => capture.name === config.base)
	if (!baseCapture) throw new Error(`base capture ${config.base} is not configured`)
	if (baseCapture.delta) throw new Error('the base capture cannot be a delta')
	// the browser caches one download per base file, and every delta is computed against `config.base`: no second full file
	const others = config.captures.filter(capture => capture.name !== config.base && !capture.delta)
	if (others.length > 0)
		throw new Error(
			`only ${config.base} may be shipped as a full file (set "delta": true on ${others.map(capture => capture.name).join(', ')})`
		)
	const rebuilt = {}
	for (const capture of config.captures) {
		const source = sources[capture.name]
		if (!source) throw new Error(`missing source capture ${capture.name}.glb`)
		// biome-ignore lint/performance/noAwaitInLoops: one WASM optimiser, one capture at a time, in config order
		rebuilt[capture.name] = await rebuildProven(capture, source, tools, log)
	}
	const base = rebuilt[config.base].glb
	const outputs = new Map()
	const files = {}
	const details = {}
	for (const capture of config.captures) {
		const shipped = shipCapture(capture, rebuilt[capture.name], sources[capture.name], config, base)
		for (const [name, bytes] of shipped.files) outputs.set(name, bytes)
		files[capture.name] = shipped.entry
		details[capture.name] = shipped.detail
	}
	const manifest = { version: 1, files }
	const inventory = inventoryOfAll(sources)
	const report = { version: 1, generator: 'scripts/hero-assets', toolchain: tools.toolchain, files: details, inventory }
	const text = value => new TextEncoder().encode(`${JSON.stringify(value, null, '\t')}\n`)
	outputs.set('manifest.json', text(manifest))
	outputs.set('report.json', text(report))
	return { outputs, manifest, report }
}
