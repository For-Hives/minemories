import { temporalIdentity } from '@minemories/api-contract'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAppContext } from '../app-context'
import { type MenuItem, useContextMenu } from '../components/ContextMenu'
import { GalleryIcon } from '../components/GalleryIcons'
import { LoadingSkeleton } from '../components/Loading'
import { buttonDark } from '../components/ui'
import { formatCaptureCount } from '../i18n/counts'
import { T, useI18n } from '../i18n/I18n'
import { formatDateSpan, formatRelativeDate } from '../lib/dates'
import {
	type CaptureArea,
	captureAreas,
	captureSpan,
	chronological,
	groupCaptures,
	latestCapture,
	viewPath,
	worldCover,
} from '../lib/gallery'
import { formatFileSize } from '../lib/glb'
import { shouldShowPaired } from '../lib/pairing'
import './gallery.css'
import './gallery-storage.css'
import { AreaCard, TrashCard } from './GalleryCards'
import { ConfirmDelete } from './GalleryConfirm'
import { GalleryPairingCard } from './GalleryPairingCard'
import { type Memories, type Storage, type TrashMemories, useGalleryData } from './gallery-data'
import { useGalleryPairing } from './gallery-pairing'
import { DraftChip } from './RenameField'
import { ServerSheet } from './ServerSheet'
import { useWaitingDraft } from './use-draft'
import { useServerProfiles } from './useServerProfiles'

/** The bar and its percentage change colour as the gallery fills: green, gold, ember, then red when it is almost or fully used. */
export function storageLevel(storage: Pick<Storage, 'availableBytes'>, used: number): StorageLevel {
	if (storage.availableBytes === 0 || used >= 90) return 'full'
	if (used >= 75) return 'high'
	return used >= 50 ? 'mid' : 'ok'
}
type StorageLevel = 'full' | 'high' | 'mid' | 'ok'

function StorageSummary({ storage, failed }: { storage: Storage | null; failed: boolean }) {
	const { t, locale } = useI18n()

	if (!storage) {
		return (
			<p aria-live="polite" className="gallery-storage-note">
				{failed ? t('Could not check the space used.') : t('Checking the space used…')}
			</p>
		)
	}
	const used = Math.min(100, Math.round((storage.usedBytes / storage.limitBytes) * 100))
	const level = storageLevel(storage, used)
	return (
		<section aria-label={t('Space used')} aria-live="polite" className="gallery-storage">
			<div className="gallery-storage-head">
				<strong>{formatFileSize(storage.usedBytes, locale)}</strong>
				<span>/ {formatFileSize(storage.limitBytes, locale)}</span>
			</div>
			<div className="gallery-storage-bar" data-level={level}>
				<div className="gallery-meter" aria-hidden="true">
					<span className="gallery-meter-fill" style={{ width: `${Math.max(used, 2)}%` }} />
				</div>
				<em>{used}%</em>
			</div>
			<StorageParts storage={storage} />
			{/* Only a gallery with no byte left refuses uploads; a nearly full one still accepts them. */}
			{storage.availableBytes === 0 && (
				<p>
					<T message={'Your gallery is full. New memories stay on your computer. Empty the trash to make room.'} />
				</p>
			)}
		</section>
	)
}

/**
 * What the figure holds besides the captures on show: the trash, uploads still arriving and files still being erased all
 * count against the limit, so a gallery that looks empty can still use space.
 */
function StorageParts({ storage }: { storage: Storage }) {
	const { t, locale } = useI18n()
	const parts = [
		storage.trashBytes > 0 && t('Includes {size} in the trash.', { size: formatFileSize(storage.trashBytes, locale) }),
		storage.reservedBytes > 0 && t('{size} still uploading.', { size: formatFileSize(storage.reservedBytes, locale) }),
		storage.pendingDeletionBytes > 0 &&
			t('{size} being deleted.', { size: formatFileSize(storage.pendingDeletionBytes, locale) }),
	].filter(part => part !== false)
	if (parts.length === 0) return null
	return (
		<ul className="gallery-storage-parts">
			{parts.map(part => (
				<li key={part}>{part}</li>
			))}
		</ul>
	)
}

export function GalleryPage() {
	const { t } = useI18n()

	const { notify } = useAppContext()
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
		deleting,
		emptyTrash,
		emptying,
	} = useGalleryData(notify)
	// Once the trash is emptied its section leaves with the focus in it: the page title takes it.
	const title = useRef<HTMLHeadingElement>(null)
	const pairing = useGalleryPairing(notify, setLoadError)
	const { createPairing } = pairing
	const pairedFresh = shouldShowPaired(pairing.pairStatus === 'paired', memories)

	return (
		<div className="album-gallery gallery-page">
			<div className="album-gallery-heading gallery-heading">
				<div>
					<h1 ref={title} tabIndex={-1}>
						{t('Your gallery')}
					</h1>
				</div>
				<div className="gallery-heading-actions">
					<RefreshButton onRefresh={refreshAll} />
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
				{loading && <LoadingSkeleton kind="gallery" label="Loading…" />}
				<WorldSections
					memories={memories}
					onChanged={() => void refreshAll()}
					onTrashed={id => void trashSnapshot(id)}
				/>
				{!loading && memories.length === 0 && (
					<EmptyGallery
						connected={pairedFresh}
						pending={pairing.pairStatus === 'pending'}
						onGetCode={() => void createPairing()}
					/>
				)}
				{!loading && trash.length > 0 && (
					<TrashSection
						trash={trash}
						deleting={deleting}
						emptying={emptying}
						onRestore={id => void restoreSnapshot(id)}
						onDelete={id => void deleteSnapshot(id)}
						onEmpty={() =>
							void emptyTrash().then(done => {
								if (done) title.current?.focus()
							})
						}
					/>
				)}
			</section>
		</div>
	)
}

/** The trash: each card restores or deletes for good, and deleting for good asks first in the gallery's own panel. */
function TrashSection({
	trash,
	deleting,
	emptying,
	onRestore,
	onDelete,
	onEmpty,
}: {
	trash: TrashMemories
	deleting: ReadonlySet<string>
	emptying: boolean
	onRestore(id: string): void
	onDelete(id: string): void
	onEmpty(): void
}) {
	const { t, locale } = useI18n()
	const [askingId, setAskingId] = useState<string | null>(null)
	const [askingAll, setAskingAll] = useState(false)
	// Read from the live list: if the snapshot leaves the trash while the panel is open (restored or purged from another
	// device, seen by the next refresh), the panel closes instead of deleting a capture that is no longer in the trash.
	const asking = askingId === null ? undefined : trash.find(item => item.id === askingId)
	const heading = useRef<HTMLHeadingElement>(null)
	const [confirmed, setConfirmed] = useState(0)
	useEffect(() => {
		if (askingId !== null && !asking) setAskingId(null)
	}, [askingId, asking])
	// After a confirmation the card's buttons are disabled and the card then leaves, so the panel cannot hand focus back
	// to its opener: the trash heading takes it. This runs after the panel's own clean-up.
	useEffect(() => {
		if (confirmed > 0) heading.current?.focus()
	}, [confirmed])
	return (
		<section className="gallery-trash" aria-label={t('Trash')}>
			<div className="gallery-trash-head">
				<div>
					<h2 ref={heading} tabIndex={-1}>
						<T message={'Trash ·'} /> {trash.length}
					</h2>
					<p className="gallery-trash-note">
						<T message={'Memories in the trash are deleted after 30 days.'} />
					</p>
				</div>
				<button
					type="button"
					className="gallery-text-button is-danger"
					disabled={emptying}
					aria-busy={emptying}
					onClick={() => setAskingAll(true)}
				>
					{emptying ? t('Emptying…') : t('Empty trash')}
				</button>
			</div>
			<div className="gallery-trash-list">
				{trash.map(item => (
					<TrashCard
						key={item.id}
						item={item}
						deleting={emptying || deleting.has(item.id)}
						onRestore={() => onRestore(item.id)}
						onDelete={() => setAskingId(item.id)}
					/>
				))}
			</div>
			{askingAll && (
				<ConfirmDelete
					title={t('Empty the trash?')}
					note={t('Deletes {captures} forever. You can’t undo this.', {
						captures: formatCaptureCount(locale, trash.length),
					})}
					confirmLabel={t('Empty trash')}
					onCancel={() => setAskingAll(false)}
					onConfirm={() => {
						setAskingAll(false)
						setConfirmed(count => count + 1)
						onEmpty()
					}}
				/>
			)}
			{asking && (
				<ConfirmDelete
					title={t('Delete {name} forever?', { name: asking.name })}
					onCancel={() => setAskingId(null)}
					onConfirm={() => {
						setAskingId(null)
						setConfirmed(count => count + 1)
						onDelete(asking.id)
					}}
				/>
			)}
		</section>
	)
}

/** The empty gallery says the one next step: connect the game, or take the first memory once it is connected. */
function EmptyGallery({ connected, pending, onGetCode }: { connected: boolean; pending: boolean; onGetCode(): void }) {
	const { t } = useI18n()
	if (connected)
		return (
			<div className="gallery-empty">
				<GalleryIcon name="check" />
				<h3>{t('Your game is connected.')}</h3>
				<p className="gallery-empty-note">
					{t('Press M → Take a memory.')} {t('It will show up here.')}
				</p>
				<p className="gallery-empty-note">
					{t('Memories from before?')} {t('M → My memories → Send this memory.')}
				</p>
			</div>
		)
	return (
		<div className="gallery-empty">
			<GalleryIcon name="cube" />
			<h3>{t('No memories yet')}</h3>
			{/* While a code is shown, the card beside says where to type it: no second copy here. */}
			{!pending && <p className="gallery-empty-note">{t('Install the mod, then connect your game with a code.')}</p>}
			<div className="gallery-empty-actions">
				{import.meta.env.DEV && (
					<button
						className="gallery-text-button"
						type="button"
						onClick={() => document.getElementById('global-file-input')?.click()}
					>
						{t('Choose a local file')}
					</button>
				)}
				{!pending && (
					<button className="gallery-view" type="button" onClick={onGetCode}>
						{t('Get a code')}
					</button>
				)}
				<Link className="gallery-text-button" to="/installation">
					{t('No mod yet? Install Minemories')} <span aria-hidden="true">→</span>
				</Link>
			</div>
		</div>
	)
}

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
	// Worlds read as a journey back in time: the one played last comes first.
	const servers = useMemo(
		() =>
			chronological(
				groupCaptures(memories).map(group => ({
					...group,
					areas: captureAreas(group.captures, capture => temporalIdentity(capture.metadata) !== null, group.seeded),
				}))
			),
		[memories]
	)
	const [selectedKey, setSelectedKey] = useState<string | null>(null)
	const { notify } = useAppContext()
	// Names and pictures live on the account; a gallery refresh reads them again.
	const keys = useMemo(() => servers.map(server => server.key), [servers])
	const { profiles, rename } = useServerProfiles(keys, memories)
	const selected = servers.find(server => server.key === selectedKey) ?? servers[0]
	const publishId = new URLSearchParams(window.location.search).get('publish')
	if (!selected) return null
	const name = (server: Server) => profiles.get(server.key)?.name ?? server.name
	return (
		<ol className="gallery-servers" aria-label={t('Worlds')}>
			{servers.map(server => (
				<ServerTile
					key={server.key}
					server={server}
					name={name(server)}
					cover={profiles.get(server.key)?.cover ?? null}
					selected={server === selected}
					onSelect={() => setSelectedKey(server.key)}
					onRename={next => rename(server.key, next).catch(() => notify('Could not rename this world.'))}
				>
					{server === selected && (
						<div className="gallery-areas">
							{server.areas.map(area => (
								<AreaCard
									key={area.stack.key}
									groupKey={server.key}
									stack={area.stack}
									evolving={area.evolving}
									publishId={publishId}
									onChanged={onChanged}
									onTrashed={onTrashed}
								/>
							))}
						</div>
					)}
				</ServerTile>
			))}
		</ol>
	)
}

/** The picture the owner chose in the viewer; without one, the server icon or the newest preview. */
function ServerCovers({ captures, chosen }: { captures: Memories; chosen: string | null }) {
	const cover = chosen ? { kind: 'preview' as const, src: chosen } : worldCover(captures)
	return (
		<span className="gallery-server-covers" data-kind={cover?.kind ?? 'none'} aria-hidden="true">
			{cover ? (
				<img
					className={cover.kind === 'icon' ? 'gallery-server-picture is-icon' : 'gallery-server-picture'}
					src={cover.src}
					alt=""
					loading="lazy"
					decoding="async"
					draggable={false}
				/>
			) : (
				<span className="gallery-server-placeholder">
					<GalleryIcon name="cube" />
				</span>
			)}
		</span>
	)
}

function ServerTile({
	server,
	name,
	cover,
	selected,
	onSelect,
	onRename,
	children,
}: {
	server: Server
	name: string
	cover: string | null
	selected: boolean
	onSelect(): void
	onRename(name: string): void
	children?: ReactNode
}) {
	const { t, locale } = useI18n()
	const [sheet, setSheet] = useState(false)
	// A name typed in the sheet and left unsaved shows on the tile, like an area's draft.
	const waiting = useWaitingDraft('server-name', server.key, name) && !sheet
	const menu = useContextMenu()
	const newest = latestCapture(server.captures)
	const span = captureSpan(server.captures)
	const bytes = server.captures.reduce((total, capture) => total + capture.size, 0)
	const newestArea = newest && server.areas.find(area => area.stack.captures.includes(newest))
	const openPath = newest && viewPath(newest.id, Boolean(newestArea?.evolving && newestArea.stack.captures.length > 1))
	const actions: MenuItem[] = [
		{ label: t('Open'), icon: 'view', onSelect },
		{ label: t('Details'), icon: 'cube', onSelect: () => setSheet(true) },
		{ label: t('Rename this world'), icon: 'pencil', onSelect: () => setSheet(true) },
	]
	return (
		<li className="gallery-server" data-selected={selected} onContextMenu={event => menu.open(event, name, actions)}>
			<div className="gallery-server-card">
				<button type="button" className="gallery-server-open" aria-pressed={selected} onClick={onSelect}>
					<ServerCovers captures={server.captures} chosen={cover} />
					<span className="gallery-sr-only">{name}</span>
				</button>
				<div className="gallery-server-body">
					<div className="gallery-title">
						<h3>{name}</h3>
						{waiting && <DraftChip />}
					</div>
					{span && (
						<p className="gallery-seed">
							<GalleryIcon name="clock" />
							<time className="gallery-seed-when" dateTime={span.last}>
								{formatRelativeDate(span.last, Date.now(), locale)}
							</time>
							<span className="gallery-seed-span" title={t('First and last memory')}>
								<span aria-hidden="true">·</span>
								{formatDateSpan(span.first, span.last, locale)}
							</span>
						</p>
					)}
					<dl className="gallery-server-stats">
						<div>
							<dt>
								<GalleryIcon name="layers" />
								<span className="gallery-sr-only">{t('Memories')}</span>
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
					</dl>
				</div>
				<div className="gallery-server-actions">
					{openPath && (
						<Link className="gallery-server-go" to={openPath} aria-label={`${t('Open')} · ${name}`}>
							{t('Open')}
							<GalleryIcon name="view" />
						</Link>
					)}
					<button
						type="button"
						className="gallery-icon-button"
						title={t('Rename this world')}
						aria-label={t('Rename {name}', { name })}
						onClick={() => setSheet(true)}
					>
						<GalleryIcon name="pencil" />
					</button>
				</div>
			</div>
			{children}
			{menu.element}
			{sheet && <ServerSheet server={server} name={name} onClose={() => setSheet(false)} onRename={onRename} />}
		</li>
	)
}

const REFRESH_MIN_MS = 400

/** The manual refresh: the icon turns while the gallery reloads; the 12 s background refresh stays silent. */
function RefreshButton({ onRefresh }: { onRefresh(): Promise<void> }) {
	const { t } = useI18n()
	const [busy, setBusy] = useState(false)
	async function refresh() {
		if (busy) return
		setBusy(true)
		try {
			// A local reload answers in a few milliseconds: the arrow still makes one full turn so the click reads.
			await Promise.all([onRefresh(), new Promise(resolve => setTimeout(resolve, REFRESH_MIN_MS))])
		} finally {
			setBusy(false)
		}
	}
	return (
		<button
			type="button"
			className="gallery-text-button gallery-refresh"
			aria-busy={busy}
			onClick={() => void refresh()}
			title={t('Refresh the gallery')}
		>
			<GalleryIcon name="refresh" />
			{t('Refresh')}
		</button>
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
