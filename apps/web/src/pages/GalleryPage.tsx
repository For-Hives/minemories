import { temporalIdentity } from '@minemories/api-contract'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAppContext } from '../app-context'
import { GalleryIcon } from '../components/GalleryIcons'
import { LoadingSkeleton } from '../components/Loading'
import { buttonDark, Eyebrow } from '../components/ui'
import { formatCaptureCount } from '../i18n/counts'
import { T, translate, useI18n } from '../i18n/I18n'
import { formatRelativeDate } from '../lib/dates'
import { type CaptureArea, captureAreas, groupCaptures, latestCapture } from '../lib/gallery'
import { formatFileSize } from '../lib/glb'
import { shouldShowPaired } from '../lib/pairing'
import { getStackName, setStackName } from '../lib/stack-names'
import './gallery.css'
import { AreaCard, TrashCard } from './GalleryCards'
import { GalleryPairingCard } from './GalleryPairingCard'
import { type Memories, type Storage, useGalleryData } from './gallery-data'
import { useGalleryPairing } from './gallery-pairing'

function storageLevel(storage: Storage, used: number): 'full' | 'high' | 'ok' {
	if (storage.availableBytes === 0) return 'full'
	return used >= 85 ? 'high' : 'ok'
}

function StorageSummary({ storage, failed }: { storage: Storage | null; failed: boolean }) {
	const { t, locale } = useI18n()

	if (!storage) {
		return (
			<p aria-live="polite" className="gallery-storage-note">
				{failed
					? t('Storage information is unavailable. Your captures remain accessible.')
					: t('Checking available storage…')}
			</p>
		)
	}
	const used = Math.min(100, Math.round((storage.usedBytes / storage.limitBytes) * 100))
	const level = storageLevel(storage, used)
	return (
		<section aria-label={t('Gallery storage')} aria-live="polite" className="gallery-storage">
			<div className="gallery-storage-head">
				<strong>{formatFileSize(storage.usedBytes, locale)}</strong>
				<span>/ {formatFileSize(storage.limitBytes, locale)}</span>
				<em>{used}%</em>
			</div>
			<div className="gallery-meter" aria-hidden="true" data-level={level}>
				<span className="gallery-meter-fill" style={{ width: `${Math.max(used, 2)}%` }} />
			</div>
			<p>
				{formatFileSize(storage.availableBytes, locale)} <T message={'available of'} />{' '}
				{formatFileSize(storage.limitBytes, locale)} · {formatFileSize(storage.usedBytes, locale)}{' '}
				<T message={'used or reserved.'} />{' '}
			</p>
			{storage.availableBytes === 0 && (
				<p>
					<T
						message={'Your gallery has no space available. Refused uploads keep their local GLB file on your computer.'}
					/>
				</p>
			)}
			{storage.pendingDeletionBytes > 0 && (
				<p>
					{' '}
					<T message={'Deletion is still in progress for'} /> {formatFileSize(storage.pendingDeletionBytes, locale)}
					<T message={'. That space becomes available when deletion finishes.'} />{' '}
				</p>
			)}
			{storage.reservedBytes > 0 && (
				<p>
					{' '}
					<T message={'Uploads are reserving'} /> {formatFileSize(storage.reservedBytes, locale)}{' '}
					<T message={'until they finish or their cleanup completes.'} />{' '}
				</p>
			)}
			<details>
				<summary aria-label={t('Gallery storage')}>i</summary>
				<p>
					<T message={'To free space, use Delete forever in Trash. Moving a capture to Trash keeps its space used.'} />
				</p>
			</details>
		</section>
	)
}

export function GalleryPage() {
	const { t } = useI18n()

	const { session, notify } = useAppContext()
	const {
		memories,
		trash,
		loading,
		loadError,
		setLoadError,
		refreshAll,
		storage,
		storageError,
		trashSnapshot,
		restoreSnapshot,
		deleteSnapshot,
	} = useGalleryData(notify)
	const pairing = useGalleryPairing(notify, setLoadError)
	const { createPairing } = pairing
	const pairedFresh = shouldShowPaired(pairing.pairStatus === 'paired', memories)

	return (
		<div className="album-gallery gallery-page">
			<div className="album-gallery-heading gallery-heading">
				<div>
					<Eyebrow>
						<T message={'THE SERVER ALBUM'} />
					</Eyebrow>
					<h1>
						{t('Your memories')}
						{session?.user.name && `, ${session.user.name.split(' ')[0]}`}.
					</h1>
					<p>
						<T message={'Every capture keeps a place here, ready to revisit.'} />
					</p>
				</div>
				<div className="gallery-heading-actions">
					<button
						type="button"
						className="gallery-text-button"
						onClick={() => void refreshAll()}
						title={t('Refresh the gallery')}
					>
						<T message={'↻ Refresh'} />
					</button>
					<LocalGalleryLink />
				</div>
			</div>

			<aside className="album-gallery-sidebar">
				<GalleryPairingCard pairing={pairing} pairedFresh={pairedFresh} />
				<StorageSummary storage={storage} failed={storageError} />
			</aside>
			<section className="album-gallery-collection">
				{loadError && (
					<div className="gallery-alert" role="alert">
						{t(loadError)}
					</div>
				)}
				{loading && <LoadingSkeleton kind="gallery" label="Gathering your memories…" />}
				<WorldSections
					memories={memories}
					onChanged={() => void refreshAll()}
					onTrashed={id => void trashSnapshot(id)}
				/>
				{!loading && memories.length === 0 && (
					<div className="gallery-empty">
						<GalleryIcon name="cube" />
						<h3>
							<T message={'The first memory is still to come.'} />
						</h3>
						<p className="gallery-empty-note">
							<T message={'Link your mod to send your first capture.'} />
						</p>
						<div className="gallery-empty-actions">
							{import.meta.env.DEV && (
								<button
									className="gallery-text-button"
									type="button"
									onClick={() => document.getElementById('global-file-input')?.click()}
								>
									<T message={'Choose a local file'} />
								</button>
							)}
							<button className="gallery-view" type="button" onClick={() => void createPairing()}>
								{pairedFresh ? t('New code') : t('Link my server')}
							</button>
						</div>
					</div>
				)}
				{!loading && trash.length > 0 && (
					<section className="gallery-trash" aria-label={t('Trash')}>
						<div>
							<Eyebrow>
								<T message={'RECYCLE BIN'} />
							</Eyebrow>
							<h2>
								<T message={'Trash ·'} /> {trash.length}
							</h2>
							<p className="gallery-trash-note">
								<T message={'Snapshots disappear forever 30 days after deletion.'} />
							</p>
						</div>
						<div className="gallery-trash-list">
							{trash.map(item => (
								<TrashCard
									key={item.id}
									item={item}
									onRestore={() => void restoreSnapshot(item.id)}
									onDelete={() => void deleteSnapshot(item.id)}
								/>
							))}
						</div>
					</section>
				)}
			</section>
		</div>
	)
}

const SERVER_NAME = '#server'

type Server = ReturnType<typeof groupCaptures<Memories[number]>>[number] & { areas: CaptureArea<Memories[number]>[] }

function WorldSections({
	memories,
	onChanged,
	onTrashed,
}: {
	memories: Memories
	onChanged(): void
	onTrashed(id: string): void
}) {
	const { t } = useI18n()
	const servers = useMemo(
		() =>
			groupCaptures(memories).map(group => ({
				...group,
				areas: captureAreas(group.captures, capture => temporalIdentity(capture.metadata) !== null),
			})),
		[memories]
	)
	const [selectedKey, setSelectedKey] = useState<string | null>(null)
	const [, setRenamed] = useState(0)
	const areas = useRef<HTMLElement>(null)
	const selected = servers.find(server => server.key === selectedKey) ?? servers[0]
	const publishId = new URLSearchParams(window.location.search).get('publish')
	if (!selected) return null
	// Server names live in this browser, like area names; a rename re-reads them.
	const name = (server: Server) => getStackName(server.key, SERVER_NAME) ?? server.name
	return (
		<div className="gallery-worlds">
			<ul className="gallery-servers" aria-label={t('Servers')}>
				{servers.map(server => (
					<ServerTile
						key={server.key}
						server={server}
						name={name(server)}
						selected={server === selected}
						onSelect={() => {
							setSelectedKey(server.key)
							// On a narrow screen the areas sit below every tile: bring them into view.
							const top = areas.current?.getBoundingClientRect().top ?? 0
							if (top > window.innerHeight * 0.8)
								areas.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
						}}
						onRenamed={() => setRenamed(value => value + 1)}
					/>
				))}
			</ul>
			<section ref={areas} aria-label={name(selected)} className="gallery-world">
				<h2 className="gallery-world-heading">{name(selected)}</h2>
				<div className="gallery-areas">
					{selected.areas.map(area => (
						<AreaCard
							key={area.stack.key}
							groupKey={selected.key}
							stack={area.stack}
							evolving={area.evolving}
							publishId={publishId}
							onChanged={onChanged}
							onTrashed={onTrashed}
						/>
					))}
				</div>
			</section>
		</div>
	)
}

function ServerCovers({ captures }: { captures: Memories }) {
	const images = captures
		.map(capture => capture.metadata.thumbnail ?? capture.metadata.icon)
		.filter((image): image is string => typeof image === 'string')
		.slice(0, 3)
	return (
		<span className="gallery-server-covers" data-count={images.length} aria-hidden="true">
			{images.length === 0 ? (
				<span className="gallery-server-placeholder">
					<GalleryIcon name="cube" />
				</span>
			) : (
				images.map(image => <span key={image.slice(-48)} style={{ backgroundImage: `url("${image}")` }} />)
			)}
		</span>
	)
}

function ServerTile({
	server,
	name,
	selected,
	onSelect,
	onRenamed,
}: {
	server: Server
	name: string
	selected: boolean
	onSelect(): void
	onRenamed(): void
}) {
	const { t, locale } = useI18n()
	const [draft, setDraft] = useState<string | null>(null)
	const newest = latestCapture(server.captures)
	const seed = server.captures.find(item => item.metadata.seed)?.metadata.seed
	const bytes = server.captures.reduce((total, capture) => total + capture.size, 0)
	function save() {
		setStackName(server.key, SERVER_NAME, draft === server.name ? '' : (draft ?? ''))
		setDraft(null)
		onRenamed()
	}
	return (
		<li className="gallery-server" data-selected={selected}>
			<button type="button" className="gallery-server-open" aria-pressed={selected} onClick={onSelect}>
				<ServerCovers captures={server.captures} />
				<span className="gallery-sr-only">{name}</span>
			</button>
			<div className="gallery-server-body">
				{draft === null ? (
					<div className="gallery-title">
						<h3>{name}</h3>
						<button
							type="button"
							className="gallery-icon-button"
							title={t('Rename this server')}
							aria-label={t('Rename {name}', { name })}
							onClick={() => setDraft(name)}
						>
							<GalleryIcon name="pencil" />
						</button>
					</div>
				) : (
					<form
						className="gallery-rename"
						onSubmit={event => {
							event.preventDefault()
							save()
						}}
					>
						<input
							value={draft}
							maxLength={80}
							aria-label={t('Server name')}
							placeholder={server.name}
							onChange={event => setDraft(event.currentTarget.value)}
						/>
						<button type="submit" className="gallery-field-button">
							{t('Save')}
						</button>
						<button
							type="button"
							className="gallery-field-button"
							aria-label={t('Cancel')}
							onClick={() => setDraft(null)}
						>
							<GalleryIcon name="close" />
						</button>
					</form>
				)}
				<dl className="gallery-server-stats">
					<div>
						<dt>
							<GalleryIcon name="layers" />
							<span className="gallery-sr-only">{t('Snapshots')}</span>
						</dt>
						<dd>{formatCaptureCount(locale, server.captures.length)}</dd>
					</div>
					<div>
						<dt>
							<GalleryIcon name="disk" />
							<span className="gallery-sr-only">{t('Size')}</span>
						</dt>
						<dd>{formatFileSize(bytes, locale)}</dd>
					</div>
					{newest && (
						<div>
							<dt>
								<GalleryIcon name="clock" />
								<span className="gallery-sr-only">{t('Last visit {date}', { date: '' })}</span>
							</dt>
							<dd>{formatRelativeDate(newest.metadata.capturedAt ?? newest.createdAt, Date.now(), locale)}</dd>
						</div>
					)}
				</dl>
				{seed && <p className="gallery-seed">{translate(locale, 'Seed {seed}', { seed })}</p>}
			</div>
		</li>
	)
}

function LocalGalleryLink() {
	if (!import.meta.env.DEV) return null
	return (
		<Link className={buttonDark} to="/viewer">
			<T message={'Open a local GLB'} />
			<span>↗</span>
		</Link>
	)
}
