import type { MiddlewareHandler } from 'hono'

export const AUTH_BODY_BYTES = 16 * 1024
export const RPC_BODY_BYTES = 256 * 1024
export const UPLOAD_INIT_BODY_BYTES = 256 * 1024

export async function boundedRequest(request: Request, limit: number): Promise<Request | null> {
	if (Number(request.headers.get('content-length')) > limit) {
		await request.body?.cancel().catch(() => undefined)
		return null
	}
	if (!request.body) return request
	const reader = request.body.getReader()
	const chunks: Uint8Array[] = []
	let size = 0
	try {
		while (true) {
			// biome-ignore lint/performance/noAwaitInLoops: sequential reads enforce the byte limit before buffering.
			const { value, done } = await reader.read()
			if (done) break
			size += value.byteLength
			if (size > limit) {
				await reader.cancel().catch(() => undefined)
				return null
			}
			chunks.push(value)
		}
		const headers = new Headers(request.headers)
		headers.set('content-length', String(size))
		headers.delete('transfer-encoding')
		return new Request(request, { body: Buffer.concat(chunks, size), headers })
	} finally {
		reader.releaseLock()
	}
}

export function requestBodyLimit(limit: number): MiddlewareHandler {
	return async (context, next) => {
		let request: Request | null
		try {
			request = await boundedRequest(context.req.raw, limit)
		} catch {
			return context.json({ error: 'invalid_request_body' }, 400)
		}
		if (!request) return context.json({ error: 'request_body_too_large' }, 413)
		context.req.raw = request
		return next()
	}
}
