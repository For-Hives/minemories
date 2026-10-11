import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ObjectDeletionQueue } from './object-deletions'
import { minimalGlb } from './test-support/glb-fixture'

const root = mkdtempSync(join(tmpdir(), 'minemories-account-quota-'))
process.env.ACCOUNT_STORAGE_BYTES = '1024'
process.env.DATABASE_PATH = join(root, 'db.sqlite')
process.env.UPLOADS_PATH = join(root, 'uploads')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.LOCAL_OBJECTS_PATH = join(root, 'objects')
process.env.BETTER_AUTH_SECRET = 'quota-fixture-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'quota-fixture-pepper-secret-at-least-32-characters'
const { app } = await import('./index')
const { database } = await import('./database')
const { accountStorageUsage, accountStorageFits } = await import('./storage-quota')
const { createPairingCode, exchangePairingCode, deleteMemory, trashMemory, restoreMemory, purgeDeletedMemories } =
	await import('./pairing')
const { removeMemory } = await import('./storage')
const { cleanupUploads } = await import('./uploads')

afterAll(() => {
	database.close()
	rmSync(root, { recursive: true, force: true })
})

function paired(owner = randomUUID()) {
	const paired = exchangePairingCode(createPairingCode(owner).code, 'Quota fixture')
	if (!paired) throw new Error('Fixture pairing failed')
	return { owner, token: paired.deviceToken }
}
function glbOfSize(size = 1024) {
	return minimalGlb(Buffer.alloc(size - minimalGlb().length - 8))
}
function headers(token: string) {
	return { authorization: `Bearer ${token}` }
}
function legacy(token: string, bytes = glbOfSize()) {
	return app.request('/api/mod/memories', {
		method: 'POST',
		headers: { ...headers(token), 'content-type': 'model/gltf-binary' },
		body: Uint8Array.from(bytes).buffer,
	})
}
function initialize(token: string, id: string, bytes = glbOfSize()) {
	return app.request('/api/mod/uploads', {
		method: 'POST',
		headers: { ...headers(token), 'content-type': 'application/json' },
		body: JSON.stringify({ id, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }),
	})
}
function mutate(token: string, id: string, method: 'POST' | 'DELETE', complete = false) {
	return app.request(`/api/mod/uploads/${id}${complete ? '/complete' : ''}`, { method, headers: headers(token) })
}

test('usage includes trash, expired reservations and pending cleanup, but excludes other owners and completed receipts', () => {
	const fixture = new Database(':memory:')
	try {
		fixture.exec(`CREATE TABLE memories (user_id TEXT, size INTEGER, deleted_at INTEGER);
			CREATE TABLE mod_uploads (user_id TEXT, size INTEGER, completed INTEGER, expires_at INTEGER);
			CREATE TABLE object_deletions (user_id TEXT, size INTEGER);
			INSERT INTO memories VALUES ('one', 100, NULL), ('one', 200, 1), ('two', 9000, NULL);
			INSERT INTO mod_uploads VALUES ('one', 300, 0, 0), ('one', 9000, 1, 0), ('two', 9000, 0, 0);
			INSERT INTO object_deletions VALUES ('one', 400), ('two', 9000), (NULL, NULL);`)
		expect(accountStorageUsage(fixture, 'missing')).toBe(0)
		expect(accountStorageUsage(fixture, 'one')).toBe(1000)
		expect(accountStorageFits(fixture, 'one', 24)).toBe(true)
		expect(accountStorageFits(fixture, 'one', 25)).toBe(false)
		expect(accountStorageFits(fixture, 'missing', 1024)).toBe(true)
		for (const invalid of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
			expect(accountStorageFits(fixture, 'missing', invalid)).toBe(false)
		}
		fixture.exec('DELETE FROM memories; DELETE FROM mod_uploads; DELETE FROM object_deletions;')
		fixture.query('INSERT INTO memories VALUES (?, ?, NULL)').run('invalid', -1)
		expect(accountStorageFits(fixture, 'invalid', 0)).toBe(false)
		fixture.query('UPDATE memories SET size = ?').run(Number.MAX_SAFE_INTEGER + 1)
		expect(accountStorageFits(fixture, 'invalid', 0)).toBe(false)
	} finally {
		fixture.close()
	}
})

test('simultaneous legacy uploads and multiple devices share one account budget while other accounts remain independent', async () => {
	const first = paired()
	const second = paired(first.owner)
	const responses = await Promise.all([legacy(first.token), legacy(second.token)])
	expect(responses.map(response => response.status).sort()).toEqual([201, 413])
	const accepted = responses.find(response => response.status === 201)
	const refused = responses.find(response => response.status === 413)
	if (!(accepted && refused)) throw new Error('Missing concurrent responses')
	expect(await refused.json()).toEqual({ error: 'storage_quota_exceeded' })
	expect(accountStorageUsage(database, first.owner)).toBe(1024)
	expect(database.query('SELECT id FROM memories WHERE user_id = ?').all(first.owner)).toHaveLength(1)
	expect(database.query('SELECT object_key FROM object_deletions WHERE user_id = ?').all(first.owner)).toEqual([])
	expect((await legacy(paired().token)).status).toBe(201)
	const { id } = (await accepted.json()) as { id: string }
	expect(trashMemory(first.owner, id)).toBe(true)
	expect(accountStorageUsage(database, first.owner)).toBe(1024)
	expect((await initialize(second.token, randomUUID(), minimalGlb())).status).toBe(413)
	expect(restoreMemory(first.owner, id)).toBe(true)
	expect(accountStorageUsage(database, first.owner)).toBe(1024)
	const key = deleteMemory(first.owner, id)
	if (!key) throw new Error('Missing deleted object')
	expect(accountStorageUsage(database, first.owner)).toBe(1024)
	await new ObjectDeletionQueue(database, () => Promise.reject(new Error('offline fixture'))).drain(key, 0)
	expect(accountStorageUsage(database, first.owner)).toBe(1024)
	await new ObjectDeletionQueue(database, removeMemory).drain(key, 60_000)
	expect(existsSync(join(root, 'objects', key))).toBe(false)
	expect(accountStorageUsage(database, first.owner)).toBe(0)
	expect((await legacy(second.token)).status).toBe(201)
})

test('legacy and resumable uploads compete for the same durable reservation and rejected staging is absent', async () => {
	const { owner, token } = paired()
	const id = randomUUID()
	const [resumable, old] = await Promise.all([initialize(token, id), legacy(token)])
	expect([resumable.status, old.status].sort()).toEqual([201, 413])
	expect(accountStorageUsage(database, owner)).toBe(1024)
	if (resumable.status === 413) {
		expect(database.query('SELECT id FROM mod_uploads WHERE id = ?').get(id)).toBeNull()
		expect(existsSync(join(root, 'uploads', id))).toBe(false)
	} else {
		expect((await mutate(token, id, 'DELETE')).status).toBe(200)
		expect(accountStorageUsage(database, owner)).toBe(0)
	}
})

test('resumable reservations are replayable, survive restart and become memories once without double charging', async () => {
	const { owner, token } = paired()
	const id = randomUUID()
	const bytes = glbOfSize()
	expect((await initialize(token, id, bytes)).status).toBe(201)
	expect((await initialize(token, id, bytes)).status).toBe(200)
	const reopened = new Database(process.env.DATABASE_PATH)
	try {
		expect(accountStorageUsage(reopened, owner)).toBe(1024)
	} finally {
		reopened.close()
	}
	expect((await legacy(token, minimalGlb())).status).toBe(413)
	expect((await initialize(paired(owner).token, randomUUID(), minimalGlb())).status).toBe(413)
	const chunk = await app.request(`/api/mod/uploads/${id}`, {
		method: 'PUT',
		headers: { ...headers(token), 'content-type': 'application/octet-stream', 'upload-offset': '0' },
		body: Uint8Array.from(bytes).buffer,
	})
	expect(chunk.status).toBe(200)
	expect((await mutate(token, id, 'POST', true)).status).toBe(201)
	expect(accountStorageUsage(database, owner)).toBe(1024)
	expect((await mutate(token, id, 'POST', true)).status).toBe(200)
	expect((await initialize(token, id, bytes)).status).toBe(200)
	expect(accountStorageUsage(database, owner)).toBe(1024)
	expect(trashMemory(owner, id)).toBe(true)
	database.query('UPDATE memories SET purge_after = 0 WHERE id = ?').run(id)
	expect(purgeDeletedMemories(0)).toContain(`${owner}/${id}.glb`)
	expect(accountStorageUsage(database, owner)).toBe(1024)
	await new ObjectDeletionQueue(database, removeMemory).drain(`${owner}/${id}.glb`, 0)
	expect(accountStorageUsage(database, owner)).toBe(0)
})

test('expired sessions keep their reservation during cleanup failure and release only after successful cleanup', async () => {
	const { owner, token } = paired()
	const id = randomUUID()
	expect((await initialize(token, id)).status).toBe(201)
	database.query('UPDATE mod_uploads SET expires_at = 0, storage_started = 1 WHERE id = ?').run(id)
	await mkdir(join(root, 'objects'), { recursive: true })
	await writeFile(join(root, 'objects', owner), 'storage obstruction fixture')
	await cleanupUploads()
	expect(accountStorageUsage(database, owner)).toBe(1024)
	expect((await initialize(token, randomUUID())).status).toBe(413)
	await rm(join(root, 'objects', owner))
	await cleanupUploads()
	expect(accountStorageUsage(database, owner)).toBe(0)
	expect(existsSync(join(root, 'uploads', id))).toBe(false)
	expect((await initialize(token, randomUUID())).status).toBe(201)
})

test('historical accounts over the configured quota retain their captures and incomplete uploads until an explicit action', async () => {
	const { owner, token } = paired()
	const id = randomUUID()
	const bytes = glbOfSize()
	expect((await initialize(token, id, bytes)).status).toBe(201)
	expect(
		(
			await app.request(`/api/mod/uploads/${id}`, {
				method: 'PUT',
				headers: { ...headers(token), 'content-type': 'application/octet-stream', 'upload-offset': '0' },
				body: Uint8Array.from(bytes).buffer,
			})
		).status
	).toBe(200)
	const extra = await legacy(paired().token, minimalGlb())
	const { id: extraId } = (await extra.json()) as { id: string }
	database.query('UPDATE memories SET user_id = ? WHERE id = ?').run(owner, extraId)
	expect((await mutate(token, id, 'POST', true)).status).toBe(413)
	expect(accountStorageUsage(database, owner)).toBeGreaterThan(1024)
	expect(existsSync(join(root, 'uploads', id))).toBe(true)
	expect(database.query('SELECT id FROM memories WHERE id = ?').get(extraId)).not.toBeNull()
	database.query('DELETE FROM memories WHERE id = ?').run(extraId)
	expect((await mutate(token, id, 'POST', true)).status).toBe(201)
})
