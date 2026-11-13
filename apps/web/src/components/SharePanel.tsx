import { useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { T, useI18n } from '../i18n/I18n'
import { type ViewLink, withViewLink } from '../lib/view-link'
import { GalleryIcon } from './GalleryIcons'
import { buttonDark, buttonQuiet } from './ui'
// The panel also opens in the gallery's side sheet: its rules travel with it.
import './viewer-studio.css'

type Scope = 'memory' | 'world'
type Status = 'checking' | 'off' | 'on' | 'error'

/** One kind of link for one snapshot: its status, the address when known, and the actions that change it. */
function useShare(memoryId: string, scope: Scope) {
	const { notify } = useAppContext()
	const revision = useRef(0)
	const [status, setStatus] = useState<Status>('checking')
	const [url, setUrl] = useState('')
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		const version = ++revision.current
		setStatus('checking')
		setUrl('')
		setBusy(false)
		apiClient.memories
			.shareStatus({ id: memoryId, scope })
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
	}, [memoryId, scope])

	async function create() {
		if (busy) return
		const version = revision.current
		setBusy(true)
		try {
			const link = await apiClient.memories.createShare({ id: memoryId, scope })
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
			await apiClient.memories.revokeShare({ id: memoryId, scope })
			if (version !== revision.current) return
			setStatus('off')
			setUrl('')
		} catch {
			if (version === revision.current) notify('Could not stop sharing.')
		} finally {
			if (version === revision.current) setBusy(false)
		}
	}

	async function copyLink(text = url) {
		const version = revision.current
		try {
			await navigator.clipboard.writeText(text)
			if (version === revision.current) notify('Link copied to the clipboard.')
		} catch {
			if (version === revision.current) notify('Could not copy this link.')
		}
	}

	return { status, url, busy, create, revoke, copyLink }
}

type Share = ReturnType<typeof useShare>

/** Snapshot or whole world: two links that live side by side; the icon says which, a dot says which one is live. */
function ScopeSwitch({
	scope,
	onScope,
	live,
}: {
	scope: Scope
	onScope(scope: Scope): void
	live: Record<Scope, boolean>
}) {
	const { t } = useI18n()
	const options: [Scope, 'cube' | 'layers', string][] = [
		['memory', 'cube', t('Snapshot')],
		['world', 'layers', t('World')],
	]
	return (
		<fieldset className="memory-share-scopes" aria-label={t('Link to')}>
			{options.map(([value, icon, label]) => (
				<button
					key={value}
					type="button"
					className="memory-share-scope"
					aria-pressed={scope === value}
					data-live={live[value]}
					aria-label={live[value] ? `${label} · ${t('Link active')}` : label}
					onClick={() => onScope(value)}
				>
					<GalleryIcon name={icon} />
					{label}
				</button>
			))}
		</fieldset>
	)
}

/** Whether the copied link carries the current view, and the link it then gives. */
interface ViewChoice {
	include: boolean
	onInclude(include: boolean): void
	link(url: string): string
}

function ViewToggle({ choice }: { choice: ViewChoice }) {
	const { t } = useI18n()
	return (
		<label className="mm-checkbox memory-share-view">
			<input type="checkbox" checked={choice.include} onChange={event => choice.onInclude(event.target.checked)} />
			<span>
				{t('Include this view')}
				<small>{t('Camera, time of day, weather and layers, as on your screen now.')}</small>
			</span>
		</label>
	)
}

function ShareBody({ scope, share, view }: { scope: Scope; share: Share; view?: ViewChoice | undefined }) {
	const { t } = useI18n()
	const { status, busy, create, revoke, copyLink } = share
	const url = share.url && view ? view.link(share.url) : share.url
	return (
		<>
			{status === 'error' && <p role="alert">{t('Could not check sharing. Close and reopen this panel to retry.')}</p>}
			{status === 'checking' && (
				<p>
					<T message={'Checking the link…'} />
				</p>
			)}
			{status === 'off' && (
				<>
					<p>{scope === 'world' ? t('Every snapshot, as the world grows.') : t('This moment only.')}</p>
					<button type="button" onClick={() => void create()} disabled={busy} className={buttonDark}>
						{busy ? '…' : t('Create a link')}
					</button>
				</>
			)}
			{status === 'on' && (
				<>
					{view && share.url && <ViewToggle choice={view} />}
					{url ? (
						<span className="memory-share-row">
							<input
								value={url}
								readOnly
								aria-label={t('Share link')}
								onFocus={event => event.currentTarget.select()}
								className="mc-field memory-share-url"
							/>
							<button
								type="button"
								onClick={() => void copyLink(view ? view.link(share.url) : url)}
								className={buttonDark}
							>
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
		</>
	)
}

/**
 * `view`, from the viewer, reads the current view so the link can reopen it (camera, hour, weather, layers and, for
 * a world link, this snapshot); the gallery's side sheet has none and shares plain links.
 */
export function SharePanel({ memoryId, view }: { memoryId: string; view?: () => ViewLink }) {
	const { t } = useI18n()
	const [scope, setScope] = useState<Scope>('memory')
	const [include, setInclude] = useState(true)
	const memory = useShare(memoryId, 'memory')
	const world = useShare(memoryId, 'world')
	// A capture without a temporal identity belongs to no evolving world: only the snapshot link applies.
	const hasWorld = world.status !== 'error' && world.status !== 'checking'
	const active = hasWorld && scope === 'world' ? 'world' : 'memory'
	return (
		<div className="memory-share-panel" aria-live="polite">
			<h3>{t('Share by link')}</h3>
			<p>{t('Anyone with the link can visit without an account. This memory stays out of the public gallery.')}</p>
			{/* Interim warning until /api/shared stops returning the capture's location and world identity (decision D1). */}
			<p className="memory-share-warning">
				{t(
					'The link also shows the coordinates, the dimension, the biome, the world name, the seed (in single player) or the server name or address.'
				)}
			</p>
			{hasWorld && (
				<ScopeSwitch
					scope={active}
					onScope={setScope}
					live={{ memory: memory.status === 'on', world: world.status === 'on' }}
				/>
			)}
			<ShareBody
				key={active}
				scope={active}
				share={active === 'world' ? world : memory}
				view={
					view && {
						include,
						onInclude: setInclude,
						link: url => {
							if (!include) return url
							// The copy is read when asked for, so a camera moved since the panel opened is still caught.
							const current = view()
							if (active === 'world') current.snapshot = memoryId
							return withViewLink(url, current)
						},
					}
				}
			/>
		</div>
	)
}
