import { afterAll, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const enabled = process.env.RUN_GARAGE_INTEGRATION === '1'
const directory = mkdtempSync(join(tmpdir(), 'minemories-mod-garage-'))
if (enabled) {
	process.env.DATABASE_PATH = join(directory, 'test.sqlite')
	process.env.MOD_INDEX_CACHE_MS = '0'
	process.env.STORAGE_DRIVER = 'filesystem'
	process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
	process.env.MOD_STORAGE_BUCKET = `minemories-mods-integration-${Date.now()}`
	process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
	process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'
}
afterAll(() => rmSync(directory, { recursive: true, force: true }))

// The storage module is ESM JavaScript shared with the `bun mod` tool.
const storagePath = '../../../scripts/mod/storage/index.mjs'
interface ModStorage {
	storeRelease(options: Record<string, unknown>): Promise<unknown>
	setPinned(options: Record<string, unknown>): Promise<unknown>
	pruneStorage(options: Record<string, unknown>): Promise<{ deleted: { version: string }[] }>
	storageReport(options: Record<string, unknown>): Promise<{ perTarget: Record<string, { versions: number }> }>
}

test.skipIf(!enabled)('a real Garage: storage, index, download through the API, retention', async () => {
	const storage = (await import(storagePath)) as ModStorage
	const { app } = await import('./index')
	const id = 'fabric-mc1.21.11'
	const config = { targets: [{ id, loader: 'fabric', minecraft: '1.21.11', loaderVersion: '0.19.5', java: '21' }] }
	const hashes: Record<string, string> = {}
	for (const [n, size] of [
		[1, 1024],
		[2, 2048],
		[3, 4096],
		// Larger than one multipart part (8 MiB): exercises a real multipart upload.
		[4, 9 * 1024 * 1024],
	] as const) {
		const file = join(directory, `built-${n}.jar`)
		const body = Buffer.alloc(size, n)
		writeFileSync(file, body)
		hashes[`0.${n}.0`] = createHash('sha256').update(body).digest('hex')
		// biome-ignore lint/performance/noAwaitInLoops: versions must be stored one after another.
		await storage.storeRelease({
			config,
			version: `0.${n}.0`,
			commit: 'abc1234',
			builtAt: `2026-10-0${n}T00:00:00Z`,
			artifacts: [{ targetId: id, file, bytes: size, sha256: hashes[`0.${n}.0`] as string }],
			env: process.env,
		})
	}
	const index = await (await app.request('/downloads/index.json')).json()
	expect(index.targets[id].latest).toBe('0.4.0')
	expect(index.targets[id].versions).toHaveLength(4)

	const latest = await app.request(`/downloads/${id}/latest`)
	expect(latest.status).toBe(200)
	const bytes = Buffer.from(await latest.arrayBuffer())
	expect(createHash('sha256').update(bytes).digest('hex')).toBe(hashes['0.4.0'] ?? '')
	expect(latest.headers.get('content-disposition')).toBe(`attachment; filename="minemories-${id}-0.4.0.jar"`)
	const one = await app.request(`/downloads/${id}/0.1.0`)
	expect(
		createHash('sha256')
			.update(Buffer.from(await one.arrayBuffer()))
			.digest('hex')
	).toBe(hashes['0.1.0'] ?? '')
	expect((await app.request(`/downloads/${id}/9.9.9`)).status).toBe(404)

	await storage.setPinned({ targetId: id, version: '0.1.0', pinned: true, env: process.env })
	const dry = await storage.pruneStorage({ keep: 2, dryRun: true, env: process.env })
	expect([...new Set(dry.deleted.map(item => item.version))]).toEqual(['0.2.0'])
	await storage.pruneStorage({ keep: 2, dryRun: false, env: process.env })
	const pruned = await (await app.request('/downloads/index.json')).json()
	expect(pruned.targets[id].versions.map((item: { version: string }) => item.version)).toEqual([
		'0.4.0',
		'0.3.0',
		'0.1.0',
	])
	expect((await app.request(`/downloads/${id}/0.1.0`)).status).toBe(200)
	const report = await storage.storageReport({ env: process.env })
	expect(report.perTarget[id]?.versions).toBe(3)
})

test.skipIf(!enabled)(
	'a real Garage: upload through the PUT route, index, download, errors and retention',
	async () => {
		const { app } = await import('./index')
		const { makeJar, sha256Hex } = await import('./test-support/jar-fixture')
		const id = 'neoforge-mc1.21.1'
		const token = 'garage-upload-token-with-more-than-32-chars'
		process.env.MOD_UPLOAD_TOKEN = token
		process.env.MOD_STORAGE_KEEP = '2'
		const manifest = (version: string, day: number) =>
			Buffer.from(
				JSON.stringify({
					id,
					version,
					minecraft: '1.21.1',
					loader: 'neoforge',
					loaderVersion: '21.1.248',
					java: '21',
					commit: 'abcdef1',
					builtAt: `2026-10-0${day}T00:00:00.000Z`,
					builtBy: 'pc',
				})
			).toString('base64url')
		const put = (version: string, day: number, bytes: Buffer, headers: Record<string, string> = {}, query = '') =>
			app.request(`/downloads/upload/${id}/${version}${query}`, {
				method: 'PUT',
				body: bytes as unknown as BodyInit,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Length': String(bytes.length),
					'X-Content-SHA256': sha256Hex(bytes),
					'X-Mod-Manifest': manifest(version, day),
					...headers,
				},
			})

		const first = makeJar(['dev/minemories/One.class'])
		expect((await put('0.1.0', 1, first, { Authorization: `Bearer ${'z'.repeat(40)}` })).status).toBe(401)
		expect((await put('0.1.0', 1, first, { 'X-Content-SHA256': 'f'.repeat(64) })).status).toBe(422)
		expect((await put('0.1.0', 1, makeJar(['fabric.mod.json']))).status).toBe(422)

		const created = await put('0.1.0', 1, first)
		expect(created.status).toBe(200)
		expect(await created.json()).toEqual({
			ok: true,
			targetId: id,
			version: '0.1.0',
			sha256: sha256Hex(first),
			bytes: first.length,
			latest: true,
			replaced: false,
		})
		const again = await put('0.1.0', 1, first)
		expect(await again.json()).toMatchObject({ ok: true, replaced: false })
		const conflict = await put('0.1.0', 1, makeJar(['dev/minemories/Other.class']))
		expect(conflict.status).toBe(409)

		const second = makeJar(['dev/minemories/Two.class'])
		expect((await put('0.2.0', 2, second)).status).toBe(200)
		// Larger than one multipart part (8 MiB): real multipart upload through the route.
		const third = makeJar(['dev/minemories/Three.class'], 9 * 1024 * 1024)
		expect((await put('0.3.0', 3, third)).status).toBe(200)

		const index = await (await app.request('/downloads/index.json')).json()
		expect(index.targets[id].latest).toBe('0.3.0')
		expect(index.targets[id].versions.map((item: { version: string }) => item.version)).toEqual(['0.3.0', '0.2.0'])
		expect(index.targets[id].versions[0]).toMatchObject({ builtBy: 'pc', commit: 'abcdef1', bytes: third.length })
		expect(index.targets[id].loaderVersion).toBe('21.1.248')
		const latest = await app.request(`/downloads/${id}/latest`)
		expect(
			createHash('sha256')
				.update(Buffer.from(await latest.arrayBuffer()))
				.digest('hex')
		).toBe(sha256Hex(third))
		expect((await app.request(`/downloads/${id}/0.1.0`)).status).toBe(404)

		const replaced = await put('0.2.0', 2, makeJar(['dev/minemories/Two.class', 'x.txt']), {}, '?replace=1')
		expect(replaced.status).toBe(200)
		expect(await replaced.json()).toMatchObject({ replaced: true, latest: false })
		const storage = (await import(storagePath)) as ModStorage
		const report = await storage.storageReport({ env: process.env })
		expect(report.perTarget[id]?.versions).toBe(2)
	}
)

test.skipIf(!enabled)('a real Garage: same bucket as captures, foreign objects, public-mods/ prefix', async () => {
	const { ListObjectsV2Command, PutObjectCommand } = await import('@aws-sdk/client-s3')
	const { s3Target } = await import('./storage-s3')
	const { uploadS3Memory } = await import('./storage-s3')
	const { createModDownloads, createS3ModSource } = await import('./mod-downloads')
	const { createModUploads } = await import('./mod-upload')
	const { makeJar, sha256Hex } = await import('./test-support/jar-fixture')
	const { Hono } = await import('hono')
	const { client, bucket } = s3Target()
	const prefix = 'public-mods/'
	const id = 'forge-mc1.21.1'
	const token = 'garage-prefix-token-with-more-than-32-chars'
	const env = {
		...process.env,
		MOD_STORAGE_BUCKET: bucket,
		MOD_STORAGE_PREFIX: prefix,
		MOD_UPLOAD_TOKEN: token,
		MOD_STORAGE_KEEP: '2',
	}

	// Foreign objects in the SAME bucket: real captures (the API's write path), cold tiers, traps.
	const capture = Buffer.from('glTF-capture')
	await uploadS3Memory('owner1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.glb', capture, capture.length)
	const foreign: Record<string, string> = {
		'owner1/tiers/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.glb': 'tier',
		'users/u/1.glb': 'user',
		'public-mods../x': 'trap-dotdot',
		'public-modsx/mods/note.txt': 'trap-sibling',
		[`mods/${id}/0.1.0/minemories-${id}-0.1.0.jar`]: 'trap-unprefixed-mod',
	}
	await Promise.all(
		Object.entries(foreign).map(([Key, text]) =>
			client.send(new PutObjectCommand({ Bucket: bucket, Key, Body: Buffer.from(text) }))
		)
	)
	const listPage = async (Prefix: string | undefined, ContinuationToken?: string): Promise<string[]> => {
		const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix, ContinuationToken }))
		const keys = (page.Contents ?? []).map(item => `${item.Key}:${item.Size}`)
		return page.IsTruncated && page.NextContinuationToken
			? [...keys, ...(await listPage(Prefix, page.NextContinuationToken))]
			: keys
	}
	const listAll = async (Prefix?: string) => (await listPage(Prefix)).sort()
	const outside = async () => (await listAll()).filter(entry => !entry.startsWith(prefix))
	const before = await outside()
	expect(before.length).toBeGreaterThanOrEqual(6)

	const uploads = new Hono()
	uploads.route('/upload', createModUploads({ env: () => env, client: () => client }))
	const downloads = new Hono()
	downloads.route(
		'/',
		createModDownloads(() => createS3ModSource(bucket), 0, prefix)
	)
	const manifest = (version: string, day: number) =>
		Buffer.from(
			JSON.stringify({
				id,
				version,
				minecraft: '1.21.1',
				loader: 'forge',
				loaderVersion: '52.1.19',
				java: '21',
				commit: 'abcdef1',
				builtAt: `2026-10-0${day}T00:00:00.000Z`,
				builtBy: 'pc',
			})
		).toString('base64url')
	const jars: Record<string, Buffer> = {}
	const put = (version: string, day: number, bytes: Buffer) => {
		jars[version] = bytes
		return uploads.request(`/upload/${id}/${version}`, {
			method: 'PUT',
			body: bytes as unknown as BodyInit,
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Length': String(bytes.length),
				'X-Content-SHA256': sha256Hex(bytes),
				'X-Mod-Manifest': manifest(version, day),
			},
		})
	}
	expect((await put('0.1.0', 1, makeJar(['dev/minemories/One.class']))).status).toBe(200)
	expect((await put('0.2.0', 2, makeJar(['dev/minemories/Two.class']))).status).toBe(200)
	// Larger than one multipart part (8 MiB): real multipart under the prefix.
	expect((await put('0.3.0', 3, makeJar(['dev/minemories/Three.class'], 9 * 1024 * 1024))).status).toBe(200)

	// Everything written is under the prefix; the rest of the bucket is intact byte for byte.
	const mine = await listAll(prefix)
	expect(mine.some(entry => entry.startsWith(`${prefix}index.json:`))).toBe(true)
	expect(mine.some(entry => entry.startsWith(`${prefix}latest/${id}.jar:`))).toBe(true)
	expect(await outside()).toEqual(before)

	// Retention (2 versions): 0.1.0 deleted under the prefix only, including the root "mods/<id>/0.1.0/" trap.
	const index = await (await downloads.request('/index.json')).json()
	expect(index.targets[id].versions.map((item: { version: string }) => item.version)).toEqual(['0.3.0', '0.2.0'])
	expect(index.targets[id].versions[0].key).toBe(`mods/${id}/0.3.0/minemories-${id}-0.3.0.jar`)
	expect(mine.some(entry => entry.includes('/0.1.0/'))).toBe(false)

	const latest = await downloads.request(`/${id}/latest`)
	expect(latest.status).toBe(200)
	expect(Buffer.from(await latest.arrayBuffer()).equals(jars['0.3.0'] as Buffer)).toBe(true)
	const second = await downloads.request(`/${id}/0.2.0`)
	expect(Buffer.from(await second.arrayBuffer()).equals(jars['0.2.0'] as Buffer)).toBe(true)
	expect((await downloads.request(`/${id}/0.1.0`)).status).toBe(404)

	// The same index read without a prefix does not see the mods: they are not at the bucket root.
	const bare = new Hono()
	bare.route(
		'/',
		createModDownloads(() => createS3ModSource(bucket), 0, '')
	)
	const bareIndex = await (await bare.request('/index.json')).json()
	expect(bareIndex.targets[id]).toBeUndefined()
	expect(await outside()).toEqual(before)
})
