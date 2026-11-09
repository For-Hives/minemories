import { type CaptureAvailability, captureAvailability } from '@minemories/api-contract'
import { expandMeshoptGlb, VARIANT_HEADER, withMeshoptVariant } from './glb-meshopt'

export class CaptureRestorationRequired extends Error {
	constructor(readonly availability: CaptureAvailability) {
		super('This memory needs restoration before it can be opened.')
	}
}

/** Asks for the smaller Meshopt transport variant and hands back an ordinary GLB either way. */
export async function downloadCapture(url: string, name: string, signal: AbortSignal): Promise<File> {
	const response = await fetch(withMeshoptVariant(url), { credentials: 'include', signal })
	signal.throwIfAborted()
	await requireCaptureReady(response)
	if (!response.ok) throw new Error('This memory is unavailable or access was revoked.')
	const blob = await response.blob()
	signal.throwIfAborted()
	if (response.headers.get(VARIANT_HEADER) !== 'meshopt') return new File([blob], name, { type: 'model/gltf-binary' })
	const expanded = await expandMeshoptGlb(new Uint8Array(await blob.arrayBuffer()))
	signal.throwIfAborted()
	if (!expanded) throw new Error('This memory could not be decoded.')
	return new File([expanded as BlobPart], name, { type: 'model/gltf-binary' })
}

export function capturePollDelay(seconds: number | null, signal: AbortSignal): Promise<void> {
	signal.throwIfAborted()
	return new Promise((resolve, reject) => {
		const finish = () => {
			signal.removeEventListener('abort', abort)
			resolve()
		}
		const timer = setTimeout(finish, (seconds ?? 5) * 1000)
		const abort = () => {
			clearTimeout(timer)
			signal.removeEventListener('abort', abort)
			reject(signal.reason)
		}
		signal.addEventListener('abort', abort, { once: true })
	})
}

export async function requireCaptureReady(response: Response): Promise<void> {
	if (response.status === 202) {
		let availability: CaptureAvailability
		try {
			const body = await response.json()
			availability = captureAvailability.parse(body.availability)
		} catch {
			throw new Error('Restoration information could not be loaded. Try again.')
		}
		throw new CaptureRestorationRequired(availability)
	}
}

/** A safe `.glb` file name from a snapshot name: no path separators or control characters, never empty. */
export function captureFileName(name: string): string {
	const stem = name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\w.-]+/g, '-')
		.replace(/^[.-]+|[.-]+$/g, '')
		.slice(0, 60)
	return `${stem || 'snapshot'}.glb`
}
