import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createFakeClient } from './fake-client.mjs'
import { ModStorageConflictError, readIndex, setPinned, storeUpload, validateIndex, versionKey } from './index.mjs'

const target = { id: 'fabric-mc1.21.1', loader: 'fabric', minecraft: '1.21.1', loaderVersion: '0.19.5', java: '21' }
const env = { MOD_STORAGE_BUCKET: 'test-mods' }

async function upload(client, version, content, extra = {}) {
	const dir = await mkdtemp(join(tmpdir(), 'mm-upload-'))
	const file = join(dir, 'upload.jar')
	const body = Buffer.from(content)
	await writeFile(file, body)
	return storeUpload({
		target,
		version,
		commit: 'abc1234',
		builtAt: `2026-10-${String(10 + Number(version.split('.')[1])).padStart(2, '0')}T00:00:00Z`,
		builtBy: 'pc',
		file,
		bytes: body.length,
		sha256: createHash('sha256').update(body).digest('hex'),
		env,
		client,
		...extra,
	})
}

test('an upload writes the JAR, latest, the index and builtBy', async () => {
	const client = createFakeClient()
	const result = await upload(client, '0.1.0', 'jar-one')
	assert.deepEqual([result.latest, result.replaced, result.unchanged], [true, false, false])
	assert.ok(client.objects.has(versionKey(target.id, '0.1.0')))
	assert.ok(client.objects.has(`latest/${target.id}.jar`))
	const index = await readIndex({ env, client })
	assert.equal(index.targets[target.id].versions[0].builtBy, 'pc')
	assert.equal(index.targets[target.id].loaderVersion, '0.19.5')
})

test('resending the same bytes changes nothing (index not rewritten)', async () => {
	const client = createFakeClient()
	await upload(client, '0.1.0', 'jar-one')
	const writes = () => client.calls.filter(call => call.type === 'PutObjectCommand').length
	const before = writes()
	const again = await upload(client, '0.1.0', 'jar-one')
	assert.deepEqual([again.unchanged, again.replaced, again.latest], [true, false, true])
	assert.equal(writes(), before)
})

test('different content for the same version is rejected without replace, accepted with it', async () => {
	const client = createFakeClient()
	await upload(client, '0.1.0', 'jar-one')
	await assert.rejects(upload(client, '0.1.0', 'jar-two'), ModStorageConflictError)
	assert.equal((await readIndex({ env, client })).targets[target.id].versions[0].bytes, 7)
	const replaced = await upload(client, '0.1.0', 'jar-two-longer', { replace: true })
	assert.deepEqual([replaced.replaced, replaced.unchanged], [true, false])
	assert.equal((await readIndex({ env, client })).targets[target.id].versions[0].bytes, 14)
})

test('retention follows the upload but keeps latest, pinned and published versions', async () => {
	const client = createFakeClient()
	for (const n of [1, 2]) await upload(client, `0.${n}.0`, `jar-${n}`)
	await setPinned({ targetId: target.id, version: '0.1.0', pinned: true, env, client })
	await upload(client, '0.3.0', 'jar-3', { keep: 2 })
	const result = await upload(client, '0.4.0', 'jar-4', { keep: 2 })
	assert.deepEqual(
		result.index.targets[target.id].versions.map(item => item.version),
		['0.4.0', '0.3.0', '0.1.0']
	)
	assert.ok(!client.objects.has(versionKey(target.id, '0.2.0')))
	assert.ok(client.objects.has(versionKey(target.id, '0.1.0')))
})

test('a version older than latest does not become latest', async () => {
	const client = createFakeClient()
	await upload(client, '0.3.0', 'jar-3')
	const older = await upload(client, '0.1.0', 'jar-1')
	assert.equal(older.latest, false)
	assert.equal((await readIndex({ env, client })).targets[target.id].latest, '0.3.0')
})

test('a missing object behind an identical entry is repaired', async () => {
	const client = createFakeClient()
	await upload(client, '0.1.0', 'jar-one')
	client.objects.delete(versionKey(target.id, '0.1.0'))
	const result = await upload(client, '0.1.0', 'jar-one')
	assert.equal(result.unchanged, false)
	assert.ok(client.objects.has(versionKey(target.id, '0.1.0')))
})

test('dangerous identifiers rejected and invalid builtBy in the index', async () => {
	const client = createFakeClient()
	await assert.rejects(upload(client, '..%2f0.1.0', 'x'), /invalid/)
	const entry = {
		version: '0.1.0',
		builtAt: 'x',
		commit: 'c',
		bytes: 1,
		sha256: 'a'.repeat(64),
		key: 'mods/x/0.1.0/x.jar',
	}
	const index = (extra = {}) => ({
		schema: 1,
		generatedAt: 'x',
		targets: { [target.id]: { ...target, latest: '0.1.0', versions: [{ ...entry, ...extra }] } },
	})
	assert.ok(validateIndex(index({ builtBy: 'vps' })))
	assert.ok(validateIndex(index()))
	assert.throws(() => validateIndex(index({ builtBy: 'laptop' })), /invalid/)
})
