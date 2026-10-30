import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { MeshoptEncoder } from 'meshoptimizer'
import { diffOutputs, main } from './cli.mjs'
import { syntheticGlb } from './synthetic.mjs'

const NAMES = ['S0', 'S1', 'S2', 'S3', 'S4', 'personnages']

async function workspace(t) {
	await MeshoptEncoder.ready
	const dir = await mkdtemp(join(tmpdir(), 'hero-assets-'))
	t.after(() => rm(dir, { recursive: true, force: true }))
	const src = join(dir, 'captures')
	await mkdir(src)
	await Promise.all(
		NAMES.map((name, index) =>
			writeFile(join(src, `${name}.glb`), syntheticGlb({ MeshoptEncoder }, { cells: 80 - index * 3, tint: index }))
		)
	)
	const budget = join(dir, 'budget.json')
	await writeFile(budget, JSON.stringify({ marginPercent: 3, baseline: { baseBrotli: 1 } }))
	return { dir, src, out: join(dir, 'out'), budget }
}

test('generate, check, detect a stale or tampered output, and enforce the budget', async t => {
	const lines = []
	t.mock.method(console, 'log', (...args) => lines.push(args.join(' ')))
	const { src, out, budget } = await workspace(t)
	const args = ['--src', src, '--out', out, '--budget', budget]
	assert.equal(await main([...args]), 1, 'generation refuses to ship when the budget is exceeded')
	assert.equal(await main([...args, '--update-budget']), 0)
	assert.ok(JSON.parse(await readFile(budget, 'utf8')).baseline.stagesBrotli > 1)
	assert.equal(await main([...args, '--check']), 0, 'no output folder yet: nothing to compare, budget fine')
	assert.equal(await main([...args]), 0)
	const files = await readdir(out)
	assert.ok(files.includes('manifest.json') && files.includes('report.json'))
	assert.equal(files.filter(name => name.endsWith('.br')).length, NAMES.length)
	assert.equal(await main([...args, '--check']), 0)
	assert.ok(lines.some(line => line.includes('Generated assets match the sources.')))
	await writeFile(join(out, 'stray.txt'), 'x')
	assert.equal(await main([...args, '--check']), 1)
	await rm(join(out, 'stray.txt'))
	const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
	await writeFile(join(out, manifest.files.S2.file), 'tampered')
	assert.equal(await main([...args, '--check']), 1)
	assert.ok(lines.some(line => line.includes('differs from the regenerated file')))
	await rm(join(out, manifest.files.S3.file))
	assert.equal(await main([...args, '--check']), 1)
	assert.ok(lines.some(line => line.includes('missing')))
	await writeFile(
		budget,
		JSON.stringify({
			marginPercent: 3,
			baseline: { baseBrotli: 1, deltasBrotli: 1, stagesBrotli: 1, stagesGzip: 1, charactersBrotli: 1 },
		})
	)
	assert.equal(await main([...args, '--check']), 1)
})

test('precompressed copies are checked by what they decompress to, not by their bytes', async t => {
	t.mock.method(console, 'log', () => undefined)
	const { src, out, budget } = await workspace(t)
	const args = ['--src', src, '--out', out, '--budget', budget]
	await main([...args, '--update-budget'])
	await main([...args])
	const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
	const file = manifest.files.S1.file
	const payload = await readFile(join(out, file))
	await writeFile(
		join(out, `${file}.br`),
		brotliCompressSync(payload, { params: { [constants.BROTLI_PARAM_QUALITY]: 1 } })
	)
	await writeFile(join(out, `${file}.gz`), gzipSync(payload, { level: 1 }))
	assert.equal(await main([...args, '--check']), 0, 'other compression levels of the same payload are fine')
	await writeFile(join(out, `${file}.gz`), gzipSync(Buffer.from('another payload')))
	assert.equal(await main([...args, '--check']), 1)
	await writeFile(join(out, `${file}.gz`), gzipSync(payload))
	await writeFile(join(out, `${file}.br`), Buffer.from('not brotli at all'))
	assert.equal(await main([...args, '--check']), 1)
})

test('the inventory mode only reads the raw captures', async t => {
	const lines = []
	t.mock.method(console, 'log', (...args) => lines.push(args.join(' ')))
	const { src, out, budget } = await workspace(t)
	assert.equal(await main(['--inventory', '--src', src, '--out', out, '--budget', budget]), 0)
	const inventory = JSON.parse(lines.join('\n'))
	assert.deepEqual(Object.keys(inventory.captures), NAMES)
	assert.equal(await readdir(out).catch(() => 'absent'), 'absent')
})

test('diffOutputs compares by content and reports a missing folder as null', async t => {
	const dir = await mkdtemp(join(tmpdir(), 'hero-diff-'))
	t.after(() => rm(dir, { recursive: true, force: true }))
	assert.equal(await diffOutputs(new Map(), join(dir, 'nothing')), null)
	await writeFile(join(dir, 'a.txt'), 'same')
	assert.deepEqual(await diffOutputs(new Map([['a.txt', new TextEncoder().encode('same')]]), dir), [])
})
