import { afterAll, expect, test } from 'bun:test'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { externalGlbs, malformedGeometryGlbs, minimalGlb } from './test-support/glb-fixture'
import { largeThumbnail } from './test-support/thumbnail-fixture'

const root = mkdtempSync(join(tmpdir(), 'minemories-chunks-'))
process.env.DATABASE_PATH = join(root, 'test.sqlite')
process.env.UPLOADS_PATH = join(root, 'uploads')
process.env.LOCAL_OBJECTS_PATH = join(root, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'
const { app } = await import('./index')
const { database } = await import('./database')
const { createPairingCode, exchangePairingCode, listMemories } = await import('./pairing')
const { cleanupUploads } = await import('./uploads')
const { UPLOAD_CHUNK_BYTES, MAX_UPLOAD_BYTES, validateUploadFile, readUploadChunk } = await import('./upload-files')

afterAll(() => {
	database.close()
	rmSync(root, { recursive: true, force: true })
})
function device(owner = randomUUID()) {
	const code = createPairingCode(owner)
	const paired = exchangePairingCode(code.code, 'Test mod')
	if (!paired) throw new Error('Pairing fixture failed')
	return { owner, token: paired.deviceToken }
}
function request(token: string, path: string, method = 'GET', body?: BodyInit, headers: Record<string, string> = {}) {
	return app.request(`/api/mod/uploads${path === '/' ? '' : path}`, {
		method,
		headers: { authorization: `Bearer ${token}`, ...headers },
		body: body ?? null,
	})
}
function hash(bytes: Buffer) {
	return createHash('sha256').update(bytes).digest('hex')
}
async function initialize(token: string, bytes = minimalGlb(), id = randomUUID()) {
	const response = await request(
		token,
		'/',
		'POST',
		JSON.stringify({ id, size: bytes.length, sha256: hash(bytes), metadata: { worldName: 'Test world' } }),
		{ 'content-type': 'application/json' }
	)
	expect(response.status).toBe(201)
	return id
}
function chunk(token: string, id: string, bytes: Buffer, offset = 0) {
	return request(token, `/${id}`, 'PUT', Uint8Array.from(bytes).buffer, {
		'content-type': 'application/octet-stream',
		'upload-offset': String(offset),
	})
}

async function assertExternalUploadRejected(bytes: Buffer) {
	const { owner, token } = device()
	const id = await initialize(token, bytes)
	expect((await chunk(token, id, bytes)).status).toBe(200)
	const response = await request(token, `/${id}/complete`, 'POST')
	expect(response.status).toBe(400)
	expect(await response.json()).toEqual({ error: 'invalid_glb_or_checksum' })
	expect(listMemories(owner)).toEqual([])
	expect(existsSync(join(root, 'objects', owner, `${id}.glb`))).toBe(false)
	expect(database.query('SELECT completed, storage_started FROM mod_uploads WHERE id = ?').get(id)).toEqual({
		completed: 0,
		storage_started: 0,
	})
	expect((await request(token, `/${id}`, 'DELETE')).status).toBe(200)
}

test('resumable upload refuses external resources, replacing JSON and incoherent geometry without storing or publishing them', async () => {
	for (const bytes of [...externalGlbs(), ...malformedGeometryGlbs()]) {
		// biome-ignore lint/performance/noAwaitInLoops: initialization holds a global lock, so fixtures must run sequentially.
		await assertExternalUploadRejected(bytes)
	}
})

test('an object pending deletion cannot be reused by a new upload', async () => {
	const { owner, token } = device()
	const id = randomUUID()
	const key = `${owner}/${id}.glb`
	database.query('INSERT INTO object_deletions (object_key, created_at) VALUES (?, 0)').run(key)
	const response = await request(
		token,
		'/',
		'POST',
		JSON.stringify({ id, size: minimalGlb().length, sha256: hash(minimalGlb()) })
	)
	expect(response.status).toBe(409)
	expect(await response.json()).toEqual({ error: 'upload_id_conflict' })
	expect(database.query('SELECT id FROM mod_uploads WHERE id = ?').get(id)).toBeNull()
	database.query('DELETE FROM object_deletions WHERE object_key = ?').run(key)
	expect(await initialize(token, minimalGlb(), id)).toBe(id)
})

test('initialization admits both maximum-size PNG previews but refuses oversized JSON before creating staging', async () => {
	const { owner, token } = device()
	const bytes = minimalGlb()
	const image = largeThumbnail()
	const id = randomUUID()
	const body = JSON.stringify({
		id,
		size: bytes.length,
		sha256: hash(bytes),
		metadata: {
			worldName: 'été',
			thumbnail: image,
			icon: image,
		},
	})
	expect(image.length).toBe(95_998)
	const response = await request(token, '/', 'POST', body, { 'content-type': 'application/json' })
	expect(response.status).toBe(201)
	expect((await chunk(token, id, bytes)).status).toBe(200)
	expect((await request(token, `/${id}/complete`, 'POST')).status).toBe(201)
	expect(listMemories(owner)).toMatchObject([{ id, metadata: { thumbnail: image, icon: image } }])
	const refusedId = randomUUID()
	const huge = JSON.stringify({ id: refusedId, size: bytes.length, sha256: hash(bytes), padding: 'a'.repeat(262_144) })
	const refused = await request(token, '/', 'POST', huge, { 'content-type': 'application/json', 'content-length': '1' })
	expect(refused.status).toBe(413)
	expect(await refused.json()).toEqual({ error: 'request_body_too_large' })
	expect(database.query('SELECT id FROM mod_uploads WHERE id = ?').get(refusedId)).toBeNull()
	expect(existsSync(join(root, 'uploads', refusedId))).toBe(false)
})

test('replayed chunks and finalization are idempotent, scoped to the paired device', async () => {
	const { owner, token } = device()
	const stranger = device().token
	const bytes = minimalGlb()
	const id = await initialize(token, bytes)
	expect((await request(stranger, `/${id}`)).status).toBe(404)
	expect((await request('', `/${id}`)).status).toBe(401)
	expect((await request(token, `/${id}/complete`, 'POST')).status).toBe(409)
	expect((await chunk(token, id, bytes, 1)).status).toBe(400)
	expect((await chunk(token, id, bytes)).status).toBe(200)
	expect((await chunk(token, id, bytes)).status).toBe(200)
	const changed = Buffer.from(bytes)
	changed[20] = 0
	expect((await chunk(token, id, changed)).status).toBe(409)
	const status = await request(token, `/${id}`)
	expect(await status.json()).toMatchObject({ offset: bytes.length, completed: false })
	const complete = await request(token, `/${id}/complete`, 'POST')
	expect(complete.status).toBe(201)
	expect((await request(token, `/${id}/complete`, 'POST')).status).toBe(200)
	expect(listMemories(owner)).toHaveLength(1)
	expect((await readFile(join(root, 'objects', owner, `${id}.glb`))).toString('hex')).toBe(bytes.toString('hex'))
	expect(existsSync(join(root, 'uploads', id))).toBe(false)
	expect((await request(token, `/${id}`, 'DELETE')).status).toBe(200)
	expect(listMemories(owner)).toHaveLength(1)
})

test('initialization is replayable, bounds size/metadata, quota and expiration', async () => {
	const { token } = device()
	const id = await initialize(token)
	const data = { id, size: minimalGlb().length, sha256: hash(minimalGlb()) }
	expect((await request(token, '/', 'POST', JSON.stringify(data))).status).toBe(200)
	expect((await request(token, '/', 'POST', JSON.stringify({ ...data, size: 200_000_000 }))).status).toBe(409)
	expect((await request(token, '/', 'POST', '{bad')).status).toBe(400)
	expect(
		(await request(token, '/', 'POST', JSON.stringify({ ...data, id: randomUUID(), size: MAX_UPLOAD_BYTES + 1 })))
			.status
	).toBe(400)
	expect(
		(await request(token, '/', 'POST', JSON.stringify({ ...data, id: randomUUID(), metadata: { x: 'bad' } }))).status
	).toBe(400)
	await initialize(token)
	expect((await request(token, '/', 'POST', JSON.stringify({ ...data, id: randomUUID() }))).status).toBe(429)
	database.query('UPDATE mod_uploads SET expires_at = 0 WHERE id = ?').run(id)
	expect((await request(token, `/${id}`)).status).toBe(404)
	await cleanupUploads()
	expect(existsSync(join(root, 'uploads', id))).toBe(false)
	expect(database.query('SELECT id FROM mod_uploads WHERE id = ?').get(id)).toBeNull()
})

test('checks chunk sizes, content types, offsets and the full-file checksum', async () => {
	const { token } = device()
	const id = await initialize(token)
	expect((await chunk(token, id, Buffer.alloc(0))).status).toBe(400)
	expect((await chunk(token, id, Buffer.alloc(UPLOAD_CHUNK_BYTES + 1))).status).toBe(400)
	expect(
		(await request(token, `/${id}`, 'PUT', 'bad', { 'upload-offset': '0', 'content-type': 'text/plain' })).status
	).toBe(415)
	expect((await chunk(token, id, minimalGlb(), UPLOAD_CHUNK_BYTES)).status).toBe(400)
	const invalid = Buffer.alloc(minimalGlb().length)
	expect((await chunk(token, id, invalid)).status).toBe(200)
	expect((await request(token, `/${id}/complete`, 'POST')).status).toBe(400)
	expect((await request(token, `/${id}`, 'DELETE')).status).toBe(200)
})

test('a 200 MiB GLB uploads in 50 bounded chunks and finalizes without a full-file buffer', async () => {
	const { owner, token } = device()
	const path = join(root, 'large.glb')
	const small = minimalGlb()
	const header = Buffer.from(small)
	header.writeUInt32LE(MAX_UPLOAD_BYTES, 8)
	const binHeader = Buffer.alloc(8)
	binHeader.writeUInt32LE(MAX_UPLOAD_BYTES - small.length - 8, 0)
	binHeader.writeUInt32LE(0x004e4942, 4)
	const file = await open(path, 'w')
	await file.write(header)
	await file.write(binHeader)
	await file.truncate(MAX_UPLOAD_BYTES)
	await file.close()
	const digest = createHash('sha256')
	for await (const bytes of createReadStream(path)) digest.update(bytes)
	const sha256 = digest.digest('hex')
	const id = randomUUID()
	const response = await request(token, '/', 'POST', JSON.stringify({ id, size: MAX_UPLOAD_BYTES, sha256 }))
	expect(response.status).toBe(201)
	let offset = 0
	for await (const bytes of createReadStream(path, { highWaterMark: UPLOAD_CHUNK_BYTES })) {
		const sent = await chunk(token, id, bytes, offset)
		expect(sent.status).toBe(200)
		offset += bytes.length
	}
	expect(offset).toBe(MAX_UPLOAD_BYTES)
	expect((await request(token, `/${id}/complete`, 'POST')).status).toBe(201)
	expect(statSync(join(root, 'objects', owner, `${id}.glb`)).size).toBe(MAX_UPLOAD_BYTES)
	expect(await validateUploadFile(join(root, 'objects', owner, `${id}.glb`), MAX_UPLOAD_BYTES, sha256)).toBe(true)
}, 30_000)

test('bounded body reader cancels oversized streams without Content-Length', async () => {
	let cancelled = false
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new Uint8Array(UPLOAD_CHUNK_BYTES + 1))
		},
		cancel() {
			cancelled = true
		},
	})
	const request = new Request('http://localhost/chunk', { method: 'PUT', body })
	expect(await readUploadChunk(request)).toBeNull()
	expect(cancelled).toBe(true)
	expect(await readUploadChunk(new Request('http://localhost'))).toBeNull()
})

test('a fresh API process resumes the persisted offset and finishes the same capture', async () => {
	const { owner, token } = device()
	const bytes = minimalGlb(Buffer.alloc(UPLOAD_CHUNK_BYTES))
	const id = await initialize(token, bytes)
	expect((await chunk(token, id, bytes.subarray(0, UPLOAD_CHUNK_BYTES))).status).toBe(200)
	const path = join(root, 'resume-source.glb')
	await Bun.write(path, bytes)
	const source = `
  const { app } = await import(${JSON.stringify(join(import.meta.dir, 'index.ts'))});
  const bytes = Buffer.from(await Bun.file(process.env.RESUME_SOURCE).arrayBuffer()).subarray(${UPLOAD_CHUNK_BYTES});
  const response = await app.request('/api/mod/uploads/' + process.env.RESUME_ID, {
   method: 'PUT', headers: { authorization: 'Bearer ' + process.env.RESUME_TOKEN, 'content-type': 'application/octet-stream', 'upload-offset': '${UPLOAD_CHUNK_BYTES}' }, body: bytes
  });
  const complete = await app.request('/api/mod/uploads/' + process.env.RESUME_ID + '/complete', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.RESUME_TOKEN } });
  console.log(JSON.stringify({ chunk: response.status, complete: complete.status }));
 `
	const child = Bun.spawn([process.execPath, '-e', source], {
		env: { ...process.env, RESUME_ID: id, RESUME_TOKEN: token, RESUME_SOURCE: path },
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const output = await new Response(child.stdout).text()
	expect(await child.exited).toBe(0)
	expect(JSON.parse(output)).toEqual({ chunk: 200, complete: 201 })
	expect(listMemories(owner)).toHaveLength(1)
})

test('storage failure keeps the resumable file and retries without duplicate memories', async () => {
	const { owner, token } = device()
	const bytes = minimalGlb()
	const id = await initialize(token, bytes)
	await chunk(token, id, bytes)
	await mkdir(join(root, 'objects'), { recursive: true })
	const target = join(root, 'objects', owner)
	await writeFile(target, 'temporary storage obstruction')
	expect((await request(token, `/${id}/complete`, 'POST')).status).toBe(503)
	expect(listMemories(owner)).toEqual([])
	expect(existsSync(join(root, 'uploads', id))).toBe(true)
	await rm(target)
	expect((await request(token, `/${id}/complete`, 'POST')).status).toBe(201)
	expect(listMemories(owner)).toHaveLength(1)
})

test('expiration removes an uncommitted object but preserves a completed memory', async () => {
	const { owner, token } = device()
	const bytes = minimalGlb()
	const pending = await initialize(token, bytes)
	await chunk(token, pending, bytes)
	const target = join(root, 'objects', owner)
	await mkdir(target, { recursive: true })
	await writeFile(join(target, `${pending}.glb`), bytes)
	database.query('UPDATE mod_uploads SET expires_at = 0, storage_started = 1 WHERE id = ?').run(pending)
	await cleanupUploads()
	expect(existsSync(join(target, `${pending}.glb`))).toBe(false)
	const complete = await initialize(token, bytes)
	await chunk(token, complete, bytes)
	await request(token, `/${complete}/complete`, 'POST')
	database.query('UPDATE mod_uploads SET expires_at = 0 WHERE id = ?').run(complete)
	await cleanupUploads()
	expect(existsSync(join(target, `${complete}.glb`))).toBe(true)
	expect(listMemories(owner)).toHaveLength(1)
})
