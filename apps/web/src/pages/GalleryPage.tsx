import { temporalIdentity } from '@minemories/api-contract'
import { type ReactNode, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAppContext } from '../app-context'
import { type MenuItem, useContextMenu } from '../components/ContextMenu'
import { GalleryIcon } from '../components/GalleryIcons'
import { LoadingSkeleton } from '../components/Loading'
import { buttonDark } from '../components/ui'
import { formatCaptureCount } from '../i18n/counts'
import { type Locale, T, translate, useI18n } from '../i18n/I18n'
import { formatDateSpan, formatRelativeDate } from '../lib/dates'
import {
	type CaptureArea,
	captureAreas,
	captureSpan,
	chronological,
	groupCaptures,
	latestCapture,
	viewPath,
} from '../lib/gallery'
import { formatFileSize } from '../lib/glb'
import { shouldShowPaired } from '../lib/pairing'
import { getStackName, setStackName } from '../lib/stack-names'
import './gallery.css'
import './gallery-storage.css'
import { AreaCard, TrashCard } from './GalleryCards'
import { GalleryPairingCard } from './GalleryPairingCard'
import { type Memories, type Storage, useGalleryData } from './gallery-data'
import { useGalleryPairing } from './gallery-pairing'
import { DraftChip } from './RenameField'
import { ServerSheet } from './ServerSheet'
import { useWaitingDraft } from './use-draft'

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
			</div>
			<div className="gallery-storage-bar" data-level={level}>
				<div className="gallery-meter" aria-hidden="true">
					<span className="gallery-meter-fill" style={{ width: `${Math.max(used, 2)}%` }} />
				</div>
				<em>{used}%</em>
			</div>
			{/* Only a gallery with no byte left refuses uploads; a nearly full one still accepts them. */}
			{storage.availableBytes === 0 && (
				<p>
					<T
						message={
							'Your gallery is full. New memories stay on your computer. To make room, use Delete forever in Trash.'
						}
					/>
				</p>
			)}
		</section>
	)
}

/** The title row's one finding: how much is kept, across how many worlds, and when the last capture arrived. */
function gallerySummary(memories: Memories, locale: Locale): string {
	if (memories.length === 0) return translate(locale, 'Every capture keeps a place here, ready to revisit.')
	const newest = latestCapture(memories)
	const parts = [
		formatCaptureCount(locale, memories.length),
		translate(locale, '{count} worlds', { count: groupCaptures(memories).length }),
	]
	if (newest)
		parts.push(
			translate(locale, 'Last visit {date}', {
				date: formatRelativeDate(newest.metadata.capturedAt ?? newest.createdAt, Date.now(), locale),
			})
		)
	return parts.join(' · ')
}

export function GalleryPage() {
	const { t, locale } = useI18n()

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
	} = useGalleryData(notify)
	const pairing = useGalleryPairing(notify, setLoadError)
	const { createPairing } = pairing
	const pairedFresh = shouldShowPaired(pairing.pairStatus === 'paired', memories)

	return (
		<div className="album-gallery gallery-page">
			<div className="album-gallery-heading gallery-heading">
				<div>
					<h1>{t('Your memories')}</h1>
					<p>{gallerySummary(memories, locale)}</p>
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
				{loading && <LoadingSkeleton kind="gallery" label="Gathering your memories…" />}
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
					<section className="gallery-trash" aria-label={t('Trash')}>
						<div>
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
			<p className="gallery-empty-note">
				{pending
					? t('In Minecraft: M → type this code → Connect.')
					: t('Install the mod, then connect your game with a code.')}
			</p>
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
	// Worlds read as a journey back in time: the one played last comes first.
	const servers = useMemo(
		() =>
			chronological(
				groupCaptures(memories).map(group => ({
					...group,
					areas: captureAreas(group.captures, capture => temporalIdentity(capture.metadata) !== null),
				}))
			),
		[memories]
	)
	const [selectedKey, setSelectedKey] = useState<string | null>(null)
	const [, setRenamed] = useState(0)
	const selected = servers.find(server => server.key === selectedKey) ?? servers[0]
	const publishId = new URLSearchParams(window.location.search).get('publish')
	if (!selected) return null
	// Server names live in this browser, like area names; a rename re-reads them.
	const name = (server: Server) => getStackName(server.key, SERVER_NAME) ?? server.name
	return (
		<ol className="gallery-servers" aria-label={t('Servers')}>
			{servers.map(server => (
				<ServerTile
					key={server.key}
					server={server}
					name={name(server)}
					selected={server === selected}
					onSelect={() => setSelectedKey(server.key)}
					onRenamed={() => setRenamed(value => value + 1)}
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

function ServerCovers({ captures }: { captures: Memories }) {
	const images = captures
		// Keyed by capture: two captures can share the same thumbnail.
		.map(capture => ({ id: capture.id, image: capture.metadata.thumbnail ?? capture.metadata.icon }))
		.filter((cover): cover is { id: string; image: string } => typeof cover.image === 'string')
		.slice(0, 3)
	return (
		<span className="gallery-server-covers" data-count={images.length} aria-hidden="true">
			{images.length === 0 ? (
				<span className="gallery-server-placeholder">
					<GalleryIcon name="cube" />
				</span>
			) : (
				images.map(({ id, image }) => <span key={id} style={{ backgroundImage: `url("${image}")` }} />)
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
	children,
}: {
	server: Server
	name: string
	selected: boolean
	onSelect(): void
	onRenamed(): void
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
		{ label: t('Rename this server'), icon: 'pencil', onSelect: () => setSheet(true) },
	]
	return (
		<li className="gallery-server" data-selected={selected} onContextMenu={event => menu.open(event, name, actions)}>
			<div className="gallery-server-card">
				<button type="button" className="gallery-server-open" aria-pressed={selected} onClick={onSelect}>
					<ServerCovers captures={server.captures} />
					<span className="gallery-sr-only">{name}</span>
				</button>
				<div className="gallery-server-body">
					<div className="gallery-title">
						<h3>{name}</h3>
						{waiting && <DraftChip />}
						<button
							type="button"
							className="gallery-icon-button"
							title={t('Rename this server')}
							aria-label={t('Rename {name}', { name })}
							onClick={() => setSheet(true)}
						>
							<GalleryIcon name="pencil" />
						</button>
					</div>
					{span && (
						<p className="gallery-seed">
							<GalleryIcon name="clock" />
							<time className="gallery-seed-when" dateTime={span.last}>
								{formatRelativeDate(span.last, Date.now(), locale)}
							</time>
							<span className="gallery-seed-span" title={t('First and last snapshot')}>
								<span aria-hidden="true">·</span>
								{formatDateSpan(span.first, span.last, locale)}
							</span>
						</p>
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
					</dl>
				</div>
				{openPath && (
					<Link className="gallery-server-go" to={openPath} aria-label={`${t('Open')} · ${name}`}>
						{t('Open')}
						<GalleryIcon name="view" />
					</Link>
				)}
			</div>
			{children}
			{menu.element}
			{sheet && (
				<ServerSheet
					server={server}
					name={name}
					onClose={() => setSheet(false)}
					onRename={next => {
						setStackName(server.key, SERVER_NAME, next)
						onRenamed()
					}}
				/>
			)}
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
