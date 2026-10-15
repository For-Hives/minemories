import { useEffect, useState } from 'react'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { T, useI18n } from '../i18n/I18n'

export function SharePanel({ memoryId }: { memoryId: string }) {
	const { t } = useI18n()

	const { notify } = useAppContext()
	const [status, setStatus] = useState<'checking' | 'off' | 'on'>('checking')
	const [url, setUrl] = useState('')
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		let live = true
		apiClient.memories
			.shareStatus({ id: memoryId })
			.then(result => {
				if (live) setStatus(result.shared ? 'on' : 'off')
			})
			.catch(() => {
				if (live) setStatus('off')
			})
		return () => {
			live = false
		}
	}, [memoryId])

	async function create() {
		setBusy(true)
		try {
			const link = await apiClient.memories.createShare({ id: memoryId })
			setUrl(`${window.location.origin}${link.urlPath}`)
			setStatus('on')
		} catch {
			notify('Could not create this link.')
		} finally {
			setBusy(false)
		}
	}

	async function revoke() {
		setBusy(true)
		try {
			await apiClient.memories.revokeShare({ id: memoryId })
			setStatus('off')
			setUrl('')
		} catch {
			notify('Could not stop sharing.')
		} finally {
			setBusy(false)
		}
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(url)
			notify('Link copied to the clipboard.')
		} catch {
			notify('Could not copy this link.')
		}
	}

	return (
		<div className="mt-3 rounded-[4px] border border-[#2a332d] bg-[#10150f] p-2" aria-live="polite">
			{status === 'checking' && (
				<p className="m-0 text-[10px] text-[#8e978a]">
					<T message={'Checking the link…'} />
				</p>
			)}
			{status === 'off' && (
				<>
					<p className="m-0 text-[10px] leading-[1.5] text-[#8e978a]">
						<T message={'Friends open the world without an account.'} />
					</p>
					<button
						type="button"
						onClick={() => void create()}
						disabled={busy}
						className="mt-2 inline-flex h-8 cursor-pointer items-center rounded-[4px] border border-[#354238] bg-transparent px-2 text-[11px] text-[#b4c1ad] disabled:opacity-60"
					>
						{busy ? '…' : t('Create a link')}
					</button>
				</>
			)}
			{status === 'on' && (
				<>
					{url ? (
						<span className="flex items-center gap-2">
							<input
								value={url}
								readOnly
								aria-label={t('Share link')}
								onFocus={event => event.currentTarget.select()}
								className="h-8 min-w-0 flex-1 rounded-[4px] border border-[#354238] bg-[#1c2720] px-2 font-mono text-[10px] text-ink outline-0"
							/>
							<button
								type="button"
								onClick={() => void copy()}
								className="h-8 flex-none cursor-pointer rounded-[4px] border border-[#354238] bg-transparent px-2 text-[11px] text-[#b4c1ad]"
							>
								{' '}
								<T message={'Copy'} />{' '}
							</button>
						</span>
					) : (
						<p className="m-0 text-[10px] leading-[1.5] text-[#8e978a]">
							<T message={'A link is active for this snapshot.'} />
						</p>
					)}
					<span className="mt-2 flex items-center gap-2">
						<button
							type="button"
							onClick={() => void create()}
							disabled={busy}
							title={t('Replace the active link with a new one')}
							className="inline-flex h-8 cursor-pointer items-center rounded-[4px] border border-transparent bg-transparent px-2 text-[11px] text-[#8e978a] hover:text-[#b4c1ad] disabled:opacity-60"
						>
							{' '}
							<T message={'New link'} />{' '}
						</button>
						<button
							type="button"
							onClick={() => void revoke()}
							disabled={busy}
							className="inline-flex h-8 cursor-pointer items-center rounded-[4px] border border-transparent bg-transparent px-2 text-[11px] text-[#8e978a] hover:text-[#e8a0a0] disabled:opacity-60"
						>
							{' '}
							<T message={'Stop sharing'} />{' '}
						</button>
					</span>
				</>
			)}
		</div>
	)
}
