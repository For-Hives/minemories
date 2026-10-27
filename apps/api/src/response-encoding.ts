import { pipeline, type Readable } from 'node:stream'
import { createGzip } from 'node:zlib'

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

/** Capture geometry is very repetitive: gzip in flight without ever buffering the whole GLB. */
export function encodedCapture(acceptEncoding: string | null | undefined, contents: Readable) {
	if (!acceptsGzip(acceptEncoding)) return { body: contents, headers: { Vary: 'Accept-Encoding' } }
	const gzip = createGzip({ level: 4 })
	pipeline(contents, gzip, () => undefined)
	return { body: gzip as Readable, headers: { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } }
}
