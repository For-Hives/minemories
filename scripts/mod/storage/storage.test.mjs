import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createFakeClient } from '@minemories/mod-storage/fake-client'
import storage, { formatBytes, parsePruneArgs } from '../commands/storage.mjs'
import {
	emptyIndex,
	latestKey,
	pruneStorage,
	readIndex,
	setPinned,
	setPublished,
	storageReport,
	storeRelease,
	validateIndex,
	versionKey,
} from './index.mjs'

const config = {
	targets: [
		{ id: 'neoforge-mc1.21.1', loader: 'neoforge', minecraft: '1.21.1', loaderVersion: '21.1.248', java: '21' },
		{
			id: 'fabric-mc1.21.1',
			loader: 'fabric',
			minecraft: '1.21.1',
			loaderVersion: '0.19.5',
			java: '21',
			fabricApi: '0.116.17+1.21.1',
		},
	],
}
const env = { MOD_STORAGE_BUCKET: 'test-mods' }
const has = text => error => error.message.includes(text)

async function artifact(targetId, content, { sidecars = true } = {}) {
	const dir = await mkdtemp(join(tmpdir(), 'mm-storage-'))
	await mkdir(dir, { recursive: true })
	const file = join(dir, `built-${targetId}.jar`)
	const body = Buffer.from(content)
	await writeFile(file, body)
	if (sidecars) {
		await writeFile(`${file}.sha256`, 'sum\n')
		await writeFile(join(dir, 'manifest.json'), '{}')
	}
	return { targetId, file, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') }
}
const release = (client, version, builtAt, artifacts, extra = {}) =>
	storeRelease({ config, version, commit: 'abc1234', builtAt, artifacts, env, client, ...extra })

test('stores a jar, its sidecar files, the latest copy and a valid index', async () => {
	const client = createFakeClient()
	const jar = await artifact('neoforge-mc1.21.1', 'jar-1')
	const { index } = await release(client, '0.1.0', '2026-10-01T00:00:00Z', [jar])
	const key = 'mods/neoforge-mc1.21.1/0.1.0/minemories-neoforge-mc1.21.1-0.1.0.jar'
	assert.equal(versionKey('neoforge-mc1.21.1', '0.1.0'), key)
	assert.ok(client.objects.has(key))
	assert.ok(client.objects.has(`${key}.sha256`))
	assert.ok(client.objects.has('mods/neoforge-mc1.21.1/0.1.0/manifest.json'))
	assert.equal(client.sha256(latestKey('neoforge-mc1.21.1')), jar.sha256)
	const target = index.targets['neoforge-mc1.21.1']
	assert.deepEqual(
		{
			loader: target.loader,
			minecraft: target.minecraft,
			loaderVersion: target.loaderVersion,
			java: target.java,
			latest: target.latest,
		},
		{ loader: 'neoforge', minecraft: '1.21.1', loaderVersion: '21.1.248', java: '21', latest: '0.1.0' }
	)
	assert.equal(target.versions[0].sha256, jar.sha256)
	assert.equal(target.versions[0].key, key)
	assert.deepEqual(await readIndex({ env, client }), index)
	validateIndex(index)
})

test('a file built without sidecar files is accepted and fabricApi is copied over', async () => {
	const client = createFakeClient()
	const jar = await artifact('fabric-mc1.21.1', 'fab', { sidecars: false })
	const { index } = await release(client, '0.1.0', '2026-10-01T00:00:00Z', [jar])
	assert.equal(index.targets['fabric-mc1.21.1'].fabricApi, '0.116.17+1.21.1')
	assert.equal([...client.objects.keys()].filter(key => key.endsWith('manifest.json')).length, 0)
})

test('the index is written last, after the objects and the latest copies', async () => {
	const client = createFakeClient()
	await release(client, '0.1.0', '2026-10-01T00:00:00Z', [await artifact('neoforge-mc1.21.1', 'a')])
	const writes = client.calls.filter(call => ['PutObjectCommand', 'CopyObjectCommand'].includes(call.type))
	assert.equal(writes.at(-1).input.Key, 'index.json')
	assert.equal(writes.filter(call => call.input.Key === 'index.json').length, 1)
})

test('storing the same version twice is idempotent', async () => {
	const client = createFakeClient()
	const jar = await artifact('neoforge-mc1.21.1', 'same')
	await release(client, '0.1.0', '2026-10-01T00:00:00Z', [jar])
	const keys = [...client.objects.keys()].sort()
	const puts = client.calls.filter(call => call.type === 'PutObjectCommand' && call.input.Key.endsWith('.jar')).length
	const { index } = await release(client, '0.1.0', '2026-10-01T00:00:00Z', [jar])
	assert.deepEqual([...client.objects.keys()].sort(), keys)
	assert.equal(index.targets['neoforge-mc1.21.1'].versions.length, 1)
	assert.equal(
		client.calls.filter(call => call.type === 'PutObjectCommand' && call.input.Key.endsWith('.jar')).length,
		puts
	)
})

test('a version rebuilt with different content is replaced, keeping pinning and publication', async () => {
	const client = createFakeClient()
	await release(client, '0.1.0', '2026-10-01T00:00:00Z', [await artifact('neoforge-mc1.21.1', 'one')])
	await setPinned({ targetId: 'neoforge-mc1.21.1', version: '0.1.0', pinned: true, env, client })
	await setPublished({
		targetId: 'neoforge-mc1.21.1',
		version: '0.1.0',
		links: { modrinth: 'https://m/1' },
		env,
		client,
	})
	const rebuilt = await artifact('neoforge-mc1.21.1', 'two')
	const { index } = await release(client, '0.1.0', '2026-10-01T00:00:00Z', [rebuilt])
	const [entry] = index.targets['neoforge-mc1.21.1'].versions
	assert.equal(entry.sha256, rebuilt.sha256)
	assert.equal(entry.pinned, true)
	assert.deepEqual(entry.published, { modrinth: 'https://m/1' })
})

test('versions are sorted newest first and latest follows', async () => {
	const client = createFakeClient()
	await release(client, '0.2.0', '2026-10-02T00:00:00Z', [await artifact('neoforge-mc1.21.1', 'b')])
	const { index } = await release(client, '0.1.0', '2026-10-01T00:00:00Z', [await artifact('neoforge-mc1.21.1', 'a')])
	const target = index.targets['neoforge-mc1.21.1']
	assert.deepEqual(
		target.versions.map(item => item.version),
		['0.2.0', '0.1.0']
	)
	assert.equal(target.latest, '0.2.0')
	assert.equal(client.sha256(latestKey('neoforge-mc1.21.1')), client.sha256(versionKey('neoforge-mc1.21.1', '0.2.0')))
	const tie = await release(client, '0.10.0', '2026-10-02T00:00:00Z', [await artifact('neoforge-mc1.21.1', 'c')])
	assert.equal(tie.index.targets['neoforge-mc1.21.1'].latest, '0.10.0')
})

test('large files go through a multipart upload and are verified', async () => {
	const client = createFakeClient()
	const jar = await artifact('neoforge-mc1.21.1', 'x'.repeat(25))
	await release(client, '0.1.0', '2026-10-01T00:00:00Z', [jar], { partSize: 10 })
	assert.equal(client.calls.filter(call => call.type === 'UploadPartCommand').length, 3)
	assert.equal(client.sha256(versionKey('neoforge-mc1.21.1', '0.1.0')), jar.sha256)
	assert.equal(client.uploads.size, 0)
})

test('a failure during the upload leaves the index intact and aborts the multipart upload', async () => {
	const client = createFakeClient()
	const first = await artifact('neoforge-mc1.21.1', 'ok')
	const { index: before } = await release(client, '0.1.0', '2026-10-01T00:00:00Z', [first])
	const wrapped = {
		...client,
		send: command =>
			command.constructor.name === 'UploadPartCommand'
				? Promise.reject(new Error('connection cut'))
				: client.send(command),
	}
	await assert.rejects(
		release(wrapped, '0.2.0', '2026-10-02T00:00:00Z', [await artifact('neoforge-mc1.21.1', 'y'.repeat(25))], {
			partSize: 10,
		}),
		has('connection cut')
	)
	assert.deepEqual(await readIndex({ env, client }), before)
	assert.equal(client.uploads.size, 0)
})

test('a failure on the 2nd target never writes the index', async () => {
	const client = createFakeClient({
		failOn: (type, input) => type === 'PutObjectCommand' && input.Key.includes('fabric-mc1.21.1/0.1.0/minemories'),
	})
	await assert.rejects(
		release(client, '0.1.0', '2026-10-01T00:00:00Z', [
			await artifact('neoforge-mc1.21.1', 'a'),
			await artifact('fabric-mc1.21.1', 'b'),
		]),
		has('simulated failure')
	)
	assert.equal(client.objects.has('index.json'), false)
})

test('the sha256 check after upload detects a corrupted object', async () => {
	const client = createFakeClient()
	const corrupting = {
		...client,
		send: async command => {
			const result = await client.send(command)
			if (command.constructor.name === 'PutObjectCommand' && command.input.Key.endsWith('.jar'))
				client.objects.get(command.input.Key).body = Buffer.from('corrupted')
			return result
		},
	}
	await assert.rejects(
		release(corrupting, '0.1.0', '2026-10-01T00:00:00Z', [await artifact('neoforge-mc1.21.1', 'abc')]),
		has('sha256 verification failed')
	)
	assert.equal(client.objects.has('index.json'), false)
})

test('rejects an artifact whose sha256 or size does not match, and dangerous identifiers', async () => {
	const client = createFakeClient()
	const jar = await artifact('neoforge-mc1.21.1', 'abc')
	await assert.rejects(
		release(client, '0.1.0', '2026-10-01T00:00:00Z', [{ ...jar, sha256: 'a'.repeat(64) }]),
		has('Unexpected sha256')
	)
	await assert.rejects(
		release(client, '0.1.0', '2026-10-01T00:00:00Z', [{ ...jar, bytes: 99 }]),
		has('Unexpected size')
	)
	await assert.rejects(release(client, '../x', '2026-10-01T00:00:00Z', [jar]), has('is invalid'))
	await assert.rejects(
		release(client, '0.1.0', '2026-10-01T00:00:00Z', [{ ...jar, targetId: '../../etc' }]),
		has('is invalid')
	)
})

async function populate(client, count = 5) {
	for (let i = 1; i <= count; i += 1)
		await release(client, `0.${i}.0`, `2026-10-0${i}T00:00:00Z`, [await artifact('neoforge-mc1.21.1', `jar-${i}`)])
}

test('retention keeps the 3 newest and is a dry run by default', async () => {
	const client = createFakeClient()
	await populate(client)
	const dry = await pruneStorage({ env, client })
	assert.deepEqual([...new Set(dry.deleted.map(item => item.version))].sort(), ['0.1.0', '0.2.0'])
	assert.ok(dry.freedBytes > 0)
	assert.ok(client.objects.has(versionKey('neoforge-mc1.21.1', '0.1.0')))
	assert.equal(dry.kept.length, 3)
	assert.equal((await readIndex({ env, client })).targets['neoforge-mc1.21.1'].versions.length, 5)
})

test('prune --yes updates the index before deleting the objects', async () => {
	const client = createFakeClient()
	await populate(client)
	client.calls.length = 0
	const result = await pruneStorage({ keep: 3, dryRun: false, env, client })
	assert.equal(result.deleted.length > 0, true)
	const firstDelete = client.calls.findIndex(call => call.type === 'DeleteObjectCommand')
	const indexWrite = client.calls.findIndex(call => call.type === 'PutObjectCommand' && call.input.Key === 'index.json')
	assert.ok(indexWrite >= 0 && indexWrite < firstDelete)
	const index = await readIndex({ env, client })
	assert.deepEqual(
		index.targets['neoforge-mc1.21.1'].versions.map(item => item.version),
		['0.5.0', '0.4.0', '0.3.0']
	)
	assert.equal(client.objects.has(versionKey('neoforge-mc1.21.1', '0.1.0')), false)
	assert.ok(client.objects.has(latestKey('neoforge-mc1.21.1')))
})

test('pinned, published or latest versions are never deleted', async () => {
	const client = createFakeClient()
	await populate(client)
	await setPinned({ targetId: 'neoforge-mc1.21.1', version: '0.1.0', pinned: true, env, client })
	await setPublished({
		targetId: 'neoforge-mc1.21.1',
		version: '0.2.0',
		links: { curseforge: 'https://c/2' },
		env,
		client,
	})
	const result = await pruneStorage({ keep: 1, dryRun: false, env, client })
	const versions = (await readIndex({ env, client })).targets['neoforge-mc1.21.1'].versions.map(item => item.version)
	assert.deepEqual(versions, ['0.5.0', '0.2.0', '0.1.0'])
	assert.deepEqual(
		result.kept.map(item => item.reason),
		['latest', 'published', 'pinned']
	)
	await setPinned({ targetId: 'neoforge-mc1.21.1', version: '0.1.0', pinned: false, env, client })
	const unpinned = await pruneStorage({ keep: 1, dryRun: true, env, client })
	assert.deepEqual([...new Set(unpinned.deleted.map(item => item.version))], ['0.1.0'])
})

test('prune with nothing to delete does not rewrite the index, and rejects an invalid keep', async () => {
	const client = createFakeClient()
	await populate(client, 2)
	const writes = () =>
		client.calls.filter(call => call.input?.Key === 'index.json' && call.type === 'PutObjectCommand').length
	const before = writes()
	const result = await pruneStorage({ dryRun: false, env, client })
	assert.deepEqual(result.deleted, [])
	assert.equal(writes(), before)
	await assert.rejects(pruneStorage({ keep: 0, env, client }), has('keep'))
})

test('pinning an unknown version fails', async () => {
	const client = createFakeClient()
	await assert.rejects(
		setPinned({ targetId: 'x-mc1', version: '9.9.9', pinned: true, env, client }),
		has('Version not found')
	)
	await assert.rejects(
		setPublished({ targetId: 'x-mc1', version: '9.9.9', links: {}, env, client }),
		has('Version not found')
	)
})

test('report: total and per-target detail, empty bucket accepted', async () => {
	const client = createFakeClient()
	assert.deepEqual(await storageReport({ env, client }), { totalBytes: 0, perTarget: {} })
	await populate(client, 2)
	await release(client, '0.1.0', '2026-10-01T00:00:00Z', [await artifact('fabric-mc1.21.1', 'fff')])
	const report = await storageReport({ env, client })
	assert.equal(report.perTarget['neoforge-mc1.21.1'].versions, 2)
	assert.equal(report.perTarget['neoforge-mc1.21.1'].latest, '0.2.0')
	assert.ok(report.perTarget['fabric-mc1.21.1'].bytes > 0)
	assert.ok(
		report.totalBytes >= report.perTarget['neoforge-mc1.21.1'].bytes + report.perTarget['fabric-mc1.21.1'].bytes
	)
})

test('an unreadable or invalid index is rejected, an empty index is valid', async () => {
	assert.throws(() => validateIndex({ schema: 2 }), has('is invalid'))
	assert.throws(() => validateIndex(null), has('is invalid'))
	assert.throws(
		() => validateIndex({ schema: 1, targets: { a: { versions: [], latest: 'x' } } }),
		has('is invalid for a')
	)
	assert.throws(
		() =>
			validateIndex({
				schema: 1,
				targets: { a: { latest: '1', versions: [{ version: '1', sha256: 'x', bytes: 1, key: 'k' }] } },
			}),
		has('is invalid for a 1')
	)
	assert.equal(validateIndex(emptyIndex()).schema, 1)
	const client = createFakeClient()
	await storeRelease({
		config,
		version: '0.1.0',
		commit: 'c',
		builtAt: '2026-10-01T00:00:00Z',
		artifacts: [],
		env,
		client,
	})
	client.objects.set('index.json', { body: Buffer.from('{"schema":3}'), metadata: {} })
	await assert.rejects(readIndex({ env, client }), has('is invalid'))
})

test('the bucket is created outside production only; any other error is propagated', async () => {
	const client = createFakeClient()
	await release(client, '0.1.0', '2026-10-01T00:00:00Z', [])
	assert.ok(client.calls.some(call => call.type === 'CreateBucketCommand'))
	const production = createFakeClient()
	await assert.rejects(
		storeRelease({
			config,
			version: '0.1.0',
			commit: 'c',
			builtAt: '2026-10-01T00:00:00Z',
			artifacts: [],
			env: { ...env, NODE_ENV: 'production' },
			client: production,
		}),
		has('does not exist')
	)
	const broken = createFakeClient({ failOn: type => type === 'HeadBucketCommand' })
	await assert.rejects(release(broken, '0.1.0', '2026-10-01T00:00:00Z', []), has('simulated failure'))
})

test('the index comes from a target whose id alone describes loader and Minecraft', async () => {
	const client = createFakeClient()
	const { index } = await storeRelease({
		config: {},
		version: '0.1.0',
		commit: 'c',
		builtAt: '2026-10-01T00:00:00Z',
		artifacts: [await artifact('forge-mc1.20.1', 'f')],
		env,
		client,
	})
	assert.equal(index.targets['forge-mc1.20.1'].loader, 'forge')
	assert.equal(index.targets['forge-mc1.20.1'].minecraft, '1.20.1')
	const keyed = await storeRelease({
		config: {
			targets: { a: { id: 'forge-mc1.20.1', loader: 'forge', minecraft: '1.20.1', loaderVersion: '47', java: 17 } },
		},
		version: '0.2.0',
		commit: 'c',
		builtAt: '2026-10-02T00:00:00Z',
		artifacts: [await artifact('forge-mc1.20.1', 'g')],
		env,
		client,
	})
	assert.equal(keyed.index.targets['forge-mc1.20.1'].java, '17')
})

// --- `bun mod storage` command ---------------------------------------------------------------

function commandContext(client, overrides = {}) {
	const lines = []
	return {
		lines,
		ctx: {
			config,
			env: { ...env, ...overrides },
			log: message => lines.push(message),
			root: '.',
			storageClient: client,
		},
	}
}

test('status command: total, per target and alert above the threshold', async () => {
	const client = createFakeClient()
	await populate(client, 2)
	const calm = commandContext(client)
	assert.equal(await storage.run(['status'], calm.ctx), 0)
	assert.ok(calm.lines.join('\n').includes('neoforge-mc1.21.1  2 version(s)'))
	assert.ok(calm.lines.at(-1).startsWith('Total'))
	const loud = commandContext(client, { MOD_STORAGE_WARN_BYTES: '1' })
	assert.equal(await storage.run([], loud.ctx), 1)
	assert.ok(loud.lines.at(-1).includes('ALERT'))
})

test('ls, pin, unpin and prune commands', async () => {
	const client = createFakeClient()
	await populate(client)
	const { ctx, lines } = commandContext(client)
	await storage.run(['pin', 'neoforge-mc1.21.1', '0.1.0'], ctx)
	await storage.run(['ls'], ctx)
	assert.ok(lines.some(line => line.includes('0.1.0') && line.includes('pinned')))
	assert.ok(lines.some(line => line.includes('0.5.0') && line.includes('latest')))
	lines.length = 0
	await storage.run(['prune'], ctx)
	assert.ok(lines.some(line => line.includes('Dry run')))
	assert.ok(client.objects.has(versionKey('neoforge-mc1.21.1', '0.2.0')))
	lines.length = 0
	await storage.run(['prune', '--yes', '--keep', '2'], ctx)
	assert.ok(lines.some(line => line.startsWith('deleted')))
	assert.equal(client.objects.has(versionKey('neoforge-mc1.21.1', '0.2.0')), false)
	assert.ok(client.objects.has(versionKey('neoforge-mc1.21.1', '0.1.0')))
	await storage.run(['unpin', 'neoforge-mc1.21.1', '0.1.0'], ctx)
	await assert.rejects(storage.run(['pin', 'x'], ctx), has('Usage'))
	await assert.rejects(storage.run(['bogus'], ctx), has('Unknown subcommand'))
})

test('prune arguments and formats', () => {
	assert.deepEqual(parsePruneArgs([]), { keep: 3, yes: false })
	assert.deepEqual(parsePruneArgs(['--yes', '--keep', '5']), { keep: 5, yes: true })
	assert.throws(() => parsePruneArgs(['--keep', 'x']), has('integer'))
	assert.throws(() => parsePruneArgs(['--nope']), has('Unknown option'))
	assert.equal(formatBytes(10), '10 B')
	assert.equal(formatBytes(2048), '2.0 KiB')
	assert.equal(formatBytes(3 * 1024 ** 3), '3.0 GiB')
	assert.equal(storage.name, 'storage')
})

test('the command uses console.log or an object logger without a log function', async () => {
	const client = createFakeClient()
	const lines = []
	await storage.run(['ls'], { env, log: { info: message => lines.push(message) }, storageClient: client })
	const original = console.log
	console.log = () => undefined
	try {
		await storage.run(['ls'], { env, storageClient: client })
	} finally {
		console.log = original
	}
})

test('bun mod storage under MOD_STORAGE_PREFIX: status, ls and prune ignore the rest of the bucket', async () => {
	const client = createFakeClient()
	const env = { MOD_STORAGE_BUCKET: 'shared', MOD_STORAGE_PREFIX: 'public-mods/' }
	for (const key of ['owner/a.glb', 'owner/tiers/b.glb', 'public-mods../x', 'mods/neoforge-mc1.21.1/0.1.0/old.jar'])
		client.objects.set(key, { body: Buffer.alloc(2_000_000), contentType: 'x', metadata: {} })
	const dir = await mkdtemp(join(tmpdir(), 'mm-cli-prefix-'))
	for (const n of [1, 2, 3]) {
		const file = join(dir, `a${n}.jar`)
		await writeFile(file, `jar-${n}`)
		await storeRelease({
			config,
			version: `0.${n}.0`,
			commit: 'abc1234',
			builtAt: `2026-10-0${n}T00:00:00Z`,
			artifacts: [{ targetId: 'neoforge-mc1.21.1', file }],
			env,
			client,
		})
	}
	const lines = []
	const ctx = { env, log: message => lines.push(message), storageClient: client }
	assert.equal(await storage.run(['status'], ctx), 0)
	assert.ok(lines.some(line => line.includes('3 version(s)')))
	// The total only counts the prefix: the 8 MB of foreign objects are ignored.
	assert.ok(lines.some(line => line.startsWith('Total: ') && !line.includes('MiB')))
	const before = [...client.objects.keys()].filter(key => !key.startsWith('public-mods/')).sort()
	await storage.run(['prune', '--keep', '1', '--yes'], ctx)
	assert.deepEqual([...client.objects.keys()].filter(key => !key.startsWith('public-mods/')).sort(), before)
	assert.equal((await readIndex({ env, client })).targets['neoforge-mc1.21.1'].versions.length, 1)
	await assert.rejects(
		storage.run(['status'], { ...ctx, env: { ...env, MOD_STORAGE_PREFIX: 'a/../' } }),
		/MOD_STORAGE_PREFIX/
	)
})
