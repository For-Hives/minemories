import { useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { T, useI18n } from '../i18n/I18n'
import { buttonDark, buttonQuiet } from './ui'
// The panel also opens in the gallery's side sheet: its rules travel with it.
import './viewer-studio.css'

export function SharePanel({ memoryId }: { memoryId: string }) {
	const { t } = useI18n()

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

	async function copyLink() {
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
			<h3>{t('Share by link')}</h3>
			<p>{t('Anyone with the link can visit without an account. This memory stays out of the public gallery.')}</p>
			{status === 'error' && <p role="alert">{t('Could not check sharing. Close and reopen this panel to retry.')}</p>}
			{status === 'checking' && (
				<p>
					<T message={'Checking the link…'} />
				</p>
			)}
			{status === 'off' && (
				<>
					<p>
						<T message={'Friends open the world without an account.'} />
					</p>
					<button type="button" onClick={() => void create()} disabled={busy} className={buttonDark}>
						{busy ? '…' : t('Create a link')}
					</button>
				</>
			)}
			{status === 'on' && (
				<>
					{url ? (
						<span className="memory-share-row">
							<input
								value={url}
								readOnly
								aria-label={t('Share link')}
								onFocus={event => event.currentTarget.select()}
								className="mc-field memory-share-url"
							/>
							<button type="button" onClick={() => void copyLink()} className={buttonDark}>
								{' '}
								<T message={'Copy'} />{' '}
							</button>
						</span>
					) : (
						<p>
							{t(
								'A link is active. Use your saved copy to retrieve it. Creating a new link will disable the previous one.'
							)}
						</p>
					)}
					{url && (
						<a href={url} target="_blank" rel="noreferrer">
							{t('Open link ↗')}
						</a>
					)}
					<span className="memory-share-row">
						<button
							type="button"
							onClick={() => void create()}
							disabled={busy}
							title={t('Replace the active link with a new one')}
							className={buttonQuiet}
						>
							{' '}
							{t('Replace active link')}{' '}
						</button>
						<button
							type="button"
							onClick={() => void revoke()}
							disabled={busy}
							className={`${buttonQuiet} memory-share-stop`}
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
