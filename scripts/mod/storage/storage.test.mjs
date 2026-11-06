import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import storage, { formatBytes, parsePruneArgs } from '../commands/storage.mjs'
import { createFakeClient } from './fake-client.mjs'
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

test('stocke un jar, ses fichiers associés, la copie latest et un index valide', async () => {
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

test('un fichier créé sans fichiers associés est accepté et fabricApi est recopié', async () => {
	const client = createFakeClient()
	const jar = await artifact('fabric-mc1.21.1', 'fab', { sidecars: false })
	const { index } = await release(client, '0.1.0', '2026-10-01T00:00:00Z', [jar])
	assert.equal(index.targets['fabric-mc1.21.1'].fabricApi, '0.116.17+1.21.1')
	assert.equal([...client.objects.keys()].filter(key => key.endsWith('manifest.json')).length, 0)
})

test("l'index est écrit en dernier, après les objets et les copies latest", async () => {
	const client = createFakeClient()
	await release(client, '0.1.0', '2026-10-01T00:00:00Z', [await artifact('neoforge-mc1.21.1', 'a')])
	const writes = client.calls.filter(call => ['PutObjectCommand', 'CopyObjectCommand'].includes(call.type))
	assert.equal(writes.at(-1).input.Key, 'index.json')
	assert.equal(writes.filter(call => call.input.Key === 'index.json').length, 1)
})

test('stocker deux fois la même version est idempotent', async () => {
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

test('une version reconstruite avec un autre contenu est remplacée en gardant épinglage et publication', async () => {
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

test('les versions sont triées de la plus récente à la plus ancienne et latest suit', async () => {
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

test('les gros fichiers passent par un envoi multipart et sont vérifiés', async () => {
	const client = createFakeClient()
	const jar = await artifact('neoforge-mc1.21.1', 'x'.repeat(25))
	await release(client, '0.1.0', '2026-10-01T00:00:00Z', [jar], { partSize: 10 })
	assert.equal(client.calls.filter(call => call.type === 'UploadPartCommand').length, 3)
	assert.equal(client.sha256(versionKey('neoforge-mc1.21.1', '0.1.0')), jar.sha256)
	assert.equal(client.uploads.size, 0)
})

test("un échec pendant l'upload laisse l'index intact et annule le multipart", async () => {
	const client = createFakeClient()
	const first = await artifact('neoforge-mc1.21.1', 'ok')
	const { index: before } = await release(client, '0.1.0', '2026-10-01T00:00:00Z', [first])
	const wrapped = {
		...client,
		send: command =>
			command.constructor.name === 'UploadPartCommand' ? Promise.reject(new Error('coupure')) : client.send(command),
	}
	await assert.rejects(
		release(wrapped, '0.2.0', '2026-10-02T00:00:00Z', [await artifact('neoforge-mc1.21.1', 'y'.repeat(25))], {
			partSize: 10,
		}),
		has('coupure')
	)
	assert.deepEqual(await readIndex({ env, client }), before)
	assert.equal(client.uploads.size, 0)
})

test("un échec sur la 2e cible n'écrit jamais l'index", async () => {
	const client = createFakeClient({
		failOn: (type, input) => type === 'PutObjectCommand' && input.Key.includes('fabric-mc1.21.1/0.1.0/minemories'),
	})
	await assert.rejects(
		release(client, '0.1.0', '2026-10-01T00:00:00Z', [
			await artifact('neoforge-mc1.21.1', 'a'),
			await artifact('fabric-mc1.21.1', 'b'),
		]),
		has('panne simulée')
	)
	assert.equal(client.objects.has('index.json'), false)
})

test('la vérification sha256 après upload détecte un objet corrompu', async () => {
	const client = createFakeClient()
	const corrupting = {
		...client,
		send: async command => {
			const result = await client.send(command)
			if (command.constructor.name === 'PutObjectCommand' && command.input.Key.endsWith('.jar'))
				client.objects.get(command.input.Key).body = Buffer.from('corrompu')
			return result
		},
	}
	await assert.rejects(
		release(corrupting, '0.1.0', '2026-10-01T00:00:00Z', [await artifact('neoforge-mc1.21.1', 'abc')]),
		has('Vérification sha256')
	)
	assert.equal(client.objects.has('index.json'), false)
})

test('refuse un artefact dont le sha256 ou la taille ne correspondent pas, et les identifiants dangereux', async () => {
	const client = createFakeClient()
	const jar = await artifact('neoforge-mc1.21.1', 'abc')
	await assert.rejects(
		release(client, '0.1.0', '2026-10-01T00:00:00Z', [{ ...jar, sha256: 'a'.repeat(64) }]),
		has('sha256 inattendu')
	)
	await assert.rejects(
		release(client, '0.1.0', '2026-10-01T00:00:00Z', [{ ...jar, bytes: 99 }]),
		has('Taille inattendue')
	)
	await assert.rejects(release(client, '../x', '2026-10-01T00:00:00Z', [jar]), has('invalide'))
	await assert.rejects(
		release(client, '0.1.0', '2026-10-01T00:00:00Z', [{ ...jar, targetId: '../../etc' }]),
		has('invalide')
	)
})

async function populate(client, count = 5) {
	for (let i = 1; i <= count; i += 1)
		await release(client, `0.${i}.0`, `2026-10-0${i}T00:00:00Z`, [await artifact('neoforge-mc1.21.1', `jar-${i}`)])
}

test('la rétention garde les 3 plus récentes et simule par défaut', async () => {
	const client = createFakeClient()
	await populate(client)
	const dry = await pruneStorage({ env, client })
	assert.deepEqual([...new Set(dry.deleted.map(item => item.version))].sort(), ['0.1.0', '0.2.0'])
	assert.ok(dry.freedBytes > 0)
	assert.ok(client.objects.has(versionKey('neoforge-mc1.21.1', '0.1.0')))
	assert.equal(dry.kept.length, 3)
	assert.equal((await readIndex({ env, client })).targets['neoforge-mc1.21.1'].versions.length, 5)
})

test("prune --yes met l'index à jour avant de supprimer les objets", async () => {
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

test('les versions épinglées, publiées ou latest ne sont jamais supprimées', async () => {
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

test('prune sans rien à supprimer ne réécrit pas l’index, et refuse un keep invalide', async () => {
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

test('épingler une version inconnue échoue', async () => {
	const client = createFakeClient()
	await assert.rejects(
		setPinned({ targetId: 'x-mc1', version: '9.9.9', pinned: true, env, client }),
		has('introuvable')
	)
	await assert.rejects(
		setPublished({ targetId: 'x-mc1', version: '9.9.9', links: {}, env, client }),
		has('introuvable')
	)
})

test('rapport : total et détail par cible, bucket vide accepté', async () => {
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

test('un index illisible ou invalide est refusé, un index vide est valide', async () => {
	assert.throws(() => validateIndex({ schema: 2 }), has('invalide'))
	assert.throws(() => validateIndex(null), has('invalide'))
	assert.throws(
		() => validateIndex({ schema: 1, targets: { a: { versions: [], latest: 'x' } } }),
		has('invalide pour a')
	)
	assert.throws(
		() =>
			validateIndex({
				schema: 1,
				targets: { a: { latest: '1', versions: [{ version: '1', sha256: 'x', bytes: 1, key: 'k' }] } },
			}),
		has('invalide pour a 1')
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
	await assert.rejects(readIndex({ env, client }), has('invalide'))
})

test('le bucket est créé hors production seulement; une autre erreur est propagée', async () => {
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
		has("n'existe pas")
	)
	const broken = createFakeClient({ failOn: type => type === 'HeadBucketCommand' })
	await assert.rejects(release(broken, '0.1.0', '2026-10-01T00:00:00Z', []), has('panne simulée'))
})

test("l'index provient d'une cible dont l'identifiant seul décrit loader et Minecraft", async () => {
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

// --- Commande `bun mod storage` ---------------------------------------------------------------

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

test('commande status : total, par cible et alerte au-delà du seuil', async () => {
	const client = createFakeClient()
	await populate(client, 2)
	const calm = commandContext(client)
	assert.equal(await storage.run(['status'], calm.ctx), 0)
	assert.ok(calm.lines.join('\n').includes('neoforge-mc1.21.1  2 version(s)'))
	assert.ok(calm.lines.at(-1).startsWith('Total'))
	const loud = commandContext(client, { MOD_STORAGE_WARN_BYTES: '1' })
	assert.equal(await storage.run([], loud.ctx), 1)
	assert.ok(loud.lines.at(-1).includes('ALERTE'))
})

test('commande ls, pin, unpin et prune', async () => {
	const client = createFakeClient()
	await populate(client)
	const { ctx, lines } = commandContext(client)
	await storage.run(['pin', 'neoforge-mc1.21.1', '0.1.0'], ctx)
	await storage.run(['ls'], ctx)
	assert.ok(lines.some(line => line.includes('0.1.0') && line.includes('pinned')))
	assert.ok(lines.some(line => line.includes('0.5.0') && line.includes('latest')))
	lines.length = 0
	await storage.run(['prune'], ctx)
	assert.ok(lines.some(line => line.includes('Simulation')))
	assert.ok(client.objects.has(versionKey('neoforge-mc1.21.1', '0.2.0')))
	lines.length = 0
	await storage.run(['prune', '--yes', '--keep', '2'], ctx)
	assert.ok(lines.some(line => line.startsWith('supprimé')))
	assert.equal(client.objects.has(versionKey('neoforge-mc1.21.1', '0.2.0')), false)
	assert.ok(client.objects.has(versionKey('neoforge-mc1.21.1', '0.1.0')))
	await storage.run(['unpin', 'neoforge-mc1.21.1', '0.1.0'], ctx)
	await assert.rejects(storage.run(['pin', 'x'], ctx), has('Usage'))
	await assert.rejects(storage.run(['bogus'], ctx), has('Sous-commande inconnue'))
})

test('arguments de prune et formats', () => {
	assert.deepEqual(parsePruneArgs([]), { keep: 3, yes: false })
	assert.deepEqual(parsePruneArgs(['--yes', '--keep', '5']), { keep: 5, yes: true })
	assert.throws(() => parsePruneArgs(['--keep', 'x']), has('entier'))
	assert.throws(() => parsePruneArgs(['--nope']), has('inconnue'))
	assert.equal(formatBytes(10), '10 o')
	assert.equal(formatBytes(2048), '2.0 Kio')
	assert.equal(formatBytes(3 * 1024 ** 3), '3.0 Gio')
	assert.equal(storage.name, 'storage')
})

test('la commande utilise console.log ou un logger objet sans fonction de log', async () => {
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
