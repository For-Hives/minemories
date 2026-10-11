import { afterAll, expect, test } from 'bun:test'

const key = 'owner/capture.glb'
const aborted: string[] = []
const deleted: string[] = []
const markers: string[][] = []
let mode: 'pages' | 'empty' | 'cycle' | 'missing-marker' | 'missing-id' | 'denied' = 'pages'
let pageCount = 0

function xml(body: string) {
	return new Response(body, { headers: { 'content-type': 'application/xml' } })
}

function upload(objectKey: string, id?: string) {
	return `<Upload><Key>${objectKey}</Key>${id ? `<UploadId>${id}</UploadId>` : ''}</Upload>`
}

function listUploads(url: URL) {
	expect(url.searchParams.get('prefix')).toBe(key)
	markers.push([url.searchParams.get('key-marker') ?? '', url.searchParams.get('upload-id-marker') ?? ''])
	pageCount++
	if (mode === 'empty') return xml('<ListMultipartUploadsResult/>')
	if (mode === 'missing-id') return xml(`<ListMultipartUploadsResult>${upload(key)}</ListMultipartUploadsResult>`)
	if (mode === 'denied')
		return xml(`<ListMultipartUploadsResult>${upload(key, 'protected-id')}</ListMultipartUploadsResult>`)
	if (mode === 'missing-marker')
		return xml('<ListMultipartUploadsResult><IsTruncated>true</IsTruncated></ListMultipartUploadsResult>')
	const truncated = mode === 'cycle' || pageCount < 3
	const marker = mode === 'cycle' ? 'same-id' : `part-${pageCount}`
	return xml(
		`<ListMultipartUploadsResult><IsTruncated>${truncated}</IsTruncated>${upload(key, `attempt-${pageCount}`)}${upload(`${key}-other`, 'foreign-id')}${truncated ? `<NextKeyMarker>${key}</NextKeyMarker><NextUploadIdMarker>${marker}</NextUploadIdMarker>` : ''}</ListMultipartUploadsResult>`
	)
}

const server = Bun.serve({
	port: 0,
	fetch(request) {
		const url = new URL(request.url)
		if (request.method === 'HEAD') return new Response(null)
		if (request.method === 'GET' && url.searchParams.has('uploads')) return listUploads(url)
		if (request.method === 'DELETE' && url.searchParams.has('uploadId')) {
			expect(url.pathname).toBe(`/minemories/${key}`)
			if (mode === 'denied') return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })
			aborted.push(url.searchParams.get('uploadId') ?? '')
			return new Response(null, { status: 204 })
		}
		if (request.method === 'DELETE') {
			deleted.push(url.pathname)
			return new Response(null, { status: 204 })
		}
		return new Response('Unexpected S3 request', { status: 400 })
	},
})
process.env.STORAGE_DRIVER = 's3'
process.env.S3_ENDPOINT = server.url.toString()
process.env.S3_BUCKET = 'minemories'
process.env.S3_REGION = 'garage'
const { discardMemoryUpload } = await import('./storage')
afterAll(() => server.stop(true))

function reset(next: typeof mode) {
	mode = next
	pageCount = 0
	aborted.length = 0
	deleted.length = 0
	markers.length = 0
}

test('cleanup traverses both markers for one key and leaves prefix siblings untouched', async () => {
	reset('pages')
	await discardMemoryUpload(key)
	expect(aborted).toEqual(['attempt-1', 'attempt-2', 'attempt-3'])
	expect(markers).toEqual([
		['', ''],
		[key, 'part-1'],
		[key, 'part-2'],
	])
	expect(deleted).toEqual([`/minemories/${key}`])
})

test('cleanup also removes an object after an empty incomplete-upload listing', async () => {
	reset('empty')
	await discardMemoryUpload(key)
	expect(aborted).toEqual([])
	expect(deleted).toEqual([`/minemories/${key}`])
})

test('cyclic and missing continuation markers fail without deleting the object', async () => {
	reset('cycle')
	await expect(discardMemoryUpload(key)).rejects.toThrow('Invalid S3 multipart pagination.')
	expect(pageCount).toBe(2)
	expect(deleted).toEqual([])
	reset('missing-marker')
	await expect(discardMemoryUpload(key)).rejects.toThrow('Invalid S3 multipart pagination.')
	expect(deleted).toEqual([])
})

test('an invalid upload identifier or refused abort retains the object for a later retry', async () => {
	reset('missing-id')
	await expect(discardMemoryUpload(key)).rejects.toThrow('Invalid S3 multipart upload identifier.')
	expect(deleted).toEqual([])
	reset('denied')
	await expect(discardMemoryUpload(key)).rejects.toThrow()
	expect(aborted).toEqual([])
	expect(deleted).toEqual([])
})
