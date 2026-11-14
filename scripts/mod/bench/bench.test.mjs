import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseArgs, selectConfigs } from '../commands/bench.mjs'
import { areaTriangles, CONTRAPTION_TRIANGLES, evaluate } from './evaluate.mjs'
import { cellTriangles, parseGlb, readAccessor } from './glb-cells.mjs'
import { compare, reportHtml } from './report.mjs'
import {
	benchHome,
	disableAfk,
	driverPlan,
	failureCause,
	fetchMod,
	gameCommand,
	launcherVersion,
	minemoriesJar,
	primaryFile,
} from './runner.mjs'

/** Tuples written `size` bytes per number, `stride` bytes per tuple. */
function packed(tuples, size, stride, write) {
	const bytes = Buffer.alloc(tuples.length * stride)
	for (const [i, tuple] of tuples.entries())
		for (const [k, value] of tuple.entries()) write(bytes, value, i * stride + k * size)
	return bytes
}

/**
 * A GLB with one node: `positions` as float32 VEC3 (or int16 when `quantized`), `indices` as uint16, and optional
 * float32 `uvs`.
 */
function makeGlb({ positions, indices, uvs, quantized = false, scale, translation, mode, name = 'terrain', stride }) {
	const positionBytes = quantized
		? packed(positions, 2, stride ?? 6, (bytes, value, at) => bytes.writeInt16LE(value, at))
		: packed(positions, 4, stride ?? 12, (bytes, value, at) => bytes.writeFloatLE(value, at))
	const indexBytes = packed(
		indices.map(value => [value]),
		2,
		2,
		(bytes, value, at) => bytes.writeUInt16LE(value, at)
	)
	const indexPadding = Buffer.alloc((4 - (indexBytes.length % 4)) % 4)
	const uvBytes = packed(uvs ?? [], 4, 8, (bytes, value, at) => bytes.writeFloatLE(value, at))
	const bin = Buffer.concat([positionBytes, indexBytes, indexPadding, uvBytes])
	const uvOffset = positionBytes.length + indexBytes.length + indexPadding.length
	const json = {
		asset: { version: '2.0' },
		buffers: [{ byteLength: bin.length }],
		bufferViews: [
			{ buffer: 0, byteOffset: 0, byteLength: positionBytes.length, ...(stride ? { byteStride: stride } : {}) },
			{ buffer: 0, byteOffset: positionBytes.length, byteLength: indexBytes.length },
			{ buffer: 0, byteOffset: uvOffset, byteLength: uvBytes.length },
		],
		accessors: [
			{ bufferView: 0, componentType: quantized ? 5122 : 5126, count: positions.length, type: 'VEC3' },
			{ bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
			{ bufferView: 2, componentType: 5126, count: uvs?.length ?? 0, type: 'VEC2' },
		],
		meshes: [
			{
				primitives: [
					{
						attributes: { POSITION: 0, ...(uvs ? { TEXCOORD_0: 2 } : {}) },
						indices: 1,
						material: 0,
						...(mode == null ? {} : { mode }),
					},
				],
			},
		],
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
	assert.deepEqual(cells.get('0,0,0'), { triangles: 2, duplicates: 0, overlaps: 0, categories: { terrain: 2 } })
	// The same face turned down covers the block above.
	const down = cellTriangles(parseGlb(makeGlb({ positions: TOP, indices: [0, 2, 1, 0, 3, 2] })), ORIGIN)
	assert.deepEqual([...down.keys()], ['0,1,0'])
})

test('a face drawn twice counts as duplicated; its back face does not', () => {
	// Same corners, same texture coordinates: drawn twice. Another texture on the same face: a layer (an overlay).
	const quad = [...TOP, ...TOP]
	const uvs = [
		[0, 0],
		[0, 1],
		[1, 1],
		[1, 0],
		[0.5, 0],
		[0.5, 1],
		[1, 1],
		[1, 0],
	]
	const layered = cellTriangles(
		parseGlb(makeGlb({ positions: quad, uvs, indices: [0, 1, 2, 4, 5, 6, 1, 2, 0] })),
		ORIGIN
	)
	assert.deepEqual(layered.get('0,0,0'), { triangles: 3, duplicates: 1, overlaps: 1, categories: { terrain: 3 } })
	const material = parseGlb(makeGlb({ positions: TOP, indices: [0, 1, 2, 0, 1, 2] }))
	material.json.meshes[0].primitives.push({ ...material.json.meshes[0].primitives[0], material: 1 })
	assert.deepEqual(cellTriangles(material, ORIGIN).get('0,0,0'), {
		triangles: 4,
		duplicates: 2,
		overlaps: 1,
		categories: { terrain: 4 },
	})
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
	const nested = parseGlb(makeGlb({ positions: TOP, indices: [0, 1, 2] }))
	nested.json.nodes[0].rotation = [0, 0, 0, 1]
	assert.equal(cellTriangles(nested, ORIGIN).size, 1)
	for (const change of [
		node => {
			node.rotation = [0, Math.SQRT1_2, 0, Math.SQRT1_2]
		},
		node => {
			node.matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
		},
		node => {
			node.children = [1]
		},
	]) {
		const bad = parseGlb(makeGlb({ positions: TOP, indices: [0, 1, 2] }))
		change(bad.json.nodes[0])
		assert.throws(() => cellTriangles(bad, ORIGIN), /rotated or nested/)
	}
	const child = parseGlb(makeGlb({ positions: TOP, indices: [0, 1, 2] }))
	child.json.nodes[1].children = [0]
	assert.throws(() => cellTriangles(child, ORIGIN), /Node terrain is rotated or nested/)
})

const cell = (triangles, duplicates = 0, categories = { decor: triangles }, overlaps = 0) => ({
	triangles,
	duplicates,
	overlaps,
	categories,
})

test('each block gets a verdict from the geometry in its area', () => {
	const cells = new Map([
		['0,0,0', cell(10)],
		['1,1,0', cell(4, 2, { block_entities: 4 }, 1)],
		['8,0,0', cell(12)],
		// The contraption's wool cube turned a little: its 12 triangles over three cells.
		['20,1,20', cell(8, 0, { entities: 8 })],
		['21,1,20', cell(2, 0, { entities: 2 })],
		['20,1,19', { triangles: 2, duplicates: 0, categories: { entities: 2 } }],
		['20,2,20', cell(5)],
	])
	assert.deepEqual(areaTriangles(cells, 0, 0, 0), {
		triangles: 14,
		duplicates: 2,
		overlaps: 1,
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
	assert.deepEqual(result.contraption, {
		entities: 1,
		expected: CONTRAPTION_TRIANGLES,
		triangles: 12,
		duplicates: 0,
		overlaps: 0,
		categories: { entities: 12 },
		status: 'ok',
	})
	const status = (contraption, extra = {}) =>
		evaluate({ ...placed, contraption, ...extra }, new Map([...cells, ['30,0,30', cell(24)], ['40,0,40', cell(6)]]))
			.contraption.status
	assert.equal(status(placed.contraption, { contraptions: 0 }), 'unassembled')
	assert.equal(status({ x: 50, y: 0, z: 0 }), 'missing')
	assert.equal(status({ x: 1, y: 1, z: 0 }), 'doubled')
	assert.equal(status({ x: 30, y: 0, z: 30 }), 'doubled')
	assert.equal(status({ x: 40, y: 0, z: 40 }), 'partial')
	assert.equal(evaluate({ cells: [] }, cells).contraption, null)
})

test('the report puts problems first and marks blocks that differ between configurations', () => {
	const results = [
		{
			config: { id: 'one' },
			renderer: 'llvmpipe',
			summary: { blocks: 2, ok: 1, missing: 1, doubled: 0, unplaced: 0 },
			mods: { minemories: '0.38.3-beta.1' },
			contraption: { status: 'ok', triangles: 12, expected: 12 },
			rows: [
				{ id: 'm:wheel', status: 'missing', triangles: 0, duplicates: 0, categories: {} },
				{ id: 'm:<b>', status: 'ok', triangles: 12, duplicates: 0, categories: { decor: 12 } },
				{ id: 'm:gear', status: 'ok', triangles: 100, duplicates: 0, overlaps: 3, categories: { decor: 100 } },
				{ id: 'm:pipe', status: 'ok', triangles: 30, duplicates: 0, categories: { decor: 30 } },
			],
		},
		{
			config: { id: 'two' },
			summary: { blocks: 2, ok: 1, missing: 0, doubled: 1, unplaced: 0 },
			rows: [
				{ id: 'm:wheel', status: 'doubled', triangles: 40, duplicates: 20, categories: { block_entities: 40 } },
				{ id: 'm:only', status: 'unplaced', actual: 'minecraft:air' },
				{ id: 'm:gear', status: 'ok', triangles: 30, duplicates: 0, categories: { decor: 30 } },
				{ id: 'm:pipe', status: 'ok', triangles: 50, duplicates: 0, categories: { decor: 50 } },
			],
		},
		{ config: { id: 'three' }, error: 'Exception in world tick: <NPE>' },
	]
	const rows = compare(results)
	assert.deepEqual(
		rows.map(row => [row.id, row.differs, row.cells.map(c => c.status).join('/')]),
		[
			['m:wheel', true, 'missing/doubled'],
			['m:only', false, 'absent/unplaced'],
			['m:gear', true, 'ok/ok'],
			['m:<b>', false, 'ok/absent'],
			['m:pipe', false, 'ok/ok'],
		]
	)
	const html = reportHtml(results, { generatedAt: 'now' })
	assert.match(
		html,
		/<li><strong>one<\/strong>: 2 blocks, 1 ok, 1 missing, 0 doubled, 0 not placed · contraption ok \(12\/12 triangles\) · Minemories 0\.38\.3-beta\.1<\/li>/
	)
	assert.match(html, /20 twice/)
	assert.match(html, /3 layered/)
	assert.match(html, /<strong>three<\/strong>: failed, Exception in world tick: &lt;NPE&gt;/)
	assert.equal((html.match(/<th><strong>/g) ?? []).length, 2)
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
	// Second time: from the cache, without the network.
	const offline = async () => {
		throw new Error('offline')
	}
	assert.equal(await fetchMod(home, { project: 'p', version: 'v1' }, { fetchImpl: offline }), path)
	assert.equal(calls.length, 2)
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

test('the Minemories JAR is the one of the version the tree declares, never an older build', async () => {
	const root = await mkdtemp(join(tmpdir(), 'bench-root-'))
	await mkdir(join(root, 'mod', '1.21.1'), { recursive: true })
	await writeFile(join(root, 'mod', '1.21.1', 'gradle.properties'), 'mod_version=0.38.10-beta.1\n')
	await Promise.all(
		['0.38.9-beta.1', '0.38.10-beta.1'].map(async version => {
			const dir = join(root, 'build', 'mod-dist', version, 'fabric-mc1.20.1')
			await mkdir(dir, { recursive: true })
			await writeFile(join(dir, `minemories-${version}.jar`), '')
		})
	)
	assert.match(
		await minemoriesJar(root, 'fabric-mc1.20.1'),
		/0\.38\.10-beta\.1\/fabric-mc1\.20\.1\/minemories-0\.38\.10/
	)
	await writeFile(join(root, 'mod', '1.21.1', 'gradle.properties'), 'mod_version=0.39.0-beta.1\n')
	await assert.rejects(minemoriesJar(root, 'fabric-mc1.20.1'), /No fabric-mc1\.20\.1 JAR for 0\.39\.0-beta\.1/)
})

test('AFK captures are turned off in the game folder, other settings kept', async () => {
	const game = await mkdtemp(join(tmpdir(), 'bench-game-'))
	await disableAfk(game)
	const path = join(game, 'config', 'minemories.properties')
	assert.equal(await readFile(path, 'utf8'), 'afkSnapshots=false\n')
	await writeFile(path, '# comment\nafkSnapshots = true\nexportFolder=/x\n')
	await disableAfk(game)
	assert.equal(await readFile(path, 'utf8'), '# comment\nexportFolder=/x\nafkSnapshots=false\n')
})

test('a game that stopped early says why', () => {
	assert.equal(
		failureCause(
			'[12:00] [Render thread/ERROR]: MINEMORIES-BENCH FAILED\njava.lang.IllegalStateException: too big\n\tat x'
		),
		'java.lang.IllegalStateException: too big'
	)
	assert.equal(
		failureCause(
			'---- Minecraft Crash Report ----\nDescription: Exception ticking world\n\njava.lang.NullPointerException: boom\n'
		),
		'Exception ticking world: java.lang.NullPointerException: boom'
	)
	assert.equal(failureCause('Description: Watchdog\n'), 'Watchdog')
	assert.equal(
		failureCause('[1] [main/INFO]: a\n[2] [Server thread/ERROR]: first\n[3] [Render thread/ERROR]: last\n'),
		'[3] [Render thread/ERROR]: last'
	)
	assert.equal(failureCause(''), 'The game ended before the export (see game.log)')
})
