import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { GalleryIcon } from '../components/GalleryIcons'
import { SharePanel } from '../components/SharePanel'
import { formatCaptureCount } from '../i18n/counts'
import { useI18n } from '../i18n/I18n'
import { formatRelativeDate } from '../lib/dates'
import { viewPath } from '../lib/gallery'
import { formatFileSize } from '../lib/glb'
import { CaptureFacts } from './GalleryFacts'
import { type Memories, useLivePage } from './gallery-data'
import { PublicationPanel } from './PublicDiscovery'

export type DialogTab = 'details' | 'share' | 'publish' | 'snapshots'
export interface DialogTarget {
	tab: DialogTab
	id: string
}

type Memory = Memories[number]

const FOCUSABLE = 'a[href], button:not(:disabled), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Keeps Tab inside the dialog; the dialog itself counts as the position before its first control. */
function trapFocus(event: KeyboardEvent, dialog: HTMLElement) {
	const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
	const first = items[0]
	const last = items.at(-1)
	const current = document.activeElement
	const leavingStart = event.shiftKey && (current === dialog || current === first)
	const leavingEnd = !event.shiftKey && current === last
	if (!(leavingStart || leavingEnd)) return
	event.preventDefault()
	;(leavingStart ? last : first)?.focus()
}

export function useModal(onClose: () => void) {
	const dialog = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
		dialog.current?.focus()
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') onClose()
			else if (event.key === 'Tab' && dialog.current) trapFocus(event, dialog.current)
		}
		document.addEventListener('keydown', onKey)
		const overflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.removeEventListener('keydown', onKey)
			document.body.style.overflow = overflow
			opener?.focus()
		}
	}, [onClose])
	return dialog
}

export function GalleryDialog({
	title,
	memories,
	target,
	onTarget,
	onClose,
	onChanged,
	onTrashed,
}: {
	title: string
	memories: Memories
	target: DialogTarget
	onTarget: (target: DialogTarget) => void
	onClose: () => void
	onChanged: () => void
	onTrashed: (id: string) => void
}) {
	const { t, locale } = useI18n()
	const dialog = useModal(onClose)
	const selected = memories.find(memory => memory.id === target.id) ?? memories[0]
	const tabs: Array<[DialogTab, string]> = [
		['details', t('Details')],
		['share', t('Share')],
		['publish', t('Public publication')],
		...(memories.length > 1 ? [['snapshots', t('Snapshots')] as [DialogTab, string]] : []),
	]
	if (!selected) return null
	// Portalled so a hovered card's transform cannot become the containing block of the fixed overlay.
	return createPortal(
		<div className="gallery-backdrop">
			<button type="button" className="gallery-backdrop-hit" tabIndex={-1} aria-hidden="true" onClick={onClose} />
			<div
				ref={dialog}
				className="gallery-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="gallery-dialog-title"
				tabIndex={-1}
			>
				<header>
					<div>
						<h2 id="gallery-dialog-title">{title}</h2>
						<p>
							{target.tab === 'snapshots'
								? formatCaptureCount(locale, memories.length)
								: `${selected.name} · ${formatRelativeDate(selected.metadata.capturedAt ?? selected.createdAt, Date.now(), locale)}`}
						</p>
					</div>
					<button type="button" className="gallery-icon-button" onClick={onClose} aria-label={t('Close')}>
						<GalleryIcon name="close" />
					</button>
				</header>
				<div className="gallery-tabs" role="tablist">
					{tabs.map(([tab, label]) => (
						<button
							key={tab}
							type="button"
							className="gallery-tab"
							role="tab"
							aria-selected={target.tab === tab}
							onClick={() => onTarget({ tab, id: selected.id })}
						>
							{label}
						</button>
					))}
				</div>
				<div className="gallery-dialog-body" role="tabpanel">
					{target.tab === 'details' && <CaptureFacts memory={selected} />}
					{target.tab === 'share' && <SharePanel key={selected.id} memoryId={selected.id} />}
					{target.tab === 'publish' && <PublicationPanel key={selected.id} memory={selected} />}
					{target.tab === 'snapshots' && (
						<SnapshotList
							memories={memories}
							onTarget={onTarget}
							onChanged={onChanged}
							onTrashed={onTrashed}
							timeline={memories.length > 1}
						/>
					)}
				</div>
			</div>
		</div>,
		document.body
	)
}

function SnapshotList({
	memories,
	timeline,
	onTarget,
	onChanged,
	onTrashed,
}: {
	memories: Memories
	timeline: boolean
	onTarget: (target: DialogTarget) => void
	onChanged: () => void
	onTrashed: (id: string) => void
}) {
	return (
		<ul className="gallery-snapshots">
			{memories.map(memory => (
				<SnapshotRow
					key={memory.id}
					memory={memory}
					timeline={timeline}
					onTarget={onTarget}
					onChanged={onChanged}
					onTrashed={onTrashed}
				/>
			))}
		</ul>
	)
}

function SnapshotRow({
	memory,
	timeline,
	onTarget,
	onChanged,
	onTrashed,
}: {
	memory: Memory
	timeline: boolean
	onTarget: (target: DialogTarget) => void
	onChanged: () => void
	onTrashed: (id: string) => void
}) {
	const { t, locale } = useI18n()
	const { notify } = useAppContext()
	const active = useLivePage()
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(memory.name)
	const [saving, setSaving] = useState(false)
	const thumbnail = memory.metadata.thumbnail ?? memory.metadata.icon

	async function save() {
		const name = draft.trim().slice(0, 80)
		if (!name || name === memory.name) {
			setEditing(false)
			setDraft(memory.name)
			return
		}
		setSaving(true)
		try {
			await apiClient.memories.rename({ id: memory.id, name })
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
		<li>
			<span
				aria-hidden="true"
				className="gallery-snapshot-thumb"
				style={thumbnail ? { backgroundImage: `url("${thumbnail}")` } : undefined}
			/>
			<div className="gallery-snapshot-text">
				{editing ? (
					<form
						onSubmit={event => {
							event.preventDefault()
							void save()
						}}
					>
						<input
							value={draft}
							maxLength={80}
							aria-label={t('Snapshot name')}
							onChange={event => setDraft(event.currentTarget.value)}
						/>
						<button type="submit" className="gallery-field-button" disabled={saving}>
							{saving ? '…' : t('Save')}
						</button>
						<button
							type="button"
							className="gallery-field-button"
							aria-label={t('Cancel')}
							onClick={() => {
								setEditing(false)
								setDraft(memory.name)
							}}
						>
							<GalleryIcon name="close" />
						</button>
					</form>
				) : (
					<>
						<strong>{memory.name}</strong>
						<span className="gallery-snapshot-meta">
							{formatRelativeDate(memory.metadata.capturedAt ?? memory.createdAt, Date.now(), locale)} ·{' '}
							{formatFileSize(memory.size, locale)}
						</span>
					</>
				)}
			</div>
			<div className="gallery-snapshot-actions">
				<Link
					className="gallery-icon-button"
					to={viewPath(memory.id, timeline)}
					title={t('Open this snapshot')}
					aria-label={`${t('Open this snapshot')}: ${memory.name}`}
				>
					<GalleryIcon name="view" />
				</Link>
				<button
					type="button"
					className="gallery-icon-button"
					title={t('Rename this snapshot')}
					aria-label={t('Rename {name}', { name: memory.name })}
					onClick={() => setEditing(true)}
				>
					<GalleryIcon name="pencil" />
				</button>
				<button
					type="button"
					className="gallery-icon-button"
					title={t('Share this snapshot')}
					aria-label={`${t('Share this snapshot')}: ${memory.name}`}
					onClick={() => onTarget({ tab: 'share', id: memory.id })}
				>
					<GalleryIcon name="link" />
				</button>
				<button
					type="button"
					className="gallery-icon-button"
					title={t('Public publication')}
					aria-label={`${t('Public publication')}: ${memory.name}`}
					onClick={() => onTarget({ tab: 'publish', id: memory.id })}
				>
					<GalleryIcon name="globe" />
				</button>
				<button
					type="button"
					className="gallery-icon-button is-danger"
					title={t('Move to trash')}
					aria-label={t('Move {name} to trash', { name: memory.name })}
					onClick={() => onTrashed(memory.id)}
				>
					<GalleryIcon name="trash" />
				</button>
			</div>
		</li>
	)
}
