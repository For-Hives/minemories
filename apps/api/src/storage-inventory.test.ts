import { afterAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const key = 'owner/11111111-1111-4111-8111-111111111111.glb'
const time = '2026-01-01T00:00:00.000Z'
let mode: 'pages' | 'empty' | 'cycle' | 'broken' | 'denied' | 'many' = 'pages'
let broken = ''
const requests: Array<{ method: string; token: string; keyMarker: string; uploadMarker: string }> = []

function xml(body: string) {
	return new Response(body, { headers: { 'content-type': 'application/xml' } })
}
function listingObject() {
	return `<Contents><Key>${key}</Key><Size>${broken === 'size' ? '-1' : '64'}</Size>${broken === 'object-date' ? '' : `<LastModified>${time}</LastModified>`}${broken === 'etag' ? '' : '<ETag>one</ETag>'}</Contents>`
}
function listingUpload(id: string, objectKey = key) {
	return `<Upload><Key>${objectKey}</Key>${broken === 'upload-id' ? '' : `<UploadId>${id}</UploadId>`}${broken === 'upload-date' ? '' : `<Initiated>${time}</Initiated>`}</Upload>`
}
function objects(url: URL) {
	if (mode === 'empty') return xml('<ListBucketResult/>')
	const again = mode === 'cycle' || !url.searchParams.get('continuation-token')
	const token = broken === 'object-token' ? '' : '<NextContinuationToken>page-two</NextContinuationToken>'
	return xml(
		`<ListBucketResult>${listingObject()}<IsTruncated>${again}</IsTruncated>${again ? token : ''}</ListBucketResult>`
	)
}
function uploads(url: URL) {
	if (mode === 'empty') return xml('<ListMultipartUploadsResult/>')
	if (mode === 'many')
		return xml(
			`<ListMultipartUploadsResult>${Array.from({ length: 1001 }, (_, id) => listingUpload(String(id))).join('')}</ListMultipartUploadsResult>`
		)
	const again = mode === 'cycle' || !url.searchParams.get('upload-id-marker')
	const keyMarker = broken === 'upload-key-marker' ? '' : `<NextKeyMarker>${key}</NextKeyMarker>`
	const uploadMarker = broken === 'upload-marker' ? '' : '<NextUploadIdMarker>attempt-one</NextUploadIdMarker>'
	return xml(
		`<ListMultipartUploadsResult>${listingUpload(again ? 'attempt-one' : 'attempt-two')}${listingUpload('foreign', `${key}-other`)}<IsTruncated>${again}</IsTruncated>${again ? keyMarker + uploadMarker : ''}</ListMultipartUploadsResult>`
	)
}
const server = Bun.serve({
	port: 0,
	fetch(request) {
		const url = new URL(request.url)
		requests.push({
			method: request.method,
			token: url.searchParams.get('continuation-token') ?? '',
			keyMarker: url.searchParams.get('key-marker') ?? '',
			uploadMarker: url.searchParams.get('upload-id-marker') ?? '',
		})
		if (mode === 'denied')
			return new Response('<Error><Code>AccessDenied</Code></Error>', {
				status: 403,
				headers: { 'content-type': 'application/xml' },
			})
		if (request.method === 'HEAD') {
			if (mode === 'empty') return new Response(null, { status: 404 })
			if (mode === 'broken' && broken === 'head-denied') return new Response(null, { status: 403 })
			return new Response(null, {
				headers: { 'content-length': '64', 'last-modified': new Date(time).toUTCString(), etag: 'one' },
			})
		}
		if (request.method !== 'GET') return new Response(null, { status: 400 })
		if (url.searchParams.has('list-type')) return objects(url)
		if (url.searchParams.has('uploads')) return uploads(url)
		return new Response(null, { status: 400 })
	},
})
process.env.S3_ENDPOINT = server.url.toString()
process.env.S3_BUCKET = 'inventory-fixture'
process.env.S3_REGION = 'garage'
const { FilesystemInventory, S3Inventory, storageInventory } = await import('./storage-inventory')
const directory = await mkdtemp(join(tmpdir(), 'minemories-inventory-'))
afterAll(async () => {
	server.stop(true)
	await rm(directory, { recursive: true, force: true })
})
function reset(next: typeof mode, invalid = '') {
	mode = next
	broken = invalid
	requests.length = 0
}
async function collect<T>(source: AsyncIterable<T> | Iterable<T>): Promise<T[]> {
	const entries: T[] = []
	for await (const entry of source) entries.push(entry)
	return entries
}

test('S3 inventories only metadata and keeps both multipart markers, including equal-key pages', async () => {
	reset('pages')
	const inventory = new S3Inventory()
	expect(await inventory.identity()).toMatch(/^[a-f0-9]{64}$/)
	const objects = await collect(inventory.objects('owner/'))
	expect(objects).toHaveLength(2)
	expect(objects[0]).toEqual({ key, size: 64, modified: new Date(time).getTime(), etag: 'one' })
	expect(requests.map(request => request.token)).toEqual(['', 'page-two'])
	requests.length = 0
	const parts = await collect(inventory.uploads('owner/'))
	expect(parts).toHaveLength(4)
	expect(requests.map(request => [request.keyMarker, request.uploadMarker])).toEqual([
		['', ''],
		[key, 'attempt-one'],
	])
	expect(requests.every(request => request.method === 'GET')).toBe(true)
})

test('S3 reinspection separates missing objects from failures and filters multipart prefix siblings', async () => {
	reset('pages')
	const inventory = new S3Inventory()
	const found = await inventory.inspect(key)
	expect(found.object?.size).toBe(64)
	expect(found.uploads.map(upload => upload.id)).toEqual(['attempt-one', 'attempt-two'])
	expect(requests.map(request => request.method)).toEqual(['HEAD', 'GET', 'GET'])
	reset('empty')
	expect(await inventory.inspect(key)).toEqual({ object: null, uploads: [] })
	expect(await collect(inventory.objects('owner/'))).toEqual([])
	reset('broken', 'head-denied')
	await expect(inventory.inspect(key)).rejects.toThrow()
	reset('many')
	await expect(inventory.inspect(key)).rejects.toThrow('Too many abandoned uploads')
})

test('S3 refuses cyclic/missing markers and invalid timestamps, sizes and identifiers', async () => {
	const inventory = new S3Inventory()
	reset('cycle')
	await expect(collect(inventory.objects('owner/'))).rejects.toThrow('pagination')
	reset('cycle')
	await expect(collect(inventory.uploads('owner/'))).rejects.toThrow('pagination')
	for (const invalid of ['object-token', 'size', 'object-date', 'etag']) {
		reset('broken', invalid)
		// biome-ignore lint/performance/noAwaitInLoops: One fixture mode per request sequence.
		await expect(collect(inventory.objects('owner/'))).rejects.toThrow('inventory')
	}
	for (const invalid of ['upload-key-marker', 'upload-marker', 'upload-id', 'upload-date']) {
		reset('broken', invalid)
		// biome-ignore lint/performance/noAwaitInLoops: One fixture mode per request sequence.
		await expect(collect(inventory.uploads('owner/'))).rejects.toThrow('inventory')
	}
	reset('denied')
	await expect(collect(inventory.objects('owner/'))).rejects.toThrow()
	await expect(collect(inventory.uploads('owner/'))).rejects.toThrow()
})

test('filesystem inventory records stable identity/metadata and scopes listings without reading GLB bytes', async () => {
	const root = join(directory, 'objects')
	await mkdir(join(root, 'owner', 'nested'), { recursive: true })
	await mkdir(join(root, 'other'))
	await writeFile(join(root, key), 'private-fixture')
	await writeFile(join(root, 'owner', 'nested', 'unknown-name'), 'nested')
	await writeFile(join(root, 'other', 'another.glb'), 'foreign')
	await writeFile(join(root, 'foreign-file'), 'root')
	const inventory = new FilesystemInventory(root)
	const identity = await inventory.identity()
	expect(identity).toMatch(/^[a-f0-9]{64}$/)
	expect(await inventory.identity()).toBe(identity)
	expect(await collect(inventory.uploads())).toEqual([])
	const scoped = await collect(inventory.objects('owner/'))
	expect(scoped.map(object => object.key).sort()).toEqual([key, 'owner/nested/unknown-name'].sort())
	expect(scoped.find(object => object.key === key)?.size).toBe(15)
	expect(await collect(inventory.objects(''))).toHaveLength(4)
	expect((await inventory.inspect(key)).object?.etag).toBe(scoped.find(object => object.key === key)?.etag)
	expect(await inventory.inspect('owner/missing.glb')).toEqual({ object: null, uploads: [] })
	process.env.STORAGE_DRIVER = 'filesystem'
	process.env.LOCAL_OBJECTS_PATH = root
	expect(storageInventory()).toBeInstanceOf(FilesystemInventory)
	delete process.env.STORAGE_DRIVER
	expect(storageInventory()).toBeInstanceOf(S3Inventory)
	process.env.STORAGE_DRIVER = 'invalid'
	expect(() => storageInventory()).toThrow('STORAGE_DRIVER')
	delete process.env.STORAGE_DRIVER
})

test('filesystem inventory never follows file or directory symlinks and refuses path escapes', async () => {
	const root = join(directory, 'links')
	const outside = join(directory, 'outside')
	await mkdir(root)
	await mkdir(outside)
	await writeFile(join(outside, 'protected'), 'untouched')
	await symlink(outside, join(root, 'owner'))
	const inventory = new FilesystemInventory(root)
	await expect(collect(inventory.objects(''))).rejects.toThrow('symbolic links')
	await expect(inventory.inspect('owner/protected')).rejects.toThrow('ancestors')
	await expect(inventory.inspect('../outside/protected')).rejects.toThrow('key')
	await expect(inventory.inspect(root)).rejects.toThrow('key')
	await expect(inventory.inspect('')).rejects.toThrow('key')
	await symlink(join(outside, 'protected'), join(root, 'link.glb'))
	await expect(inventory.inspect('link.glb')).rejects.toThrow('non-regular')
	expect(await readFile(join(outside, 'protected'), 'utf8')).toBe('untouched')
	await expect(new FilesystemInventory(join(directory, 'absent')).identity()).rejects.toThrow()
	await expect(new FilesystemInventory(join(outside, 'protected')).identity()).rejects.toThrow('directory')
})
