import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseArgs, selectConfigs } from '../commands/bench.mjs'
import { areaTriangles, evaluate } from './evaluate.mjs'
import { cellTriangles, parseGlb, readAccessor } from './glb-cells.mjs'
import { compare, reportHtml } from './report.mjs'
import { benchHome, driverPlan, fetchMod, gameCommand, launcherVersion, primaryFile } from './runner.mjs'

/** A GLB with one node: `positions` as float32 VEC3 (or int16 when `quantized`), `indices` as uint16. */
function makeGlb({ positions, indices, quantized = false, scale, translation, mode, name = 'terrain', stride }) {
	const componentSize = quantized ? 2 : 4
	const tuple = stride ?? componentSize * 3
	const positionBytes = Buffer.alloc(positions.length * tuple)
	for (const [i, point] of positions.entries())
		for (const [k, value] of point.entries()) {
			if (quantized) positionBytes.writeInt16LE(value, i * tuple + k * 2)
			else positionBytes.writeFloatLE(value, i * tuple + k * 4)
		}
	const indexBytes = Buffer.alloc(indices.length * 2)
	for (const [i, value] of indices.entries()) indexBytes.writeUInt16LE(value, i * 2)
	const bin = Buffer.concat([
		positionBytes,
		indexBytes,
		Buffer.alloc((4 - ((positionBytes.length + indexBytes.length) % 4)) % 4),
	])
	const json = {
		asset: { version: '2.0' },
		buffers: [{ byteLength: bin.length }],
		bufferViews: [
			{ buffer: 0, byteOffset: 0, byteLength: positionBytes.length, ...(stride ? { byteStride: stride } : {}) },
			{ buffer: 0, byteOffset: positionBytes.length, byteLength: indexBytes.length },
		],
		accessors: [
			{ bufferView: 0, componentType: quantized ? 5122 : 5126, count: positions.length, type: 'VEC3' },
			{ bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
		],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, ...(mode == null ? {} : { mode }) }] }],
		nodes: [{ name, mesh: 0, ...(scale ? { scale } : {}), ...(translation ? { translation } : {}) }, { name: 'empty' }],
	}
	let text = Buffer.from(JSON.stringify(json))
	text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)])
	const header = Buffer.alloc(12)
	header.writeUInt32LE(0x46546c67, 0)
	header.writeUInt32LE(2, 4)
	header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8)
	const chunk = (type, data) => {
		const head = Buffer.alloc(8)
		head.writeUInt32LE(data.length, 0)
		head.writeUInt32LE(type, 4)
		return Buffer.concat([head, data])
	}
	return new Uint8Array(Buffer.concat([header, chunk(0x4e4f534a, text), chunk(0x004e4942, bin)]))
}

const ORIGIN = { x: 0, y: 0, z: 0 }
// The top face of the unit cube at (0, 0, 0), front up (counter-clockwise seen from above).
const TOP = [
	[0, 1, 0],
	[0, 1, 1],
	[1, 1, 1],
	[1, 1, 0],
]

test('a face on a block boundary belongs to the block it covers, not the one beyond it', () => {
	const glb = parseGlb(makeGlb({ positions: TOP, indices: [0, 1, 2, 0, 2, 3] }))
	const cells = cellTriangles(glb, ORIGIN)
	assert.deepEqual([...cells.keys()], ['0,0,0'])
	assert.deepEqual(cells.get('0,0,0'), { triangles: 2, duplicates: 0, categories: { terrain: 2 } })
	// The same face turned down covers the block above.
	const down = cellTriangles(parseGlb(makeGlb({ positions: TOP, indices: [0, 2, 1, 0, 3, 2] })), ORIGIN)
	assert.deepEqual([...down.keys()], ['0,1,0'])
})

test('a face drawn twice counts as duplicated; its back face does not', () => {
	const twice = cellTriangles(parseGlb(makeGlb({ positions: TOP, indices: [0, 1, 2, 1, 2, 0] })), ORIGIN)
	assert.equal(twice.get('0,0,0').duplicates, 1)
	const back = parseGlb(makeGlb({ positions: TOP, indices: [0, 1, 2, 0, 2, 1] }))
	const cells = cellTriangles(back, ORIGIN)
	assert.equal(
		[...cells.values()].reduce((sum, cell) => sum + cell.duplicates, 0),
		0
	)
})

test('quantized positions follow the node scale, translation and the capture origin', () => {
	const positions = TOP.map(point => point.map(value => value * 128))
	const glb = parseGlb(
		makeGlb({
			positions,
			indices: [0, 1, 2],
			quantized: true,
			scale: [1 / 128, 1 / 128, 1 / 128],
			translation: [0, -5, 0],
			stride: 8,
		})
	)
	assert.deepEqual(readAccessor(glb, 0)[2], [128, 128, 128])
	const cells = cellTriangles(glb, { x: 10, y: 3, z: -2 })
	assert.deepEqual([...cells.keys()], ['10,-2,-2'])
	// Normalized accessors are scaled to [-1, 1].
	glb.json.accessors[0].normalized = true
	assert.equal(readAccessor(glb, 0)[1][2], 128 / 32767)
})

test('lines and primitives without positions are ignored; broken files are refused', () => {
	assert.equal(cellTriangles(parseGlb(makeGlb({ positions: TOP, indices: [0, 1, 2], mode: 1 })), ORIGIN).size, 0)
	const glb = parseGlb(makeGlb({ positions: TOP, indices: [0, 1, 2] }))
	glb.json.meshes[0].primitives[0].attributes = {}
	assert.equal(cellTriangles(glb, ORIGIN).size, 0)
	const unindexed = parseGlb(makeGlb({ positions: TOP.slice(0, 3), indices: [] }))
	delete unindexed.json.meshes[0].primitives[0].indices
	assert.equal(cellTriangles(unindexed, ORIGIN).get('0,0,0').triangles, 1)
	assert.throws(() => parseGlb(new Uint8Array(30)), /Not a GLB/)
	const noJson = makeGlb({ positions: TOP, indices: [0, 1, 2] })
	noJson.set([0, 0, 0, 0], 16)
	assert.throws(() => parseGlb(noJson), /without a JSON chunk/)
	glb.json.accessors[0].componentType = 9999
	assert.throws(() => readAccessor(glb, 0), /component type/)
	glb.json.accessors[0].componentType = 5126
	glb.json.accessors[0].type = 'MAT4'
	assert.throws(() => readAccessor(glb, 0), /accessor type/)
})

const cell = (triangles, duplicates = 0, categories = { decor: triangles }) => ({ triangles, duplicates, categories })

test('each block gets a verdict from the geometry in its area', () => {
	const cells = new Map([
		['0,0,0', cell(10)],
		['1,1,0', cell(4, 2, { block_entities: 4 })],
		['8,0,0', cell(12)],
		['20,1,20', cell(6)],
	])
	assert.deepEqual(areaTriangles(cells, 0, 0, 0), {
		triangles: 14,
		duplicates: 2,
		categories: { decor: 10, block_entities: 4 },
	})
	const placed = {
		spacing: 4,
		cells: [
			{ id: 'a:ok', x: 8, y: 0, z: 0, actual: 'a:ok' },
			{ id: 'a:twice', x: 0, y: 0, z: 0, actual: 'a:twice' },
			{ id: 'a:gone', x: 4, y: 0, z: 0, actual: 'a:gone' },
			{ id: 'a:ghost', x: 4, y: 0, z: 4, actual: 'a:ghost' },
			{ id: 'a:plant', x: 12, y: 0, z: 0, actual: 'minecraft:air' },
		],
		contraptions: 1,
		contraption: { x: 20, y: 1, z: 20 },
	}
	const result = evaluate(placed, cells, { drawsNothing: ['a:ghost'] })
	assert.deepEqual(
		result.rows.map(row => [row.id, row.status]),
		[
			['a:ok', 'ok'],
			['a:twice', 'doubled'],
			['a:gone', 'missing'],
			['a:ghost', 'ok'],
			['a:plant', 'unplaced'],
		]
	)
	assert.deepEqual(result.summary, { blocks: 5, ok: 2, missing: 1, doubled: 1, unplaced: 1 })
	assert.equal(result.contraption.status, 'ok')
	assert.equal(evaluate({ ...placed, contraptions: 0 }, cells).contraption.status, 'unassembled')
	assert.equal(evaluate({ ...placed, contraption: { x: 50, y: 0, z: 0 } }, cells).contraption.status, 'missing')
	assert.equal(evaluate({ ...placed, contraption: { x: 1, y: 1, z: 0 } }, cells).contraption.status, 'doubled')
	assert.equal(evaluate({ cells: [] }, cells).contraption, null)
})

test('the report puts problems first and marks blocks that differ between configurations', () => {
	const results = [
		{
			config: { id: 'one' },
			renderer: 'llvmpipe',
			summary: { blocks: 2, ok: 1, missing: 1, doubled: 0, unplaced: 0 },
			contraption: { status: 'ok' },
			rows: [
				{ id: 'm:wheel', status: 'missing', triangles: 0, duplicates: 0, categories: {} },
				{ id: 'm:<b>', status: 'ok', triangles: 12, duplicates: 0, categories: { decor: 12 } },
			],
		},
		{
			config: { id: 'two' },
			summary: { blocks: 2, ok: 1, missing: 0, doubled: 1, unplaced: 0 },
			rows: [
				{ id: 'm:wheel', status: 'doubled', triangles: 40, duplicates: 20, categories: { block_entities: 40 } },
				{ id: 'm:only', status: 'unplaced', actual: 'minecraft:air' },
			],
		},
	]
	const rows = compare(results)
	assert.deepEqual(
		rows.map(row => [row.id, row.differs, row.cells.map(c => c.status).join('/')]),
		[
			['m:wheel', true, 'missing/doubled'],
			['m:only', false, 'absent/unplaced'],
			['m:<b>', false, 'ok/absent'],
		]
	)
	const html = reportHtml(results, { generatedAt: 'now' })
	assert.match(
		html,
		/<li><strong>one<\/strong>: 2 blocks, 1 ok, 1 missing, 0 doubled, 0 not placed · contraption ok<\/li>/
	)
	assert.match(html, /20 twice/)
	assert.match(html, /renderer unknown/)
	assert.match(html, /m:&lt;b&gt;/)
	assert.match(html, /class="differs"/)
})

test('the game runs from the launcher, headless unless local, with the plan and an isolated home', () => {
	const config = { loader: 'fabric', minecraft: '1.20.1', loaderVersion: '0.17.2' }
	assert.equal(launcherVersion(config), 'fabric:1.20.1:0.17.2')
	const options = {
		config,
		launcher: '/l/portablemc',
		launcherDir: '/l/pmc',
		gameDir: '/g',
		java: '/j/java',
		plan: '/g/plan.json',
	}
	const headless = gameCommand(options)
	assert.equal(headless.command, 'xvfb-run')
	assert.equal(headless.args[3], '/l/portablemc')
	assert.ok(headless.args.includes('--jvm-arg=-Dminemories.bench=/g/plan.json'))
	assert.ok(headless.args.includes('--jvm-arg=-Duser.home=/g'))
	const local = gameCommand({ ...options, local: true, memoryMb: 1024 })
	assert.equal(local.command, '/l/portablemc')
	assert.ok(local.args.includes('--jvm-arg=-Xmx1024m'))
	assert.equal(benchHome({ MINEMORIES_BENCH_HOME: '/b' }), '/b')
	assert.match(benchHome({}), /minemories-bench$/)
	assert.deepEqual(driverPlan({ plan: { namespaces: ['x'], exclude: { 'x:a': 'why' } } }), {
		namespaces: ['x'],
		exclude: ['x:a'],
	})
	assert.deepEqual(driverPlan({ plan: { exclude: ['x:b'] } }), { exclude: ['x:b'] })
})

test('pinned Modrinth files are downloaded once and checked against their SHA-512', async () => {
	const home = await mkdtemp(join(tmpdir(), 'bench-'))
	const bytes = Buffer.from('jar bytes')
	const sha512 = createHash('sha512').update(bytes).digest('hex')
	const calls = []
	const version = {
		id: 'v1',
		files: [{ filename: 'mod.jar', url: 'https://cdn/mod.jar', primary: true, hashes: { sha512 } }],
	}
	const fetchImpl = async url => {
		calls.push(url)
		if (url.includes('/version/')) return { ok: true, json: async () => version }
		return { ok: true, arrayBuffer: async () => bytes }
	}
	const path = await fetchMod(home, { project: 'p', version: 'v1' }, { fetchImpl })
	assert.deepEqual(await readFile(path), bytes)
	await fetchMod(home, { project: 'p', version: 'v1' }, { fetchImpl })
	assert.equal(calls.filter(url => url === 'https://cdn/mod.jar').length, 1)
	const bad = { ...version, files: [{ ...version.files[0], filename: 'bad.jar', hashes: { sha512: 'nope' } }] }
	await assert.rejects(
		fetchMod(
			home,
			{ project: 'p', version: 'v2' },
			{
				fetchImpl: async url =>
					url.includes('/version/')
						? { ok: true, json: async () => bad }
						: { ok: true, arrayBuffer: async () => bytes },
			}
		),
		/SHA-512 mismatch/
	)
	const fresh = { ...version, files: [{ ...version.files[0], filename: 'fresh.jar' }] }
	await assert.rejects(
		fetchMod(home, { project: 'p', version: 'v3' }, { fetchImpl: async () => ({ ok: false, status: 404 }) }),
		/HTTP 404/
	)
	await assert.rejects(
		fetchMod(
			home,
			{ project: 'p', version: 'v4' },
			{
				fetchImpl: async url =>
					url.includes('/version/') ? { ok: true, json: async () => fresh } : { ok: false, status: 503 },
			}
		),
		/HTTP 503/
	)
	assert.equal(primaryFile({ id: 'x', files: [{ filename: 'a' }, { filename: 'b', primary: true }] }).filename, 'b')
	assert.equal(primaryFile({ id: 'x', files: [{ filename: 'a' }] }).filename, 'a')
	assert.throws(() => primaryFile({ id: 'x', files: [] }), /has no file/)
})

test('the command line selects configurations by id, all of them, or lists them', () => {
	assert.deepEqual(parseArgs(['a', '--local']), { ids: ['a'], all: false, local: true, list: false })
	const configs = [{ id: 'a' }, { id: 'b' }]
	assert.deepEqual(selectConfigs(configs, { ids: ['b'], all: false }), [{ id: 'b' }])
	assert.equal(selectConfigs(configs, { ids: [], all: true }).length, 2)
	assert.throws(() => selectConfigs(configs, { ids: ['z'], all: false }), /Unknown bench configuration: z/)
})
