import { temporalIdentity } from '@minemories/api-contract'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAppContext } from '../app-context'
import { GalleryIcon } from '../components/GalleryIcons'
import { LoadingSkeleton } from '../components/Loading'
import { buttonDark, Eyebrow } from '../components/ui'
import { formatCaptureCount } from '../i18n/counts'
import { type Locale, T, translate, useI18n } from '../i18n/I18n'
import { formatRelativeDate } from '../lib/dates'
import { captureAreas, groupCaptures, latestCapture } from '../lib/gallery'
import { formatFileSize } from '../lib/glb'
import { shouldShowPaired } from '../lib/pairing'
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

function WorldSections({
	memories,
	onChanged,
	onTrashed,
}: {
	memories: Memories
	onChanged(): void
	onTrashed(id: string): void
}) {
	const { locale } = useI18n()
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
	const worlds = useMemo(
		() =>
			groupCaptures(memories).map(group => ({
				...group,
				areas: captureAreas(group.captures, capture => temporalIdentity(capture.metadata) !== null),
			})),
		[memories]
	)
	const publishId = new URLSearchParams(window.location.search).get('publish')

	function toggle(key: string) {
		setCollapsed(previous => {
			const next = new Set(previous)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}

	return (
		<div className="gallery-worlds">
			{worlds.map(world => {
				const open = !collapsed.has(world.key)
				return (
					<section key={world.key} aria-label={world.name} className="gallery-world">
						<button
							type="button"
							className="gallery-world-header"
							aria-expanded={open}
							onClick={() => toggle(world.key)}
						>
							<span
								aria-hidden="true"
								className="gallery-world-icon"
								style={
									(world.captures[0]?.metadata.icon ?? world.captures[0]?.metadata.thumbnail)
										? {
												backgroundImage: `url("${world.captures[0]?.metadata.icon ?? world.captures[0]?.metadata.thumbnail}")`,
											}
										: undefined
								}
							/>
							<span className="gallery-world-text">
								<strong>{world.name}</strong>
								<span className="gallery-world-meta">{worldSummary(world.captures, locale)}</span>
							</span>
							<span aria-hidden="true" className="gallery-chevron" data-open={open} />
						</button>
						{open && (
							<div className="gallery-areas">
								{world.areas.map(area => (
									<AreaCard
										key={area.stack.key}
										groupKey={world.key}
										stack={area.stack}
										evolving={area.evolving}
										publishId={publishId}
										onChanged={onChanged}
										onTrashed={onTrashed}
									/>
								))}
							</div>
						)}
					</section>
				)
			})}
		</div>
	)
}

function worldSummary(captures: Memories, locale: Locale): string {
	const seed = captures.find(item => item.metadata.seed)?.metadata.seed
	const newest = latestCapture(captures)
	const parts = [formatCaptureCount(locale, captures.length)]
	if (seed) parts.push(translate(locale, 'Seed {seed}', { seed }))
	if (newest)
		parts.push(
			translate(locale, 'Last visit {date}', {
				date: formatRelativeDate(newest.metadata.capturedAt ?? newest.createdAt, Date.now(), locale),
			})
		)
	return parts.join(' · ')
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
