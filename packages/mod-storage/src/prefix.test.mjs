import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createFakeClient } from './fake-client.mjs'
import {
	isSafeKey,
	parseModPrefix,
	pruneStorage,
	readIndex,
	resolveObjectKey,
	setPinned,
	storageReport,
	storageSettings,
	storeRelease,
	storeUpload,
	validateIndex,
} from './index.mjs'

const target = { id: 'fabric-mc1.21.1', loader: 'fabric', minecraft: '1.21.1', loaderVersion: '0.19.5', java: '21' }
const env = { MOD_STORAGE_BUCKET: 'shared', MOD_STORAGE_PREFIX: 'public-mods/' }
const JAR = 'minemories-fabric-mc1.21.1-0.1.0.jar'
// Objets étrangers du même bucket, dont des pièges qui ressemblent au préfixe sans être dessous.
const FOREIGN = {
	'users/abc/1.glb': 'capture-a',
	'abc123/00000000-0000-4000-8000-000000000000.glb': 'capture-b',
	'abc123/tiers/00000000-0000-4000-8000-000000000001.glb': 'capture-c',
	'captures/x.glb': 'capture-d',
	'public-mods../x': 'trap-1',
	[`public-mods-evil/mods/fabric-mc1.21.1/0.1.0/${JAR}`]: 'trap-2',
	'public-mods': 'trap-3',
	[`mods/fabric-mc1.21.1/0.1.0/${JAR}`]: 'trap-4',
	'index.json': 'trap-5',
	'latest/fabric-mc1.21.1.jar': 'trap-6',
}

function seed(client) {
	for (const [key, text] of Object.entries(FOREIGN))
		client.objects.set(key, { body: Buffer.from(text), contentType: 'x', metadata: {} })
}

function foreign(client) {
	return Object.fromEntries(
		[...client.objects]
			.filter(([key]) => !key.startsWith('public-mods/'))
			.map(([key, value]) => [key, value.body.toString()])
	)
}

async function upload(client, version, content, extra = {}) {
	const dir = await mkdtemp(join(tmpdir(), 'mm-prefix-'))
	const file = join(dir, 'upload.jar')
	const body = Buffer.from(content)
	await writeFile(file, body)
	return storeUpload({
		target,
		version,
		commit: 'abc1234',
		builtAt: `2026-10-${String(10 + Number(version.split('.')[1])).padStart(2, '0')}T00:00:00Z`,
		file,
		bytes: body.length,
		sha256: createHash('sha256').update(body).digest('hex'),
		env,
		client,
		...extra,
	})
}

test('validation stricte du préfixe', () => {
	for (const ok of [undefined, '', 'public-mods/', 'a/', '0-9/', `${'a'.repeat(39)}/`])
		assert.equal(parseModPrefix(ok), ok ?? '')
	const invalid = ['public-mods', '/', '/a/', 'a//', 'a/b/', '../', 'a/../', '.a/', 'A/', '-a/', 'a b/', 'a_b/', 'a.b/']
	invalid.push(`${'a'.repeat(40)}/`, ' ', 'é/', 'a\\/', 'a/\n')
	for (const bad of invalid)
		assert.throws(() => parseModPrefix(bad), /MOD_STORAGE_PREFIX invalide/, JSON.stringify(bad))
	assert.throws(() => parseModPrefix(42), /MOD_STORAGE_PREFIX/)
	assert.throws(() => storageSettings({ MOD_STORAGE_PREFIX: '../' }), /MOD_STORAGE_PREFIX/)
	assert.equal(storageSettings({}).prefix, '')
})

test('clés sûres et résolution bornée aux racines', () => {
	assert.equal(isSafeKey('mods/a/b'), true)
	for (const bad of ['', '/a', 'a//b', 'a/', 'a/../b', '../a', './a', 'a\\b', 1, 'x'.repeat(1025)])
		assert.equal(isSafeKey(bad), false)
	assert.equal(resolveObjectKey('p/', 'mods/a/b.jar'), 'p/mods/a/b.jar')
	assert.equal(resolveObjectKey('', 'latest/a.jar'), 'latest/a.jar')
	for (const bad of ['index.json', 'users/a', 'mods/', 'mods/../x', 'latest/', 'p/mods/a'])
		assert.equal(resolveObjectKey('p/', bad), null)
	const entry = { version: '1', sha256: 'a'.repeat(64), bytes: 1, key: '../x' }
	const index = { schema: 1, targets: { a: { latest: '1', versions: [entry] } } }
	assert.throws(() => validateIndex(index), /invalide/)
})

test('envoi sous préfixe : tout est sous le préfixe, l’index garde des clés relatives', async () => {
	const client = createFakeClient()
	seed(client)
	await upload(client, '0.1.0', 'one')
	const mine = [...client.objects.keys()].filter(key => key.startsWith('public-mods/')).sort()
	assert.deepEqual(mine, [
		'public-mods/index.json',
		'public-mods/latest/fabric-mc1.21.1.jar',
		`public-mods/mods/fabric-mc1.21.1/0.1.0/${JAR}`,
	])
	assert.deepEqual(foreign(client), FOREIGN)
	const index = await readIndex({ env, client })
	assert.equal(index.targets[target.id].versions[0].key, `mods/fabric-mc1.21.1/0.1.0/${JAR}`)
	assert.ok(validateIndex(JSON.parse(client.objects.get('public-mods/index.json').body.toString())))
})

test('rétention et rapport ne lisent, ne comptent ni ne suppriment rien hors du préfixe', async () => {
	const client = createFakeClient()
	seed(client)
	for (const n of [1, 2, 3, 4]) await upload(client, `0.${n}.0`, `jar-${n}`, { keep: 10 })
	await setPinned({ targetId: target.id, version: '0.1.0', pinned: true, env, client })
	const report = await storageReport({ env, client })
	const mineBytes = [...client.objects]
		.filter(([key]) => key.startsWith('public-mods/'))
		.reduce((total, [, value]) => total + value.body.length, 0)
	assert.equal(report.totalBytes, mineBytes)
	assert.equal(report.perTarget[target.id].versions, 4)
	const dry = await pruneStorage({ keep: 2, dryRun: true, env, client })
	assert.deepEqual([...new Set(dry.deleted.map(item => item.version))], ['0.2.0'])
	assert.ok(dry.deleted.every(item => item.key.startsWith('mods/')))
	await pruneStorage({ keep: 2, dryRun: false, env, client })
	assert.deepEqual(foreign(client), FOREIGN)
	assert.ok(!client.objects.has('public-mods/mods/fabric-mc1.21.1/0.2.0/minemories-fabric-mc1.21.1-0.2.0.jar'))
	for (const call of client.calls.filter(item => item.type === 'ListObjectsV2Command'))
		assert.ok(call.input.Prefix.startsWith('public-mods/'))
	for (const call of client.calls.filter(item => item.type === 'DeleteObjectCommand'))
		assert.ok(call.input.Key.startsWith('public-mods/mods/'))
})

test('un index corrompu ne peut pas faire supprimer ni lire hors du préfixe', async () => {
	const client = createFakeClient()
	seed(client)
	await upload(client, '0.1.0', 'one')
	const raw = JSON.parse(client.objects.get('public-mods/index.json').body.toString())
	raw.targets[target.id].versions[0].key = '../users/abc/1.glb'
	const body = Buffer.from(JSON.stringify(raw))
	client.objects.set('public-mods/index.json', { body, contentType: 'x', metadata: {} })
	await assert.rejects(pruneStorage({ keep: 1, dryRun: false, env, client }), /invalide/)
	assert.deepEqual(foreign(client), FOREIGN)
})

test('storeRelease respecte le préfixe ; un préfixe invalide échoue avant tout accès', async () => {
	const client = createFakeClient()
	seed(client)
	const dir = await mkdtemp(join(tmpdir(), 'mm-prefix-'))
	const file = join(dir, 'a.jar')
	await writeFile(file, 'jar')
	const options = {
		config: { targets: [target] },
		version: '0.1.0',
		commit: 'c',
		builtAt: '2026-10-01T00:00:00Z',
		artifacts: [{ targetId: target.id, file }],
		client,
	}
	await assert.rejects(storeRelease({ ...options, env: { ...env, MOD_STORAGE_PREFIX: 'a/../' } }), /MOD_STORAGE_PREFIX/)
	assert.equal(client.calls.length, 0)
	await storeRelease({ ...options, env })
	assert.deepEqual(foreign(client), FOREIGN)
	const copy = client.calls.find(item => item.type === 'CopyObjectCommand')
	assert.ok(copy.input.CopySource.startsWith('shared/public-mods/mods/'))
	assert.ok(copy.input.Key.startsWith('public-mods/latest/'))
})

test('sans préfixe le comportement est inchangé', async () => {
	const client = createFakeClient()
	await upload(client, '0.1.0', 'one', { env: { MOD_STORAGE_BUCKET: 'shared' } })
	assert.ok(client.objects.has('index.json'))
	assert.ok(client.objects.has('latest/fabric-mc1.21.1.jar'))
})
