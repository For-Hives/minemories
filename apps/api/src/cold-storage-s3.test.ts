import { expect, test } from 'bun:test'
import { S3Client } from '@aws-sdk/client-s3'
import { migrateCaptureAccess } from './capture-access'
import { ColdStorageCatalog, type ColdStorageWork } from './cold-storage-catalog'
import { S3ColdStorageProvider } from './cold-storage-s3'
import type { ColdStorageTarget } from './cold-storage-target'
import { ColdStorageWorker } from './cold-storage-worker'
import { ORPHAN_GRACE_MS } from './storage-reconciliation'
import { temporalFixture } from './test-support/timelapse-fixture'
import type { TierCopy } from './tier-locations'
import { TierLocations } from './tier-locations'

const copySourcePrefix = /^\/?private\//
const NOW = 100 * 86_400_000
const sourceKey = 'owner/11111111-1111-4111-8111-111111111111.glb'
const targetKey = 'owner/tiers/22222222-2222-4222-8222-222222222222.glb'
const work: ColdStorageWork = {
	objectKey: sourceKey,
	operationId: 'operation',
	workerId: 'worker',
	state: 'archiving',
	attempts: 0,
}
const signal = new AbortController().signal
interface Stored {
	bytes: Buffer
	etag: string
	storageClass: string
}

function fixture(key = sourceKey, bytes: Buffer = Buffer.from([0, 1, 128, 255])) {
	const objects = new Map<string, Stored>([[key, { bytes, etag: '"original"', storageClass: 'STANDARD' }]])
	const requests: Array<{ method: string; path: string; headers: Headers; body: string }> = []
	const state: {
		versioning?: string | undefined
		restore?: string | undefined
		restoreError?: string | undefined
		copyMode?: string | undefined
		sourceHeaders: Record<string, string>
		targetHeaders: Record<string, string>
		copyBarrier?: Promise<void>
		copyEntered?: () => void
		copyWritten?: () => void
	} = { sourceHeaders: {}, targetHeaders: {} }
	function xml(body: string, status = 200, headers: Record<string, string> = {}) {
		return new Response(body, { status, headers: { 'content-type': 'application/xml', ...headers } })
	}
	function restore() {
		if (state.restoreError)
			return xml(
				`<Error><Code>${state.restoreError}</Code></Error>`,
				state.restoreError === 'RestoreAlreadyInProgress' ? 409 : 403
			)
		state.restore = 'ongoing-request="true"'
		return new Response(null, { status: 202 })
	}
	function head(path: string) {
		const object = objects.get(path)
		if (!object) return new Response(null, { status: 404 })
		return new Response(null, {
			headers: {
				'content-length': String(object.bytes.length),
				etag: object.etag,
				'x-amz-storage-class': object.storageClass,
				'content-type': 'model/gltf-binary',
				...(state.restore ? { 'x-amz-restore': state.restore } : {}),
				...(path === key ? state.sourceHeaders : state.targetHeaders),
			},
		})
	}
	async function copyRequest(request: Request, path: string) {
		const source = objects.get(
			decodeURIComponent(request.headers.get('x-amz-copy-source') ?? '').replace(copySourcePrefix, '')
		)
		if (
			!source ||
			state.copyMode === 'precondition' ||
			request.headers.get('x-amz-copy-source-if-match') !== source.etag
		)
			return xml('<Error><Code>PreconditionFailed</Code></Error>', 412)
		if (state.copyMode === 'embedded')
			return xml('<Error><Code>InternalError</Code><Message>Copy failed</Message></Error>')
		if (state.copyMode === 'empty') return xml('<CopyObjectResult/>')
		state.copyEntered?.()
		await state.copyBarrier
		objects.set(path, {
			bytes: Buffer.from(source.bytes),
			etag: '"copied"',
			storageClass: request.headers.get('x-amz-storage-class') ?? 'STANDARD',
		})
		state.copyWritten?.()
		if (state.copyMode === 'lost') return xml('<Error><Code>ServiceUnavailable</Code></Error>', 503)
		return xml(
			'<CopyObjectResult><ETag>&quot;copied&quot;</ETag><LastModified>2026-10-15T00:00:00Z</LastModified></CopyObjectResult>',
			200,
			state.copyMode === 'versioned' ? { 'x-amz-version-id': 'unexpected-version' } : {}
		)
	}
	const server = Bun.serve({
		port: 0,
		hostname: '127.0.0.1',
		async fetch(request) {
			const url = new URL(request.url),
				path = decodeURIComponent(url.pathname.slice('/private/'.length))
			requests.push({ method: request.method, path, headers: request.headers, body: await request.text() })
			if (url.searchParams.has('versioning'))
				return xml(
					`<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${state.versioning ? `<Status>${state.versioning}</Status>` : ''}</VersioningConfiguration>`
				)
			if (request.method === 'POST' && url.searchParams.has('restore')) return restore()
			if (request.method === 'HEAD') return head(path)
			if (request.method === 'PUT') return copyRequest(request, path)
			return xml('<Error><Code>UnexpectedRequest</Code></Error>', 400)
		},
	})
	const client = new S3Client({
		endpoint: server.url.toString(),
		region: 'auto',
		forcePathStyle: true,
		maxAttempts: 1,
		credentials: { accessKeyId: 'fixture', secretAccessKey: 'private-fixture' },
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED',
	})
	const target: ColdStorageTarget = {
		provider: 'r2',
		archiveClass: 'STANDARD_IA',
		bucket: 'private',
		region: 'auto',
		endpoint: server.url.origin,
	}
	const copy: TierCopy = { sourceKey: key, physicalKey: targetKey, userId: 'owner', size: bytes.length }
	return {
		objects,
		requests,
		state,
		client,
		target,
		copy,
		provider: () => new S3ColdStorageProvider(client, target, () => NOW),
		close: () => {
			client.destroy()
			server.stop(true)
		},
	}
}

test('real SDK sends conditional server-side R2 copies and verifies archive and restored generations without downloading GLBs', async () => {
	const f = fixture()
	try {
		expect(await f.provider().prepare(work, f.copy, signal)).toBe(true)
		await f.provider().copy(work, f.copy, signal)
		expect(f.objects.get(targetKey)?.bytes).toEqual(f.objects.get(sourceKey)?.bytes)
		const restore = {
			...f.copy,
			sourceKey: targetKey,
			physicalKey: 'owner/tiers/33333333-3333-4333-8333-333333333333.glb',
		}
		await f.provider().copy({ ...work, state: 'restoring' }, restore, signal)
		expect(f.objects.get(restore.physicalKey)?.storageClass).toBe('STANDARD')
		const copies = f.requests.filter(r => r.method === 'PUT')
		expect(copies).toHaveLength(2)
		expect(copies[0]?.headers.get('x-amz-copy-source-if-match')).toBe('"original"')
		expect(copies[0]?.headers.get('x-amz-metadata-directive')).toBe('COPY')
		expect(copies[0]?.headers.has('x-amz-acl')).toBe(false)
		expect(copies[0]?.headers.get('authorization')).toContain('AWS4-HMAC-SHA256')
		expect(f.requests.every(r => r.method === 'HEAD' || r.method === 'PUT')).toBe(true)
	} finally {
		f.close()
	}
})

test('AWS restore requests and polls a temporary copy, then requires a verified permanent STANDARD copy', async () => {
	const f = fixture(),
		restoreWork = { ...work, state: 'restoring' as const }
	try {
		f.target.provider = 'aws'
		f.target.archiveClass = 'DEEP_ARCHIVE'
		const source = f.objects.get(sourceKey)
		if (!source) throw new Error('Missing source')
		source.storageClass = 'DEEP_ARCHIVE'
		expect(await f.provider().prepare(restoreWork, f.copy, signal)).toBe(false)
		expect(f.requests.find(r => r.method === 'POST')?.body).toContain('<Days>1</Days>')
		expect(f.requests.find(r => r.method === 'POST')?.body).toContain('<Tier>Standard</Tier>')
		expect(await f.provider().prepare(restoreWork, f.copy, signal)).toBe(false)
		expect(f.requests.filter(r => r.method === 'POST')).toHaveLength(1)
		await expect(f.provider().copy(restoreWork, f.copy, signal)).rejects.toThrow('not ready')
		f.state.restore = `ongoing-request="false", expiry-date="${new Date(NOW + 86_400_000).toUTCString()}"`
		expect(await f.provider().prepare(restoreWork, f.copy, signal)).toBe(true)
		await f.provider().copy(restoreWork, f.copy, signal)
		expect(f.objects.get(targetKey)?.storageClass).toBe('STANDARD')
		for (const header of [
			'ongoing-request="false"',
			'ongoing-request="false", expiry-date="invalid"',
			`ongoing-request="false", expiry-date="${new Date(NOW + 1000).toUTCString()}"`,
		]) {
			f.state.restore = header
			// biome-ignore lint/performance/noAwaitInLoops: Each request must finish before changing this server’s injected fault.
			expect(await f.provider().prepare(restoreWork, f.copy, signal)).toBe(false)
		}
		f.state.restore = undefined
		f.state.restoreError = 'RestoreAlreadyInProgress'
		expect(await f.provider().prepare(restoreWork, f.copy, signal)).toBe(false)
		f.state.restoreError = 'AccessDenied'
		await expect(f.provider().prepare(restoreWork, f.copy, signal)).rejects.toThrow()
	} finally {
		f.close()
	}
})

test('invalid reservations, mismatched source metadata, versioning and cancellation fail before any remote copy', async () => {
	const f = fixture()
	try {
		for (const changes of [
			{ size: 0 },
			{ size: 200 * 1024 * 1024 + 1 },
			{ size: NaN },
			{ userId: 'other' },
			{ sourceKey: 'other/key.glb' },
			{ physicalKey: sourceKey },
			{ physicalKey: 'owner/44444444-4444-4444-8444-444444444444.glb' },
		]) {
			// biome-ignore lint/performance/noAwaitInLoops: Each request must finish before changing this server’s injected fault.
			await expect(f.provider().prepare(work, { ...f.copy, ...changes }, signal)).rejects.toThrow('reservation')
		}
		for (const headers of [
			{ 'content-length': '99' },
			{ etag: '' },
			{ 'x-amz-version-id': 'version' },
			{ 'x-amz-storage-class': 'GLACIER' },
		]) {
			f.state.sourceHeaders = headers
			// biome-ignore lint/performance/noAwaitInLoops: Each request must finish before changing this server’s injected fault.
			await expect(f.provider().copy(work, f.copy, signal)).rejects.toThrow('source')
		}
		f.state.sourceHeaders = {}
		f.target.provider = 'aws'
		for (const versioning of ['Enabled', 'Suspended']) {
			f.state.versioning = versioning
			// biome-ignore lint/performance/noAwaitInLoops: Each request must finish before changing this server’s injected fault.
			await expect(f.provider().prepare(work, f.copy, signal)).rejects.toThrow('versioning')
		}
		const count = f.requests.length
		await expect(f.provider().prepare(work, f.copy, AbortSignal.abort())).rejects.toThrow()
		expect(f.requests).toHaveLength(count)
		expect(f.requests.some(r => r.method === 'PUT')).toBe(false)
	} finally {
		f.close()
	}
})

test('SDK rejects embedded HTTP 200 errors, lost replies, failed preconditions and unverified destination HEAD responses', async () => {
	const f = fixture()
	try {
		for (const mode of ['embedded', 'empty', 'versioned', 'precondition', 'lost']) {
			f.state.copyMode = mode
			// biome-ignore lint/performance/noAwaitInLoops: Each request must finish before changing this server’s injected fault.
			await expect(f.provider().copy(work, f.copy, signal)).rejects.toThrow()
		}
		f.state.copyMode = undefined
		for (const headers of [
			{ 'content-length': '99' },
			{ etag: '"different"' },
			{ 'x-amz-storage-class': 'STANDARD' },
			{ 'x-amz-version-id': 'version' },
		]) {
			f.state.targetHeaders = headers
			// biome-ignore lint/performance/noAwaitInLoops: Each request must finish before changing this server’s injected fault.
			await expect(f.provider().copy(work, f.copy, signal)).rejects.toThrow('destination')
		}
	} finally {
		f.close()
	}
})

test('real network copy retries publish a new generation after a lost acknowledgement and restore it without stale writes winning', async () => {
	const files = await temporalFixture()
	let f: ReturnType<typeof fixture> | undefined
	try {
		migrateCaptureAccess(files.db)
		const memory = await files.add({})
		f = fixture(memory.key, files.data)
		const catalog = new ColdStorageCatalog(files.db),
			locations = new TierLocations(files.db)
		let now = NOW
		expect(catalog.beginArchive(memory.key, 90, now)).toBe(true)
		f.state.copyMode = 'lost'
		const worker = new ColdStorageWorker(catalog, f.provider(), () => now)
		await worker.maintain()
		const lateKey = f.requests.find(r => r.method === 'PUT')?.path
		expect(lateKey).toBeDefined()
		expect(locations.resolve(memory.key)).toBe(memory.key)
		expect(files.db.query('SELECT state,attempts FROM object_tiers').get()).toEqual({ state: 'archiving', attempts: 1 })
		expect(files.db.query('SELECT next_attempt_at FROM object_tier_garbage').get()).toEqual({
			next_attempt_at: NOW + ORPHAN_GRACE_MS,
		})
		now += 60_000
		f.state.copyMode = undefined
		await worker.maintain()
		expect(locations.resolve(memory.key)).not.toBe(lateKey)
		catalog.requestRestore([memory.key], now)
		await worker.maintain()
		if (lateKey) f.objects.set(lateKey, { bytes: Buffer.alloc(4, 99), etag: '"late"', storageClass: 'STANDARD_IA' })
		expect(f.objects.get(locations.resolve(memory.key))?.bytes).toEqual(files.data)
		expect(files.db.query('SELECT state FROM object_tiers').get()).toEqual({ state: 'hot' })
		await worker.stop()
	} finally {
		f?.close()
		await files.close()
	}
})

test('shutdown cancels a real SDK request while its remote copy finishes late into an unpublished generation', async () => {
	const files = await temporalFixture()
	let f: ReturnType<typeof fixture> | undefined
	let release = () => {}
	try {
		migrateCaptureAccess(files.db)
		const memory = await files.add({})
		f = fixture(memory.key, files.data)
		const catalog = new ColdStorageCatalog(files.db),
			locations = new TierLocations(files.db)
		const entered = Promise.withResolvers<void>(),
			written = Promise.withResolvers<void>(),
			barrier = Promise.withResolvers<void>()
		release = () => barrier.resolve()
		f.state.copyEntered = () => entered.resolve()
		f.state.copyWritten = () => written.resolve()
		f.state.copyBarrier = barrier.promise
		expect(catalog.beginArchive(memory.key, 90, NOW)).toBe(true)
		const worker = new ColdStorageWorker(catalog, f.provider(), () => NOW)
		const pass = worker.maintain()
		await entered.promise
		await worker.stop()
		await pass
		const unpublished = f.requests.find(r => r.method === 'PUT')?.path
		expect(unpublished).toBeDefined()
		expect(locations.resolve(memory.key)).toBe(memory.key)
		expect(files.db.query('SELECT state,attempts FROM object_tiers').get()).toEqual({ state: 'archiving', attempts: 1 })
		release()
		await written.promise
		expect(f.objects.get(unpublished ?? '')?.bytes).toEqual(files.data)
		expect(locations.resolve(memory.key)).toBe(memory.key)
		await new ColdStorageWorker(catalog, f.provider(), () => NOW + 60_000).maintain()
		expect(locations.resolve(memory.key)).not.toBe(unpublished)
		expect(f.objects.get(locations.resolve(memory.key))?.bytes).toEqual(files.data)
	} finally {
		release()
		f?.close()
		await files.close()
	}
})

test.each(['GLACIER', 'DEEP_ARCHIVE', 'STANDARD_IA'] as const)(
	'AWS %s archives and restores through the actual SDK without publishing temporary availability',
	async archiveClass => {
		const f = fixture()
		try {
			f.target.provider = 'aws'
			f.target.archiveClass = archiveClass
			expect(await f.provider().prepare(work, f.copy, signal)).toBe(true)
			await f.provider().copy(work, f.copy, signal)
			expect(f.objects.get(targetKey)?.storageClass).toBe(archiveClass)
			const restore = {
				...f.copy,
				sourceKey: targetKey,
				physicalKey: 'owner/tiers/33333333-3333-4333-8333-333333333333.glb',
			}
			const restoreWork = { ...work, state: 'restoring' as const }
			if (archiveClass !== 'STANDARD_IA') {
				expect(await f.provider().prepare(restoreWork, restore, signal)).toBe(false)
				f.state.restore = `ongoing-request="false", expiry-date="${new Date(NOW + 86_400_000).toUTCString()}"`
			}
			expect(await f.provider().prepare(restoreWork, restore, signal)).toBe(true)
			await f.provider().copy(restoreWork, restore, signal)
			expect(f.objects.get(restore.physicalKey)?.bytes).toEqual(f.objects.get(sourceKey)?.bytes)
			expect(f.objects.get(restore.physicalKey)?.storageClass).toBe('STANDARD')
			expect(f.requests.filter(r => r.method === 'POST')).toHaveLength(archiveClass === 'STANDARD_IA' ? 0 : 1)
		} finally {
			f.close()
		}
	}
)
