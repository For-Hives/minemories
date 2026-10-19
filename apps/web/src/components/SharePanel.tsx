import { useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { T, useI18n } from '../i18n/I18n'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'

export function SharePanel({ memoryId }: { memoryId: string }) {
	const { t } = useI18n()
	const { copy: localized } = useLocalizedCopy()

	const { notify } = useAppContext()
	const revision = useRef(0)
	const [status, setStatus] = useState<'checking' | 'off' | 'on' | 'error'>('checking')
	const [url, setUrl] = useState('')
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		const version = ++revision.current
		setStatus('checking')
		setUrl('')
		setBusy(false)
		apiClient.memories
			.shareStatus({ id: memoryId })
			.then(result => {
				if (version === revision.current) {
					setStatus(result.shared ? 'on' : 'off')
					if (result.urlPath) setUrl(`${window.location.origin}${result.urlPath}`)
				}
			})
			.catch(() => {
				if (version === revision.current) setStatus('error')
			})
		return () => {
			revision.current += 1
		}
	}, [memoryId])

	async function create() {
		if (busy) return
		const version = revision.current
		setBusy(true)
		try {
			const link = await apiClient.memories.createShare({ id: memoryId })
			if (version !== revision.current) return
			setUrl(`${window.location.origin}${link.urlPath}`)
			setStatus('on')
		} catch {
			if (version === revision.current) notify('Could not create this link.')
		} finally {
			if (version === revision.current) setBusy(false)
		}
	}

	async function revoke() {
		if (busy) return
		const version = revision.current
		setBusy(true)
		try {
			await apiClient.memories.revokeShare({ id: memoryId })
			if (version !== revision.current) return
			setStatus('off')
			setUrl('')
		} catch {
			if (version === revision.current) notify('Could not stop sharing.')
		} finally {
			if (version === revision.current) setBusy(false)
		}
	}

	async function copy() {
		const version = revision.current
		try {
			await navigator.clipboard.writeText(url)
			if (version === revision.current) notify('Link copied to the clipboard.')
		} catch {
			if (version === revision.current) notify('Could not copy this link.')
		}
	}

	return (
		<div className="memory-share-panel" aria-live="polite">
			<h3>{localized('Partager par lien', 'Share by link')}</h3>
			<p>
				{localized(
					'Accessible sans compte à toute personne possédant le lien. Ce souvenir reste absent de la galerie publique.',
					'Anyone with the link can visit without an account. This memory stays out of the public gallery.'
				)}
			</p>
			{status === 'error' && (
				<p role="alert">
					{localized(
						'Impossible de vérifier le partage. Ferme puis rouvre ce panneau pour réessayer.',
						'Could not check sharing. Close and reopen this panel to retry.'
					)}
				</p>
			)}
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
							{localized(
								'Un lien est actif. Pour le retrouver, utilise la copie que tu as conservée. Créer un nouveau lien désactivera le précédent.',
								'A link is active. Use your saved copy to retrieve it. Creating a new link will disable the previous one.'
							)}
						</p>
					)}
					{url && (
						<a href={url} target="_blank" rel="noreferrer">
							{localized('Ouvrir le lien ↗', 'Open link ↗')}
						</a>
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
							{localized('Remplacer le lien actif', 'Replace active link')}{' '}
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
