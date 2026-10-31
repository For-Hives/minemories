import { type ReactNode, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { GalleryIcon, type GalleryIconName } from '../components/GalleryIcons'
import { formatCaptureCount } from '../i18n/counts'
import { useI18n } from '../i18n/I18n'
import { formatRelativeDate } from '../lib/dates'
import { biomeLabel, blockCoordinates, type CaptureStack, latestCapture, viewPath } from '../lib/gallery'
import { formatFileSize } from '../lib/glb'
import { getStackName, setStackName } from '../lib/stack-names'
import { daysUntilPurge } from '../lib/trash'
import { type DialogTab, type DialogTarget, GalleryDialog } from './GalleryDialog'
import { type Memories, type TrashMemories, useLivePage } from './gallery-data'

type Memory = Memories[number]

export const dimensionLabels: Record<string, string> = {
	'minecraft:overworld': 'Overworld',
	'minecraft:the_nether': 'Nether',
	'minecraft:the_end': 'The End',
}

function Chip({ icon, kind, children }: { icon?: GalleryIconName; kind: string; children: ReactNode }) {
	return (
		<li data-kind={kind}>
			{icon && <GalleryIcon name={icon} />}
			<span className="gallery-chip-text">{children}</span>
		</li>
	)
}

function Coordinates({ metadata }: { metadata: Memory['metadata'] }) {
	const place = blockCoordinates(metadata)
	if (!place) return null
	const axes: [string, number | null][] = [
		['X', place.x],
		['Y', place.y],
		['Z', place.z],
	]
	return (
		<Chip icon="pin" kind="place">
			{axes
				.filter(([, value]) => value !== null)
				.map(([axis, value]) => (
					<span key={axis} className="gallery-axis">
						<b>{axis}</b>
						{value}
					</span>
				))}
		</Chip>
	)
}

function CaptureChips({ memory, bytes }: { memory: Memory; bytes: number }) {
	const { t, locale } = useI18n()
	const { metadata } = memory
	const weather = [metadata.raining && t('Rain'), metadata.thundering && t('Thunder')].filter(Boolean).join(' · ')
	const dimension = metadata.dimension
	const dimensionKey = dimension ? dimensionLabels[dimension] : undefined
	return (
		<ul className="gallery-chips">
			{dimension && (
				<li data-kind="dimension" data-dimension={dimensionKey ?? 'modded'}>
					<span className="gallery-dimension-dot" aria-hidden="true" />
					<span className="gallery-chip-text">{dimensionKey ? t(dimensionKey) : dimension}</span>
				</li>
			)}
			{metadata.biome && (
				<Chip icon="leaf" kind="biome">
					{biomeLabel(metadata.biome)}
				</Chip>
			)}
			<Coordinates metadata={metadata} />
			{weather && (
				<Chip icon="cloud" kind="weather">
					{weather}
				</Chip>
			)}
			<Chip icon="disk" kind="size">
				{formatFileSize(bytes, locale)}
			</Chip>
		</ul>
	)
}

function placeholderTone(key: string): number {
	let hash = 0
	for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) % 360
	return hash
}

async function renameSnapshot(memory: Memory | undefined, name: string) {
	if (memory) await apiClient.memories.rename({ id: memory.id, name })
}

/** Area names live in this browser; a single-snapshot area also renames the snapshot itself. */
function useAreaName(groupKey: string, stack: CaptureStack<Memory>, latest: Memory | undefined, onChanged: () => void) {
	const { notify } = useAppContext()
	const active = useLivePage()
	const [custom, setCustom] = useState(() => getStackName(groupKey, stack.key))
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState('')
	const [saving, setSaving] = useState(false)
	const name = custom ?? latest?.name ?? ''
	const single = stack.captures.length === 1

	function ifLive(action: () => void) {
		if (active.current) action()
	}

	function remember(next: string) {
		setStackName(groupKey, stack.key, next)
		setCustom(getStackName(groupKey, stack.key))
		setEditing(false)
		if (single) onChanged()
	}

	async function save() {
		const next = draft.trim().slice(0, 80)
		if (!next || next === name) return setEditing(false)
		setSaving(true)
		try {
			await renameSnapshot(single ? latest : undefined, next)
			ifLive(() => remember(next))
		} catch {
			ifLive(() => notify('Could not save this name.'))
		} finally {
			ifLive(() => setSaving(false))
		}
	}

	function start() {
		setDraft(name)
		setEditing(true)
	}

	return { name, editing, draft, saving, single, setDraft, setEditing, save, start }
}

function AreaTitle({ rename }: { rename: ReturnType<typeof useAreaName> }) {
	const { t } = useI18n()
	const { name, editing, draft, saving, single, setDraft, setEditing, save, start } = rename
	if (editing)
		return (
			<form
				className="gallery-rename"
				onSubmit={event => {
					event.preventDefault()
					void save()
				}}
			>
				<input
					value={draft}
					maxLength={80}
					aria-label={single ? t('Snapshot name') : t('Stack name')}
					placeholder={t('Name this area…')}
					onChange={event => setDraft(event.currentTarget.value)}
				/>
				<button type="submit" className="gallery-field-button" disabled={saving}>
					{saving ? '…' : t('Save')}
				</button>
				<button
					type="button"
					className="gallery-field-button"
					aria-label={t('Cancel')}
					onClick={() => setEditing(false)}
				>
					<GalleryIcon name="close" />
				</button>
			</form>
		)
	return (
		<div className="gallery-title">
			<h3>{name}</h3>
			<button
				type="button"
				className="gallery-icon-button"
				onClick={start}
				title={single ? t('Rename this snapshot') : t('Rename this area')}
				aria-label={single ? t('Rename {name}', { name }) : t('Rename this area')}
			>
				<GalleryIcon name="pencil" />
			</button>
		</div>
	)
}

function AreaActions({
	name,
	href,
	snapshots,
	latestId,
	onOpen,
	onTrashed,
}: {
	name: string
	href: string
	snapshots: number
	latestId: string
	onOpen: (tab: DialogTab) => void
	onTrashed: (id: string) => void
}) {
	const { t } = useI18n()
	const { setViewerFile } = useAppContext()
	return (
		<div className="gallery-actions">
			<Link
				to={href}
				className="gallery-view"
				aria-label={t('View {name}', { name })}
				onClick={() => setViewerFile(null)}
			>
				<GalleryIcon name="view" />
				{t('View')}
			</Link>
			<button
				type="button"
				className="gallery-icon-button"
				title={t('Share this snapshot')}
				aria-label={t('Share')}
				onClick={() => onOpen('share')}
			>
				<GalleryIcon name="link" />
			</button>
			<button
				type="button"
				className="gallery-icon-button"
				title={t('Public publication')}
				aria-label={t('Public publication')}
				onClick={() => onOpen('publish')}
			>
				<GalleryIcon name="globe" />
			</button>
			{snapshots > 1 ? (
				<button
					type="button"
					className="gallery-icon-button"
					title={t('Snapshots')}
					aria-label={t('Manage {name}', { name })}
					onClick={() => onOpen('snapshots')}
				>
					<GalleryIcon name="layers" />
				</button>
			) : (
				<button
					type="button"
					className="gallery-icon-button is-danger"
					title={t('Move to trash')}
					aria-label={t('Move {name} to trash', { name })}
					onClick={() => onTrashed(latestId)}
				>
					<GalleryIcon name="trash" />
				</button>
			)}
		</div>
	)
}

export function AreaCard({
	groupKey,
	stack,
	evolving,
	onChanged,
	onTrashed,
	publishId,
}: {
	groupKey: string
	stack: CaptureStack<Memory>
	evolving: boolean
	onChanged: () => void
	onTrashed: (id: string) => void
	publishId: string | null
}) {
	const { locale } = useI18n()
	const { setViewerFile } = useAppContext()
	const latest = latestCapture(stack.captures)
	const rename = useAreaName(groupKey, stack, latest, onChanged)
	const [dialog, setDialog] = useState<DialogTarget | null>(() => {
		const target = publishId && stack.captures.find(capture => capture.id === publishId)
		return target ? { tab: 'publish', id: target.id } : null
	})
	if (!latest) return null
	const snapshots = stack.captures.length
	const timeline = snapshots > 1 && evolving
	const thumbnail = latest.metadata.thumbnail ?? latest.metadata.icon
	const ordered = [...stack.captures].sort((a, b) => stampOf(b) - stampOf(a))
	const href = viewPath(latest.id, timeline)
	return (
		<article className="gallery-card" aria-label={rename.name}>
			<Link to={href} className="gallery-cover" tabIndex={-1} aria-hidden="true" onClick={() => setViewerFile(null)}>
				{thumbnail ? (
					<span className="gallery-cover-image" style={{ backgroundImage: `url("${thumbnail}")` }} />
				) : (
					<span className="gallery-cover-empty" style={{ ['--tone' as string]: placeholderTone(stack.key) }}>
						<GalleryIcon name="cube" />
					</span>
				)}
				{snapshots > 1 && (
					<span className="gallery-badge">
						<GalleryIcon name="layers" />
						{formatCaptureCount(locale, snapshots)}
					</span>
				)}
			</Link>
			<div className="gallery-body">
				<AreaTitle rename={rename} />
				<UpdatedAt memory={latest} />
				<CaptureChips memory={latest} bytes={stack.captures.reduce((total, capture) => total + capture.size, 0)} />
			</div>
			<AreaActions
				name={rename.name}
				href={href}
				snapshots={snapshots}
				latestId={latest.id}
				onOpen={tab => setDialog({ tab, id: latest.id })}
				onTrashed={onTrashed}
			/>
			{dialog && (
				<GalleryDialog
					title={rename.name}
					memories={ordered}
					target={dialog}
					onTarget={setDialog}
					onClose={() => setDialog(null)}
					onChanged={onChanged}
					onTrashed={onTrashed}
				/>
			)}
		</article>
	)
}

function stampOf(memory: Memory): number {
	return Date.parse(memory.metadata.capturedAt ?? memory.createdAt)
}

function UpdatedAt({ memory }: { memory: Memory }) {
	const { t, locale } = useI18n()
	return (
		<p className="gallery-when">
			{t('Updated {date}', {
				date: formatRelativeDate(memory.metadata.capturedAt ?? memory.createdAt, Date.now(), locale),
			})}
		</p>
	)
}

export function TrashCard({
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
	const thumbnail = item.metadata.thumbnail ?? item.metadata.icon
	return (
		<article className="gallery-trash-card">
			<span
				aria-hidden="true"
				className="gallery-snapshot-thumb"
				style={thumbnail ? { backgroundImage: `url("${thumbnail}")` } : undefined}
			/>
			<div className="gallery-snapshot-text">
				<h3>{item.name}</h3>
				<span className="gallery-snapshot-meta">
					{t('Deleted')} {formatRelativeDate(item.deletedAt, Date.now(), locale)}
					{remaining !== null ? ` · ${t('Gone in {days} days', { days: remaining })}` : ''}
				</span>
			</div>
			<div className="gallery-snapshot-actions">
				<button type="button" className="gallery-text-button" onClick={onRestore}>
					{t('↩ Restore')}
				</button>
				<button type="button" className="gallery-text-button is-danger" onClick={onDelete}>
					{t('Delete forever')}
				</button>
			</div>
		</article>
	)
}
