import type { CaptureAvailability, CaptureStorageAccess } from '@minemories/api-contract'
import { useCallback, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { useI18n } from '../i18n/I18n'
import { CaptureRestorationRequired, capturePollDelay } from '../lib/capture-file'
import { buttonLime } from './ui'

interface RestorationView {
	availability: CaptureAvailability
	busy: boolean
	error: boolean
}
interface PendingAction {
	signal: AbortSignal
	resolve: () => void
}
const stateTitles = {
	ready: 'Memory ready.',
	archiving: 'Archiving this memory…',
	cold: 'This memory is archived.',
	restoring: 'Restoring this memory…',
}
function revoked(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error.code === 'NOT_FOUND' || error.code === 'UNAUTHORIZED')
	)
}
function restorationMessage(view: RestorationView): string {
	if (!view.availability.restorationAvailable) return 'Restoration is temporarily unavailable. Please try again later.'
	if (view.busy || view.availability.state === 'restoring')
		return 'You can leave this page and return later while restoration continues.'
	return 'Restore this memory to open it. Restoration may take a while.'
}

export function useCaptureRestoration() {
	const [view, setView] = useState<RestorationView | null>(null)
	const active = useRef<AbortSignal | null>(null)
	const action = useRef<PendingAction | null>(null)
	const loadFile = useCallback(
		async <T,>(download: () => Promise<T>, access: CaptureStorageAccess, signal: AbortSignal) => {
			active.current = signal
			const show = (value: RestorationView | null) => {
				if (active.current === signal && !signal.aborted) setView(value)
			}
			function consent() {
				signal.throwIfAborted()
				return new Promise<void>((resolve, reject) => {
					const clear = () => {
						signal.removeEventListener('abort', abort)
						if (action.current?.signal === signal) action.current = null
					}
					const abort = () => {
						clear()
						reject(signal.reason)
					}
					action.current = {
						signal,
						resolve: () => {
							clear()
							resolve()
						},
					}
					signal.addEventListener('abort', abort, { once: true })
				})
			}
			async function advance(availability: CaptureAvailability, requested: boolean, needsConsent: boolean) {
				if (!availability.restorationAvailable) {
					await consent()
					return null
				}
				if (needsConsent) await consent()
				show({ availability, busy: true, error: false })
				if (!requested) return apiClient.captureStorage.restore(access, { signal })
				await capturePollDelay(availability.retryAfterSeconds, signal)
				return apiClient.captureStorage.status(access, { signal })
			}
			async function restore(initial: CaptureAvailability) {
				let availability = initial
				let requested = availability.state === 'restoring'
				let needsConsent = !requested
				let failed = false
				while (availability.state !== 'ready') {
					signal.throwIfAborted()
					show({ availability, busy: requested && availability.restorationAvailable, error: failed })
					try {
						// biome-ignore lint/performance/noAwaitInLoops: Each poll depends on the previous storage state and user action.
						const next = await advance(availability, requested, needsConsent)
						if (next === null) return
						availability = next
						requested = true
						needsConsent = false
						failed = false
					} catch (error) {
						checkFailure(error)
						failed = true
						requested = false
						needsConsent = true
					}
				}
			}
			function checkFailure(error: unknown) {
				signal.throwIfAborted()
				if (revoked(error)) throw new Error('This memory is unavailable or access was revoked.')
			}
			show(null)
			try {
				while (true) {
					try {
						// biome-ignore lint/performance/noAwaitInLoops: Download again only after every required part has been restored.
						const file = await download()
						show(null)
						return file
					} catch (error) {
						if (!(error instanceof CaptureRestorationRequired)) throw error
						await restore(error.availability)
					}
				}
			} catch (error) {
				show(null)
				throw error
			}
		},
		[]
	)
	const resume = () => {
		if (!action.current?.signal.aborted) action.current?.resolve()
	}
	return { view, load: loadFile, resume }
}

export function CaptureRestorationPanel({ view, onRestore }: { view: RestorationView | null; onRestore: () => void }) {
	const { t } = useI18n()
	if (!view) return null
	const { availability, busy, error } = view
	return (
		<div className="absolute inset-0 z-[5] grid place-items-center bg-night-soft/95 p-6">
			<div role="status" aria-live="polite" className="max-w-sm space-y-4 text-center text-[#e6eadc]">
				<h2>{t(busy ? 'Restoring this memory…' : stateTitles[availability.state])}</h2>
				<p>{t(restorationMessage(view))}</p>
				<progress
					className="w-full"
					aria-label={t('Restoration progress')}
					max={availability.totalObjects}
					value={availability.readyObjects}
				/>
				<p>
					{availability.readyObjects} / {availability.totalObjects} {t('parts ready')}
				</p>
				{error && <p role="alert">{t('Restoration could not be checked. Try again.')}</p>}
				{!busy && (
					<button type="button" className={buttonLime} onClick={onRestore}>
						{t(availability.restorationAvailable ? 'Restore memory' : 'Check again')}
					</button>
				)}
			</div>
		</div>
	)
}
