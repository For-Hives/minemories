import { promisify } from 'node:util'
import { gzip } from 'node:zlib'

const gzipAsync = promisify(gzip)
const MIN_COMPRESSED_BYTES = 1024

/** True when the client lists gzip (or `*`) with a non-zero quality. */
export function acceptsGzip(acceptEncoding: string | null | undefined): boolean {
	if (!acceptEncoding) return false
	return acceptEncoding.split(',').some(part => {
		const [name, ...parameters] = part.trim().toLowerCase().split(';')
		if (name !== 'gzip' && name !== '*') return false
		const quality = parameters.map(parameter => parameter.trim()).find(parameter => parameter.startsWith('q='))
		return quality === undefined || Number(quality.slice(2)) > 0
	})
}

/**
 * Tile and GLB bytes are highly repetitive (about 8× smaller at gzip level 4), so buffered responses are
 * compressed for clients that accept it. Digests and sizes stay those of the decoded bytes.
 */
export async function encodeBuffered(
	acceptEncoding: string | null | undefined,
	bytes: Uint8Array<ArrayBuffer>
): Promise<{ body: Uint8Array<ArrayBuffer>; headers: Record<string, string> }> {
	if (bytes.byteLength < MIN_COMPRESSED_BYTES || !acceptsGzip(acceptEncoding))
		return { body: bytes, headers: { Vary: 'Accept-Encoding' } }
	const body = new Uint8Array(await gzipAsync(bytes, { level: 4 }))
	return { body, headers: { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } }
}
