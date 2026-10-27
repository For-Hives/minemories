import type { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { CaptureReaders } from './capture-readers'
import { parseMetadata } from './memory-metadata'
import { type FramePart, TIMELAPSE_LEASE_MS, TimelapseCatalog } from './timelapse-catalog'
import { MAX_TIMELAPSE_CHUNK, splitTimelapseCapture } from './timelapse-chunks'

/** Providers must abort pending requests and streams when the signal fires. */
export interface TimelapseObjects {
	read(key: string, signal: AbortSignal): Promise<Readable>
	write(key: string, data: Buffer, signal: AbortSignal): Promise<void>
}
interface Runtime {
	now: () => number
	heartbeatMs: number
}
const runtime: Runtime = { now: Date.now, heartbeatMs: 30_000 }

function heartbeat(controller: AbortController, renew: () => void, options: Runtime) {
	let progress = options.now()
	const timer = setInterval(() => {
		try {
			if (options.now() - progress >= TIMELAPSE_LEASE_MS) throw new Error('Timelapse storage made no progress')
			renew()
		} catch (error) {
			controller.abort(error)
			clearInterval(timer)
		}
	}, options.heartbeatMs)
	timer.unref()
	return {
		progress: () => {
			progress = options.now()
		},
		close: () => clearInterval(timer),
	}
}

async function readPart(objects: TimelapseObjects, part: FramePart, signal: AbortSignal): Promise<Buffer> {
	if (!Number.isInteger(part.size) || part.size < 1 || part.size > MAX_TIMELAPSE_CHUNK)
		throw new Error('Invalid timelapse part size')
	const stream = await objects.read(part.objectKey, signal)
	const payload = Buffer.allocUnsafe(part.size)
	let length = 0
	try {
		for await (const chunk of stream) {
			signal.throwIfAborted()
			if (!(chunk instanceof Uint8Array) || chunk.byteLength > payload.length - length)
				throw new Error('Timelapse part exceeds its manifest')
			payload.set(chunk, length)
			length += chunk.byteLength
		}
		signal.throwIfAborted()
		if (length !== part.size || createHash('sha256').update(payload).digest('hex') !== part.sha256)
			throw new Error('Timelapse part failed integrity validation')
		return payload
	} finally {
		stream.destroy()
	}
}

/** Original uploads stay readable until a complete, verified chunk manifest commits. */
export class TimelapseFiles {
	private readonly catalog: TimelapseCatalog
	private readonly readers: CaptureReaders
	constructor(
		private readonly database: Database,
		private readonly objects: TimelapseObjects,
		private readonly options = runtime
	) {
		this.catalog = new TimelapseCatalog(database)
		this.readers = new CaptureReaders(database)
	}

	async convert(memoryId: string, parent?: AbortSignal): Promise<boolean> {
		parent?.throwIfAborted()
		this.catalog.collect(this.options.now())
		if (this.database.query("SELECT 1 FROM object_deletions WHERE generation != '' LIMIT 1").get()) return false
		const source = this.database.query('SELECT metadata_json FROM memories WHERE id=?').get(memoryId) as {
			metadata_json: string | null
		} | null
		if (!(source?.metadata_json && parseMetadata(source.metadata_json)?.worldId)) return false
		const lease = this.catalog.begin(memoryId, this.options.now())
		if (!lease) return false
		const controller = new AbortController(),
			signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal
		const beat = heartbeat(controller, () => this.catalog.renew(lease.id, this.options.now()), this.options)
		const attempted: Array<{ objectKey: string; size: number }> = []
		let committed = false
		try {
			const input = await this.objects.read(lease.original_key, signal),
				hash = createHash('sha256')
			for await (const chunk of splitTimelapseCapture(input, lease.size, signal)) {
				hash.update(chunk.data)
				const claim = this.catalog.claim(lease.id, chunk.sha256, chunk.size, this.options.now())
				if (claim.upload) {
					attempted.push({ objectKey: claim.objectKey, size: chunk.size })
					await this.objects.write(claim.objectKey, chunk.data, signal)
					this.catalog.stored(lease.id, claim.objectKey, this.options.now())
				} else {
					await readPart(this.objects, { objectKey: claim.objectKey, size: chunk.size, sha256: chunk.sha256 }, signal)
				}
				beat.progress()
			}
			signal.throwIfAborted()
			this.catalog.publish(lease.id, hash.digest('hex'), this.options.now())
			committed = true
			return true
		} finally {
			beat.close()
			controller.abort()
			this.catalog.abandon(lease.id)
			if (!committed)
				for (const chunk of attempted)
					this.catalog.discardWrite(chunk.objectKey, lease.user_id, chunk.size, this.options.now())
		}
	}

	async read(objectKey: string, signal = new AbortController().signal): Promise<Readable> {
		signal.throwIfAborted()
		const opened = this.catalog.open(objectKey, this.options.now())
		if (!opened) return await this.readOriginal(objectKey, signal)
		const controller = new AbortController()
		const beat = heartbeat(controller, () => this.catalog.renewReader(opened.id, this.options.now()), this.options)
		const body = Readable.from(this.replay(opened.manifest, controller.signal, beat.progress), { objectMode: false })
		const abort = () => controller.abort(signal.reason)
		const abortBody = () =>
			body.destroy(
				controller.signal.reason instanceof Error ? controller.signal.reason : new Error('Timelapse read aborted')
			)
		controller.signal.addEventListener('abort', abortBody, { once: true })
		signal.addEventListener('abort', abort, { once: true })
		body.once('close', () => {
			beat.close()
			signal.removeEventListener('abort', abort)
			controller.signal.removeEventListener('abort', abortBody)
			controller.abort()
			this.catalog.closeReader(opened.id)
		})
		if (signal.aborted) abort()
		return body
	}

	private async readOriginal(objectKey: string, parent: AbortSignal): Promise<Readable> {
		const id = this.readers.open(objectKey, this.options.now()),
			controller = new AbortController(),
			signal = AbortSignal.any([parent, controller.signal]),
			beat = heartbeat(controller, () => this.readers.renew(id, this.options.now()), this.options)
		let source: Readable | undefined, body: Readable | undefined
		const close = () => {
			beat.close()
			signal.removeEventListener('abort', abort)
			source?.destroy()
			this.readers.close(id)
			controller.abort()
		}
		const abort = () =>
			body?.destroy(signal.reason instanceof Error ? signal.reason : new Error('Capture read aborted'))
		signal.addEventListener('abort', abort, { once: true })
		try {
			source = await this.objects.read(objectKey, signal)
			signal.throwIfAborted()
			body = Readable.from(originalChunks(source, beat.progress), { objectMode: false })
			const result = body
			source.once('error', error => result.destroy(error))
			body.once('close', close)
			return body
		} catch (error) {
			close()
			throw error
		}
	}

	private async *replay(
		manifest: { parts: FramePart[]; size: number; sha256: string },
		signal: AbortSignal,
		progress: () => void
	) {
		const hash = createHash('sha256')
		let size = 0
		for (const [index, part] of manifest.parts.entries()) {
			// biome-ignore lint/performance/noAwaitInLoops: fetch at most one bounded chunk and preserve stream backpressure.
			const payload = await readPart(this.objects, part, signal)
			hash.update(payload)
			size += payload.length
			progress()
			if (index === manifest.parts.length - 1 && (size !== manifest.size || hash.digest('hex') !== manifest.sha256))
				throw new Error('Timelapse frame failed integrity validation')
			yield payload
		}
		signal.throwIfAborted()
	}
}

async function* originalChunks(source: Readable, progress: () => void) {
	for await (const chunk of source) {
		progress()
		yield chunk
	}
}
