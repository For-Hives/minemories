import { useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
export type PairingStatus = 'idle' | 'pending' | 'paired' | 'expired' | 'error'

export function useGalleryPairing(notify: (message: string) => void, onError: (message: string) => void) {
	const [pairCode, setPairCode] = useState(''),
		[pairStatus, setPairStatus] = useState<PairingStatus>('idle'),
		[pairExpires, setPairExpires] = useState(''),
		[pairBusy, setPairBusy] = useState(false)
	const revision = useRef(0),
		creation = useRef<AbortController | null>(null)
	useEffect(() => {
		const controller = new AbortController(),
			version = ++revision.current
		void apiClient.pairing
			.status(undefined, { signal: controller.signal })
			.then(result => {
				if (version === revision.current && result.paired) setPairStatus('paired')
			})
			.catch(() => undefined)
		return () => {
			revision.current += 1
			controller.abort()
			creation.current?.abort()
		}
	}, [])
	useEffect(() => {
		if (!pairCode || pairStatus !== 'pending') return
		return watchPairing(pairCode, status => {
			setPairStatus(status)
			if (status === 'paired') notify('The mod is linked to your account. Send a capture from Minecraft.')
		})
	}, [pairCode, pairStatus, notify])
	async function createPairing() {
		if (pairBusy) return
		const version = ++revision.current,
			controller = new AbortController()
		creation.current = controller
		setPairBusy(true)
		setPairStatus('idle')
		setPairCode('')
		try {
			const pairing = await apiClient.pairing.create(undefined, { signal: controller.signal })
			if (version !== revision.current) return
			setPairCode(pairing.code)
			setPairExpires(new Date(pairing.expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
			setPairStatus('pending')
		} catch (error) {
			if (version !== revision.current) return
			setPairStatus('error')
			onError(error instanceof Error ? error.message : 'Could not create the code.')
		} finally {
			if (version === revision.current) setPairBusy(false)
		}
	}
	async function copyCode() {
		const version = revision.current
		try {
			await navigator.clipboard.writeText(pairCode)
			if (version === revision.current) notify('Code copied to the clipboard.')
		} catch {
			if (version === revision.current) notify('Could not copy this code.')
		}
	}
	return { pairCode, pairStatus, pairExpires, pairBusy, createPairing, copyCode }
}

function watchPairing(code: string, onStatus: (status: PairingStatus) => void) {
	const controller = new AbortController()
	let timer = 0
	async function poll() {
		try {
			const result = await apiClient.pairing.check({ code }, { signal: controller.signal })
			if (controller.signal.aborted) return
			if (result.status !== 'pending') {
				onStatus(result.status)
				return
			}
			timer = window.setTimeout(() => void poll(), 1600)
		} catch {
			if (!controller.signal.aborted) onStatus('error')
		}
	}
	timer = window.setTimeout(() => void poll(), 1100)
	return () => {
		controller.abort()
		window.clearTimeout(timer)
	}
}
