import { type CaptureAvailability, captureAvailability } from '@minemories/api-contract'

export class CaptureRestorationRequired extends Error {
	constructor(readonly availability: CaptureAvailability) {
		super('This memory needs restoration before it can be opened.')
	}
}

export async function downloadCapture(url: string, name: string, signal: AbortSignal): Promise<File> {
	const response = await fetch(url, { credentials: 'include', signal })
	signal.throwIfAborted()
	await requireCaptureReady(response)
	if (!response.ok) throw new Error('This memory is unavailable or access was revoked.')
	const blob = await response.blob()
	signal.throwIfAborted()
	return new File([blob], name, { type: 'model/gltf-binary' })
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
