import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { MeshoptEncoder } from 'meshoptimizer'
import { applyDelta } from '../../apps/web/src/lib/capture-delta.ts'
import { budgetMetrics, checkBudget } from './budget.mjs'
import { makeDelta, makeVerifiedDelta } from './delta.mjs'
import { sha256 } from './equivalence.mjs'
import { inventoryOf, inventoryOfAll } from './inventory.mjs'
import { runPipeline } from './pipeline.mjs'
import { pngOf, syntheticGlb } from './synthetic.mjs'
import { realTools } from './tools.mjs'

const HASHED_GLB = /^S0\.[0-9a-f]{10}\.glb$/
const HASHED_PATCH = /^S1\.[0-9a-f]{10}\.patch$/
const config = {
	base: 'S0',
	captures: [
		{ name: 'S0', role: 'stage', priority: 'critical' },
		{ name: 'S1', role: 'stage', priority: 'low', delta: true },
		{ name: 'personnages', role: 'characters', priority: 'low', delta: true },
	],
}
let tools
let sources
before(async () => {
	tools = await realTools()
	await MeshoptEncoder.ready
	sources = {
		S0: syntheticGlb({ MeshoptEncoder }, { cells: 96 }),
		S1: syntheticGlb({ MeshoptEncoder }, { cells: 90 }),
		personnages: syntheticGlb({ MeshoptEncoder }, { cells: 40, tint: 9 }),
	}
})

test('every capture is rebuilt, proven, hashed and listed; deltas rebuild the exact GLB with the shipped applier', async () => {
	const { outputs, manifest, report } = await runPipeline(config, sources, tools)
	assert.deepEqual(Object.keys(manifest.files), ['S0', 'S1', 'personnages'])
	const base = outputs.get(manifest.files.S0.file)
	assert.match(manifest.files.S0.file, HASHED_GLB)
	assert.match(manifest.files.S1.file, HASHED_PATCH)
	assert.equal(manifest.files.S0.sha256, sha256(base))
	assert.equal(manifest.files.S0.kind, 'base')
	assert.equal(manifest.files.S1.base, 'S0')
	for (const name of ['S1', 'personnages']) {
		const entry = manifest.files[name]
		const rebuilt = applyDelta(base, outputs.get(entry.file))
		assert.equal(rebuilt.length, entry.size)
		assert.equal(sha256(rebuilt), entry.sha256)
		assert.ok(outputs.get(entry.file).length < base.length, 'a delta is smaller than the file it replaces')
	}
	for (const file of Object.values(manifest.files).map(entry => entry.file)) {
		assert.ok(outputs.has(`${file}.br`) && outputs.has(`${file}.gz`), `${file} is precompressed`)
	}
	assert.ok(outputs.has('manifest.json') && outputs.has('report.json'))
	assert.equal(JSON.parse(new TextDecoder().decode(outputs.get('manifest.json'))).version, 1)
	assert.equal(report.files.S1.source.file, 'S1.glb')
	assert.ok(report.files.S0.bytes.brotli < report.files.S0.bytes.raw)
})

test('the same sources give the same bytes (the CI can compare), and a changed source changes the hash', async () => {
	const first = await runPipeline(config, sources, tools)
	const second = await runPipeline(config, sources, tools)
	assert.deepEqual([...first.outputs.keys()], [...second.outputs.keys()])
	for (const [name, bytes] of first.outputs) assert.equal(sha256(bytes), sha256(second.outputs.get(name)), name)
	const changed = await runPipeline(config, { ...sources, S1: syntheticGlb({ MeshoptEncoder }, { cells: 91 }) }, tools)
	assert.notEqual(changed.manifest.files.S1.file, first.manifest.files.S1.file)
	assert.equal(changed.manifest.files.S0.file, first.manifest.files.S0.file)
})

test('configuration mistakes fail loudly', async () => {
	await assert.rejects(runPipeline(config, { S0: sources.S0 }, tools), { message: 'missing source capture S1.glb' })
	await assert.rejects(runPipeline({ base: 'S9', captures: config.captures.slice(0, 1) }, sources, tools), {
		message: 'base capture S9 is not configured',
	})
	await assert.rejects(
		runPipeline(
			{ base: 'S0', captures: [{ name: 'S0', role: 'stage', priority: 'critical', delta: true }] },
			sources,
			tools
		),
		{ message: 'the base capture cannot be a delta' }
	)
	// an "optimiser" that changes the pixels must be caught by the proof, never shipped
	const lossy = { ...tools.rebuildTools, optimisePng: async () => pngOf(8, 8, () => [1, 2, 3, 255]) }
	await assert.rejects(runPipeline(config, sources, { ...tools, rebuildTools: lossy }), {
		message: 'S0: rebuilt capture differs from the source: image bufferView 0: size',
	})
})

test('the delta encoder rebuilds arbitrary bytes, including unrelated and empty ones', () => {
	const base = Uint8Array.from({ length: 5000 }, (_, i) => (i * 31 + (i >> 5)) & 255)
	const target = new Uint8Array([
		...base.subarray(100, 900),
		...Uint8Array.from({ length: 300 }, (_, i) => i & 255),
		...base.subarray(4000, 4900),
	])
	assert.deepEqual(applyDelta(base, makeDelta(base, target)), target)
	assert.deepEqual(applyDelta(base, makeVerifiedDelta(base, new Uint8Array(0))), new Uint8Array(0))
	assert.deepEqual(applyDelta(new Uint8Array(0), makeDelta(new Uint8Array(0), target)), target)
	const patch = makeDelta(base, target)
	assert.ok(patch.length < target.length / 2, 'the copied parts are not stored again')
})

test('the inventory counts what the captures hold and what they share', () => {
	const one = inventoryOf(sources.S0)
	assert.equal(one.vertices, 96 * 4)
	assert.equal(one.primitives, 1)
	assert.equal(one.images, 1)
	assert.ok(one.geometryBytes > 0 && one.textureBytes > 0)
	const all = inventoryOfAll({ S0: sources.S0, S1: sources.S1, personnages: sources.personnages })
	assert.equal(all.images.unique, 2)
	assert.equal(all.images.sharedBetweenFiles, 1)
	assert.equal(all.captures.S0.uniqueImages, 1)
})

test('the byte budget passes inside the 3 % margin and fails outside, and refuses unbudgeted metrics', async () => {
	const { report } = await runPipeline(config, sources, tools)
	const measured = budgetMetrics(report)
	assert.deepEqual(Object.keys(measured).sort(), [
		'baseBrotli',
		'charactersBrotli',
		'deltasBrotli',
		'stagesBrotli',
		'stagesGzip',
	])
	const baseline = Object.fromEntries(
		Object.entries(measured).map(([metric, bytes]) => [metric, Math.ceil(bytes / 1.029)])
	)
	assert.equal(checkBudget(report, { marginPercent: 3, baseline }).ok, true)
	const tight = checkBudget(report, {
		marginPercent: 3,
		baseline: { ...baseline, baseBrotli: Math.floor(measured.baseBrotli / 1.04) },
	})
	assert.equal(tight.ok, false)
	assert.equal(tight.rows.find(row => row.metric === 'baseBrotli').ok, false)
	const { stagesGzip: _omitted, ...fewer } = baseline
	const partial = checkBudget(report, { marginPercent: 3, baseline: fewer })
	assert.deepEqual(partial.unbudgeted, ['stagesGzip'])
	assert.equal(partial.ok, false)
	assert.equal(checkBudget(report, { marginPercent: 3, baseline: { ...baseline, madeUp: 5 } }).ok, false)
})
