import { isIP } from 'node:net'

const WINDOW_MS = 60_000
const MAX_ADDRESSES = 4096
const MAX_BODY_BYTES = 2048

export class PairingAttemptLimiter {
	private readonly windows = new Map<string, { startedAt: number; requests: number }>()
	private lastCleanup = 0

	allow(address: string, now: number): boolean {
		if (now - this.lastCleanup >= WINDOW_MS) {
			for (const [key, window] of this.windows) {
				if (now - window.startedAt >= WINDOW_MS) this.windows.delete(key)
			}
			this.lastCleanup = now
		}
		const window = this.windows.get(address)
		if (!window || now - window.startedAt >= WINDOW_MS) {
			if (!window && this.windows.size >= MAX_ADDRESSES) return false
			this.windows.set(address, { startedAt: now, requests: 1 })
			return true
		}
		if (window.requests >= 8) return false
		window.requests += 1
		return true
	}
}

export function pairingAddress(peerAddress: string | undefined, headers: Headers, trustedProxies: Set<string>): string {
	const peer = peerAddress ?? 'unknown'
	if (!(peerAddress && trustedProxies.has(peer))) return peer
	// The immediate trusted proxy must append or overwrite the client address, never pass the header unchanged.
	const forwarded = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
	return forwarded && isIP(forwarded) ? forwarded : peer
}

export async function readPairingBody(request: Request): Promise<{ tooLarge: boolean; value: unknown }> {
	if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
		await request.body?.cancel()
		return { tooLarge: true, value: null }
	}
	if (!request.body) return { tooLarge: false, value: null }
	const reader = request.body.getReader()
	const chunks: Uint8Array[] = []
	let size = 0
	try {
		while (true) {
			// biome-ignore lint/performance/noAwaitInLoops: sequential reading enforces the body memory limit.
			const { value, done } = await reader.read()
			if (done) break
			size += value.length
			if (size > MAX_BODY_BYTES) {
				await reader.cancel()
				return { tooLarge: true, value: null }
			}
			chunks.push(value)
		}
		try {
			return { tooLarge: false, value: JSON.parse(Buffer.concat(chunks, size).toString('utf8')) }
		} catch {
			return { tooLarge: false, value: null }
		}
	} finally {
		reader.releaseLock()
	}
}
