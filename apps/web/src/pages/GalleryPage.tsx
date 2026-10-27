import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { LoadingSkeleton } from '../components/Loading'
import { SharePanel } from '../components/SharePanel'
import { buttonDark, buttonOutline, Eyebrow } from '../components/ui'
import { formatCaptureCount } from '../i18n/counts'
import { type Locale, T, translate, useI18n } from '../i18n/I18n'
import { formatRelativeDate } from '../lib/dates'
import { type CaptureStack, collapseTimelines, groupCaptures, stackCaptures } from '../lib/gallery'
import { formatFileSize } from '../lib/glb'
import { shouldShowPaired } from '../lib/pairing'
import { getStackName, setStackName } from '../lib/stack-names'
import { daysUntilPurge } from '../lib/trash'
import { GalleryPairingCard } from './GalleryPairingCard'
import { type Memories, type Storage, type TrashMemories, useGalleryData, useLivePage } from './gallery-data'
import { useGalleryPairing } from './gallery-pairing'
import { PublicationPanel } from './PublicDiscovery'

type MemoryMetadata = Memories[number]['metadata']

function StorageSummary({ storage, failed }: { storage: Storage | null; failed: boolean }) {
	const { t, locale } = useI18n()

	if (!storage) {
		return (
			<p aria-live="polite">
				{failed
					? t('Storage information is unavailable. Your captures remain accessible.')
					: t('Checking available storage…')}
			</p>
		)
	}
	return (
		<section aria-label={t('Gallery storage')} aria-live="polite" className="my-4 text-xs">
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
			<p>
				<T message={'To free space, use Delete forever in Trash. Moving a capture to Trash keeps its space used.'} />
			</p>
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
		</section>
	)
}

function CaptureMetadata({ metadata }: { metadata: MemoryMetadata }) {
	const { t } = useI18n()

	return (
		<>
			{metadata.biome && <p className="mb-0 mt-1 text-[9px] text-[#b4c1ad]">{metadata.biome.replaceAll('_', ' ')}</p>}
			{metadata.dimension && (
				<p className="mb-0 mt-1 max-w-[230px] overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-[#b4c1ad]">
					{metadata.dimension}
				</p>
			)}
			{metadata.seed && (
				<p className="mb-0 mt-1 break-all text-[9px] text-[#b4c1ad]">
					<T message={'Seed'} /> {metadata.seed}
				</p>
			)}
			{metadata.dayTime !== null || metadata.raining || metadata.thundering ? (
				<p className="mb-0 mt-1 text-[9px] text-[#b4c1ad]">
					{metadata.dayTime !== null && `World time ${metadata.dayTime}`}
					{metadata.raining && t(' · Rain')}
					{metadata.thundering && t(' · Thunder')}
				</p>
			) : null}
		</>
	)
}

const artTones = ['bg-[#1c2720]', 'bg-[#202b23]', 'bg-[#1a231f]', 'bg-[#232d26]']

interface TilePalette {
	top: string
	side: string
	blocks: [string, string, string, string]
	trunk: string
}

const tilePalettes: TilePalette[] = [
	{
		top: 'bg-[#81936d]',
		side: 'bg-[#596f55]',
		blocks: ['bg-[#77926e]', 'bg-[#8e9c6a]', 'bg-[#667f5f]', 'bg-[#a18c62]'],
		trunk: 'bg-[#463f31]',
	},
	{
		top: 'bg-[#a29a76]',
		side: 'bg-[#647a83]',
		blocks: ['bg-[#778a7f]', 'bg-[#778a7f]', 'bg-[#778a7f]', 'bg-[#778a7f]'],
		trunk: 'bg-[#505747]',
	},
	{
		top: 'bg-[#987a5c]',
		side: 'bg-[#755444]',
		blocks: ['bg-[#a9926f]', 'bg-[#a9926f]', 'bg-[#a9926f]', 'bg-[#a9926f]'],
		trunk: 'bg-[#474035]',
	},
	{
		top: 'bg-[#657f87]',
		side: 'bg-[#46646d]',
		blocks: ['bg-[#7b9b9e]', 'bg-[#7b9b9e]', 'bg-[#7b9b9e]', 'bg-[#7b9b9e]'],
		trunk: 'bg-[#394b4e]',
	},
]

export function GalleryPage() {
	const { t } = useI18n()

	const { session, notify, setViewerFile } = useAppContext()
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
	const navigate = useNavigate()
	const [openingId, setOpeningId] = useState('')

	function openMemory(id: string) {
		setOpeningId(id)
		setLoadError('')
		setViewerFile(null)
		navigate(`/viewer?memory=${encodeURIComponent(id)}`)
		setOpeningId('')
	}

	return (
		<div className="album-gallery mx-auto min-h-[670px] w-[min(100%-88px,1180px)] px-0 py-[62px] pb-[79px] max-tablet:w-[min(100%-48px,760px)] max-phone:w-[calc(100%-36px)] max-phone:py-10 max-phone:pb-[53px]">
			<div className="album-gallery-heading flex items-end justify-between gap-5 max-phone:flex-col max-phone:items-start">
				<div>
					<Eyebrow>
						<T message={'THE SERVER ALBUM'} />
					</Eyebrow>
					<h1 className="mb-[9px] mt-[13px] font-sans text-[clamp(36px,4vw,53px)] font-semibold leading-[1.1] tracking-[-2.8px] max-phone:text-[36px] max-phone:tracking-[-2px]">
						{t('Your memories')}
						{session?.user.name && `, ${session.user.name.split(' ')[0]}`}.
					</h1>
					<p className="m-0 text-[13px] text-[#b4c1ad]">
						<T message={'Every capture keeps a place here, ready to revisit.'} />
					</p>
				</div>
				<LocalGalleryLink />
			</div>

			<aside className="album-gallery-sidebar">
				<GalleryPairingCard pairing={pairing} pairedFresh={pairedFresh} />
				<StorageSummary storage={storage} failed={storageError} />
			</aside>
			<section className="album-gallery-collection">
				<div className="mb-[17px] flex items-end justify-between">
					<div>
						<Eyebrow>
							<T message={'YOUR CAPTURES'} />
						</Eyebrow>
						<h2 className="mb-0 mt-[6px] font-sans text-2xl font-bold tracking-[-1px]">
							<T message={'To revisit'} />
						</h2>
					</div>
					<button
						className="cursor-pointer border-0 bg-transparent px-[9px] py-[7px] text-[11px] text-[#b4c1ad] hover:text-[#e6eee1]"
						type="button"
						onClick={() => void refreshAll()}
						title={t('Refresh the gallery')}
					>
						{' '}
						<T message={'↻ Refresh'} />{' '}
					</button>
				</div>
				{loadError && (
					<div
						className="mb-[15px] rounded-[5px] border border-[#354238] bg-[#1c2720] px-[14px] py-[11px] text-xs text-[#b4c1ad]"
						role="alert"
					>
						{t(loadError)}
					</div>
				)}
				{loading && <LoadingSkeleton kind="gallery" label="Gathering your memories…" />}
				<CaptureFolders
					memories={memories}
					openingId={openingId}
					onOpenMemory={openMemory}
					onChanged={() => void refreshAll()}
					onTrashed={id => void trashSnapshot(id)}
				/>
				{!loading && memories.length === 0 && (
					<div className="flex min-h-[270px] flex-col items-center justify-center rounded-[7px] border border-dashed border-[#354238] bg-[#1c2720] p-[25px] text-center text-[#b4c1ad]">
						<span className="grid h-[45px] w-[45px] place-items-center rounded-[13px] bg-[#1c2720] text-[22px] text-[#b4c1ad]">
							▧
						</span>
						<h3 className="mb-0 mt-[14px] font-sans text-[17px] font-bold text-[#e6eee1]">
							{' '}
							<T message={'The first memory is still to come.'} />{' '}
						</h3>
						<p className="mb-0 mt-[6px] text-xs">
							{' '}
							<T message={'Link your mod to send your first capture.'} />{' '}
						</p>
						<div className="mt-[22px] flex flex-wrap gap-[10px]">
							{import.meta.env.DEV && (
								<button
									className={`${buttonOutline} min-h-[40px] text-[10px]`}
									type="button"
									onClick={() => document.getElementById('global-file-input')?.click()}
								>
									{' '}
									<T message={'Choose a local file'} />{' '}
								</button>
							)}
							<button
								className={`${buttonDark} min-h-[40px] text-[10px]`}
								type="button"
								onClick={() => void createPairing()}
							>
								{pairedFresh ? t('New code') : t('Link my server')}
							</button>
						</div>
					</div>
				)}
				{!loading && trash.length > 0 && (
					<section className="mt-12" aria-label={t('Trash')}>
						<div className="mb-[17px]">
							<Eyebrow>
								<T message={'RECYCLE BIN'} />
							</Eyebrow>
							<h2 className="mb-0 mt-[6px] font-sans text-2xl font-bold tracking-[-1px]">
								<T message={'Trash ·'} /> {trash.length}
							</h2>
							<p className="mb-0 mt-[6px] text-[11px] text-[#8e978a]">
								{' '}
								<T message={'Snapshots disappear forever 30 days after deletion.'} />{' '}
							</p>
						</div>
						<div className="grid grid-cols-3 gap-[17px] max-tablet:grid-cols-2 max-phone:grid-cols-1 max-phone:gap-3">
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

function CaptureFolders({
	memories,
	openingId,
	onOpenMemory,
	onChanged,
	onTrashed,
}: {
	memories: Memories
	openingId: string
	onOpenMemory(id: string): void
	onChanged(): void
	onTrashed(id: string): void
}) {
	const { locale } = useI18n()
	const [expanded, setExpanded] = useState<Set<string>>(new Set())

	function toggleGroup(key: string) {
		setExpanded(previous => {
			const next = new Set(previous)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}

	if (memories.length === 0) return null
	return (
		<div className="space-y-4">
			{groupCaptures(collapseTimelines(memories)).map(group => {
				const open = expanded.has(group.key)
				const stacks = open ? stackCaptures(group.captures) : []
				return (
					<section
						key={group.key}
						aria-label={group.name}
						className="overflow-hidden rounded-[7px] border border-[#354238] bg-[#151c17]"
					>
						<button
							type="button"
							onClick={() => toggleGroup(group.key)}
							aria-expanded={open}
							className="flex w-full cursor-pointer items-center gap-4 border-0 bg-transparent p-4 text-left hover:bg-[#1a231c]"
						>
							<FolderIcon
								thumbnail={group.captures[0]?.metadata.icon ?? group.captures[0]?.metadata.thumbnail ?? null}
							/>
							<span className="min-w-0 flex-1">
								<span className="block overflow-hidden text-ellipsis whitespace-nowrap font-sans text-sm font-bold text-[#eef3ea]">
									{group.name}
								</span>
								<span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#8e978a]">
									{folderMotd(group.captures, locale)}
								</span>
							</span>
							<span className="flex flex-none items-center gap-3">
								<span className="rounded-full border border-[#354238] px-2 py-1 font-mono text-[10px] text-[#b4c1ad]">
									{group.captures.length}
								</span>
								<span aria-hidden="true" className="text-[#b4c1ad]">
									{open ? '▾' : '▸'}
								</span>
							</span>
						</button>
						{open && (
							<div className="album-stacks border-t border-[#2a332d] p-4">
								{stacks.map(stack => (
									<StackBundle
										key={stack.key}
										groupKey={group.key}
										stack={stack}
										openingId={openingId}
										onOpenMemory={onOpenMemory}
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

function folderMotd(captures: Memories, locale: Locale): string {
	const count = captures.length
	const newest = captures[0]
	const seed = captures.find(item => item.metadata.seed)?.metadata.seed
	const parts = [formatCaptureCount(locale, count)]
	if (seed) parts.push(translate(locale, 'Seed {seed}', { seed }))
	if (newest)
		parts.push(
			translate(locale, 'Last visit {date}', {
				date: formatRelativeDate(newest.metadata.capturedAt ?? newest.createdAt, Date.now(), locale),
			})
		)
	return parts.join(' · ')
}

function FolderIcon({ thumbnail }: { thumbnail: string | null }) {
	return (
		<span className="grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-[4px] border border-[#354238] bg-[#10150f]">
			{thumbnail ? (
				<span
					aria-hidden="true"
					className="block h-full w-full bg-cover bg-center"
					style={{ backgroundImage: `url("${thumbnail}")` }}
				/>
			) : (
				<span aria-hidden="true" className="block scale-[0.45]">
					<MemoryTile variant={0} />
				</span>
			)}
		</span>
	)
}

function StackThumbs({ captures }: { captures: Array<{ id: string; thumbnail: string | null }> }) {
	return (
		<span aria-hidden="true" className="flex flex-none">
			{captures.map(capture => (
				<span
					key={capture.id}
					className="grid h-9 w-9 place-items-center overflow-hidden rounded-[4px] border border-[#354238] bg-[#1c2720] not-first:-ml-3"
				>
					{capture.thumbnail ? (
						<span
							className="block h-full w-full bg-cover bg-center"
							style={{ backgroundImage: `url("${capture.thumbnail}")` }}
						/>
					) : (
						<span className="text-sm text-[#b4c1ad]">▧</span>
					)}
				</span>
			))}
		</span>
	)
}

function StackBundle({
	groupKey,
	stack,
	openingId,
	onOpenMemory,
	onChanged,
	onTrashed,
}: {
	groupKey: string
	stack: CaptureStack<Memories[number]>
	openingId: string
	onOpenMemory: (id: string) => void
	onChanged: () => void
	onTrashed: (id: string) => void
}) {
	const { t, locale } = useI18n()

	const [custom, setCustom] = useState(() => getStackName(groupKey, stack.key))
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState('')

	function startEditing() {
		setDraft(custom ?? '')
		setEditing(true)
	}

	function saveStackName() {
		setStackName(groupKey, stack.key, draft)
		setCustom(getStackName(groupKey, stack.key))
		setEditing(false)
	}

	const cards = stack.captures.map((memory, index) => (
		<SnapshotCard
			key={memory.id}
			memory={memory}
			index={index}
			opening={openingId === memory.id}
			onOpen={() => onOpenMemory(memory.id)}
			onChanged={onChanged}
			onTrashed={onTrashed}
		/>
	))
	if (stack.captures.length <= 1) {
		return <div className="album-single-stack">{cards}</div>
	}
	return (
		<div className="album-stack rounded-[6px] border border-[#2a332d] bg-[#10150f] p-3">
			<div className="mb-3 flex items-center gap-3">
				<StackThumbs
					captures={stack.captures.slice(0, 3).map(item => ({ id: item.id, thumbnail: item.metadata.thumbnail }))}
				/>
				<div className="min-w-0 flex-1">
					{editing ? (
						<span className="flex items-center gap-2">
							<input
								value={draft}
								maxLength={80}
								placeholder={t('Name this area…')}
								aria-label={t('Stack name')}
								onChange={event => setDraft(event.currentTarget.value)}
								className="h-8 min-w-0 flex-1 rounded-[4px] border border-[#354238] bg-[#1c2720] px-2 text-xs text-ink outline-0"
							/>
							<button
								type="button"
								onClick={saveStackName}
								className="h-8 flex-none cursor-pointer rounded-[4px] border border-[#354238] bg-transparent px-2 text-[11px] text-[#b4c1ad]"
							>
								{' '}
								<T message={'Save'} />{' '}
							</button>
							<button
								type="button"
								onClick={() => setEditing(false)}
								aria-label={t('Cancel')}
								className="h-8 flex-none cursor-pointer rounded-[4px] border-0 bg-transparent px-2 text-[11px] text-[#b4c1ad]"
							>
								✕
							</button>
						</span>
					) : (
						<>
							<p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold text-[#dfe7da]">
								{custom ?? `${t('Same area')} · ${formatCaptureCount(locale, stack.captures.length)}`}
							</p>
							{stack.x !== null && stack.z !== null && (
								<p className="m-0 mt-[2px] font-mono text-[10px] text-[#8e978a]">
									{' '}
									<T message={'Near'} /> {Math.floor(stack.x)}, {Math.floor(stack.y ?? 0)}, {Math.floor(stack.z)}
								</p>
							)}
						</>
					)}
				</div>
				{!editing && (
					<button
						type="button"
						onClick={startEditing}
						title={t('Rename this area')}
						aria-label={t('Rename this area')}
						className="h-8 w-8 flex-none cursor-pointer rounded-[4px] border border-[#354238] bg-transparent text-xs text-[#b4c1ad]"
					>
						✎
					</button>
				)}
			</div>
			<div className="grid grid-cols-3 gap-[17px] max-tablet:grid-cols-2 max-phone:grid-cols-1 max-phone:gap-3">
				{cards}
			</div>
		</div>
	)
}

function SnapshotCard({
	memory,
	index,
	opening,
	onOpen,
	onChanged,
	onTrashed,
}: {
	memory: Memories[number]
	index: number
	opening: boolean
	onOpen: () => void
	onChanged: () => void
	onTrashed: (id: string) => void
}) {
	const { t, locale } = useI18n()

	const { notify } = useAppContext()
	const active = useLivePage()
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(memory.name)
	const [saving, setSaving] = useState(false)
	const [shareOpen, setShareOpen] = useState(false)
	const [publicationOpen, setPublicationOpen] = useState(
		() => new URLSearchParams(window.location.search).get('publish') === memory.id
	)

	function startEditing() {
		setDraft(memory.name)
		setEditing(true)
	}

	async function saveName() {
		const name = draft.trim()
		if (!name || name === memory.name) {
			setEditing(false)
			setDraft(memory.name)
			return
		}
		setSaving(true)
		try {
			await apiClient.memories.rename({ id: memory.id, name: name.slice(0, 80) })
			if (!active.current) return
			setEditing(false)
			onChanged()
		} catch {
			if (active.current) notify('Could not save this name.')
		} finally {
			if (active.current) setSaving(false)
		}
	}

	return (
		<article className="album-capture overflow-hidden rounded-[7px] border border-[#354238] bg-[#1c2720] transition hover:-translate-y-[3px] hover:shadow-[0_13px_30px_#333d2514]">
			<div
				className={`relative grid h-[190px] place-items-center overflow-hidden max-tablet:h-40 max-phone:h-[190px] ${artTones[index % artTones.length]}`}
			>
				{memory.metadata.thumbnail ? (
					<div
						aria-hidden="true"
						className="absolute inset-0 bg-cover bg-center"
						style={{ backgroundImage: `url("${memory.metadata.thumbnail}")` }}
					/>
				) : (
					<MemoryTile variant={index % 4} />
				)}
				<span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_68%,#18251c35)]" />
			</div>
			<div className="px-[14px] py-3">
				<div className="flex items-center justify-between gap-2">
					{editing ? (
						<span className="flex min-w-0 flex-1 items-center gap-2">
							<input
								value={draft}
								maxLength={80}
								aria-label={t('Snapshot name')}
								onChange={event => setDraft(event.currentTarget.value)}
								className="h-8 min-w-0 flex-1 rounded-[4px] border border-[#354238] bg-[#10150f] px-2 text-xs text-ink outline-0"
							/>
							<button
								type="button"
								onClick={() => void saveName()}
								disabled={saving}
								className="h-8 flex-none cursor-pointer rounded-[4px] border border-[#354238] bg-transparent px-2 text-[11px] text-[#b4c1ad] disabled:opacity-60"
							>
								{saving ? '…' : t('Save')}
							</button>
							<button
								type="button"
								onClick={() => {
									setEditing(false)
									setDraft(memory.name)
								}}
								aria-label={t('Cancel')}
								className="h-8 flex-none cursor-pointer rounded-[4px] border-0 bg-transparent px-1 text-[11px] text-[#b4c1ad]"
							>
								✕
							</button>
						</span>
					) : (
						<>
							<h3 className="m-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-sans text-xs font-bold">
								{memory.name}
							</h3>
							<button
								type="button"
								onClick={startEditing}
								title={t('Rename this snapshot')}
								aria-label={t('Rename {name}', { name: memory.name })}
								className="h-7 w-7 flex-none cursor-pointer rounded-[4px] border border-transparent bg-transparent text-[11px] text-[#8e978a] hover:border-[#354238] hover:text-[#b4c1ad]"
							>
								✎
							</button>
						</>
					)}
				</div>
				<p className="mb-0 mt-[6px] flex items-center gap-[7px] text-[9px] text-[#b4c1ad]">
					{formatRelativeDate(memory.metadata.capturedAt ?? memory.createdAt, Date.now(), locale)}{' '}
					<i className="h-[3px] w-[3px] rounded-full bg-[#a5aa9b] not-italic" />{' '}
					{memory.metadata.x !== null && memory.metadata.x !== undefined
						? `${Math.floor(memory.metadata.x)}, ${Math.floor(memory.metadata.y ?? 0)}, ${Math.floor(memory.metadata.z ?? 0)} · `
						: ''}
					{formatFileSize(memory.size, locale)}
				</p>
				{memory.timeline && memory.timeline.frames > 1 && (
					<p className="mb-0 mt-[6px] text-[10px] font-bold text-[#9ab88a]">
						{memory.timeline.frames} {t('captures')} · {t('Evolution')}
					</p>
				)}
				<CaptureMetadata metadata={memory.metadata} />
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={onOpen}
						disabled={opening}
						className="inline-flex h-8 flex-none cursor-pointer items-center gap-1 rounded-[4px] border border-[#354238] bg-transparent px-2 text-[11px] text-[#b4c1ad] hover:bg-[#242e26] disabled:opacity-60"
					>
						{opening ? '…' : t('↗ Revisit')}
					</button>
					<button
						type="button"
						onClick={() => setShareOpen(open => !open)}
						aria-expanded={shareOpen}
						title={t('Share this snapshot')}
						className="inline-flex h-8 flex-none cursor-pointer items-center gap-1 rounded-[4px] border border-transparent bg-transparent px-2 text-[11px] text-[#8e978a] hover:border-[#354238] hover:text-[#b4c1ad]"
					>
						{' '}
						<T message={'🔗 Share'} />{' '}
					</button>
					<button
						type="button"
						onClick={() => onTrashed(memory.id)}
						title={t('Move to trash')}
						aria-label={t('Move {name} to trash', { name: memory.name })}
						className="inline-flex h-8 flex-none cursor-pointer items-center gap-1 rounded-[4px] border border-transparent bg-transparent px-2 text-[11px] text-[#8e978a] hover:border-[#5a3535] hover:text-[#e8a0a0]"
					>
						🗑
					</button>
				</div>
				<button
					type="button"
					aria-expanded={publicationOpen}
					onClick={() => setPublicationOpen(open => !open)}
					className="mt-3 min-h-11 rounded-md border border-[#354238] px-4 text-sm text-ink"
				>
					{t('Public publication')}
				</button>
				{publicationOpen && <PublicationPanel memory={memory} />}
				{shareOpen && <SharePanel memoryId={memory.id} />}
			</div>
		</article>
	)
}

function TrashCard({
	item,
	onRestore,
	onDelete,
}: {
	item: TrashMemories[number]
	onRestore: () => void
	onDelete: () => void
}) {
	const { t, locale } = useI18n()
	const remaining = daysUntilPurge(item.deletedAt, item.purgeAt)
	return (
		<article className="overflow-hidden rounded-[7px] border border-[#3a2f2f] bg-[#1c1a1a]">
			<div className="relative grid h-[130px] place-items-center overflow-hidden bg-[#141214]">
				{(item.metadata.thumbnail ?? item.metadata.icon) ? (
					<div
						aria-hidden="true"
						className="absolute inset-0 bg-cover bg-center opacity-70"
						style={{ backgroundImage: `url("${item.metadata.thumbnail ?? item.metadata.icon}")` }}
					/>
				) : (
					<span aria-hidden="true" className="text-xl text-[#6e6a6a]">
						▧
					</span>
				)}
			</div>
			<div className="px-[14px] py-3">
				<h3 className="m-0 overflow-hidden text-ellipsis whitespace-nowrap font-sans text-xs font-bold text-[#cfc8c8]">
					{item.name}
				</h3>
				<p className="mb-0 mt-[6px] text-[9px] text-[#8e8585]">
					{' '}
					<T message={'Deleted'} /> {formatRelativeDate(item.deletedAt, Date.now(), locale)}
					{remaining !== null ? ` · ${t('Gone in {days} days', { days: remaining })}` : ''}
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={onRestore}
						className="inline-flex h-8 cursor-pointer items-center rounded-[4px] border border-[#354238] bg-transparent px-2 text-[11px] text-[#b4c1ad]"
					>
						{' '}
						<T message={'↩ Restore'} />{' '}
					</button>
					<button
						type="button"
						onClick={onDelete}
						className="inline-flex h-8 cursor-pointer items-center rounded-[4px] border border-transparent bg-transparent px-2 text-[11px] text-[#8e8585] hover:text-[#e8a0a0]"
					>
						{' '}
						<T message={'Delete forever'} />{' '}
					</button>
				</div>
			</div>
		</article>
	)
}

function MemoryTile({ variant }: { variant: number }) {
	const palette = tilePalettes[variant % tilePalettes.length]
	if (!palette) return null
	return (
		<div
			aria-hidden="true"
			className="relative h-[82px] w-[111px] rotate-[-32deg] skew-[10deg] drop-shadow-[12px_16px_0_#374b3024]"
		>
			<div className={`absolute top-0 left-[28px] h-[55px] w-[55px] rotate-45 skew-[-12deg] ${palette.top}`} />
			<div className={`absolute right-0 bottom-1 h-[44px] w-[50px] ${palette.side}`} />
			<span className={`absolute top-[10px] left-[28px] h-[21px] w-6 ${palette.blocks[0]}`} />
			<span className={`absolute top-[2px] left-[55px] h-[21px] w-6 ${palette.blocks[1]}`} />
			<span className={`absolute top-[30px] left-[14px] h-[21px] w-6 ${palette.blocks[2]}`} />
			<span className={`absolute top-[31px] left-[43px] h-[21px] w-6 ${palette.blocks[3]}`} />
			<b className={`absolute top-[33px] left-[74px] h-[29px] w-[22px] ${palette.trunk}`} />
		</div>
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
