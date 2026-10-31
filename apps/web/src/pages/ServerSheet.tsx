import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { GalleryIcon } from '../components/GalleryIcons'
import { formatCaptureCount } from '../i18n/counts'
import { useI18n } from '../i18n/I18n'
import { formatRelativeDate } from '../lib/dates'
import { type CaptureArea, latestCapture, viewPath } from '../lib/gallery'
import { formatFileSize } from '../lib/glb'
import { useModal } from './GalleryDialog'
import { dimensionLabels, Fact } from './GalleryFacts'
import type { Memories } from './gallery-data'

type Memory = Memories[number]

export interface SheetServer {
	key: string
	name: string
	captures: Memory[]
	areas: CaptureArea<Memory>[]
}

function stamp(memory: Memory): string {
	return memory.metadata.capturedAt ?? memory.createdAt
}

function NameField({
	server,
	name,
	onRename,
}: {
	server: SheetServer
	name: string
	onRename: (name: string) => void
}) {
	const { t } = useI18n()
	const [draft, setDraft] = useState(name)
	const custom = name !== server.name
	return (
		<form
			className="gallery-sheet-name"
			onSubmit={event => {
				event.preventDefault()
				onRename(draft.trim() === server.name ? '' : draft)
			}}
		>
			<label htmlFor="server-name">{t('Server name')}</label>
			<div>
				<input
					id="server-name"
					value={draft}
					maxLength={80}
					placeholder={server.name}
					onChange={event => setDraft(event.currentTarget.value)}
				/>
				<button type="submit" className="mm-button" disabled={draft.trim() === name}>
					{t('Save')}
				</button>
			</div>
			{custom && (
				<button
					type="button"
					className="gallery-sheet-reset"
					onClick={() => {
						setDraft(server.name)
						onRename('')
					}}
				>
					{t('Restore “{name}”', { name: server.name })}
				</button>
			)}
			<small>{t('This name stays in this browser.')}</small>
		</form>
	)
}

/** Everything about one server or world, and the place to rename it. */
export function ServerSheet({
	server,
	name,
	onRename,
	onClose,
}: {
	server: SheetServer
	name: string
	onRename: (name: string) => void
	onClose: () => void
}) {
	const { t, locale } = useI18n()
	const dialog = useModal(onClose)
	const ordered = [...server.captures].sort((a, b) => Date.parse(stamp(a)) - Date.parse(stamp(b)))
	const first = ordered[0]
	const newest = latestCapture(server.captures)
	const seed = server.captures.find(item => item.metadata.seed)?.metadata.seed
	const dimensions = [...new Set(server.captures.map(item => item.metadata.dimension).filter(Boolean))] as string[]
	const bytes = server.captures.reduce((total, capture) => total + capture.size, 0)
	return createPortal(
		<div className="gallery-backdrop">
			<button type="button" className="gallery-backdrop-hit" tabIndex={-1} aria-hidden="true" onClick={onClose} />
			<div
				ref={dialog}
				className="gallery-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="server-sheet-title"
				tabIndex={-1}
			>
				<header>
					<div>
						<h2 id="server-sheet-title">{name}</h2>
						<p>{formatCaptureCount(locale, server.captures.length)}</p>
					</div>
					<button type="button" className="gallery-icon-button" onClick={onClose} aria-label={t('Close')}>
						<GalleryIcon name="close" />
					</button>
				</header>
				<div className="gallery-dialog-body gallery-sheet">
					<NameField server={server} name={name} onRename={onRename} />
					<dl className="gallery-facts">
						<Fact icon="layers" label={t('Snapshots')}>
							{server.captures.length}
						</Fact>
						<Fact icon="disk" label={t('Size')}>
							{formatFileSize(bytes, locale)}
						</Fact>
						{first && (
							<Fact icon="clock" label={t('First capture')}>
								{new Date(stamp(first)).toLocaleDateString(locale)}
							</Fact>
						)}
						{newest && (
							<Fact icon="clock" label={t('Last visit {date}', { date: '' }).trim()}>
								{formatRelativeDate(stamp(newest), Date.now(), locale)}
							</Fact>
						)}
						{dimensions.length > 0 && (
							<Fact icon="globe" label={t('Dimension')} wide>
								<span className="gallery-fact-list">
									{dimensions.map(dimension => (
										<span
											key={dimension}
											className="gallery-fact-dimension"
											data-dimension={dimensionLabels[dimension] ?? 'modded'}
										>
											{t(dimensionLabels[dimension] ?? dimension)}
										</span>
									))}
								</span>
							</Fact>
						)}
						{seed && (
							<Fact icon="cube" label={t('Seed')} wide>
								<code>{seed}</code>
							</Fact>
						)}
					</dl>
					<h3>{t('Areas')}</h3>
					<ul className="gallery-snapshots">
						{server.areas.map(area => {
							const latest = latestCapture(area.stack.captures)
							if (!latest) return null
							const image = latest.metadata.thumbnail ?? latest.metadata.icon
							return (
								<li key={area.stack.key}>
									<span
										aria-hidden="true"
										className="gallery-snapshot-thumb"
										style={image ? { backgroundImage: `url("${image}")` } : undefined}
									/>
									<div className="gallery-snapshot-text">
										<strong>{latest.name}</strong>
										<span className="gallery-snapshot-meta">
											{formatCaptureCount(locale, area.stack.captures.length)} ·{' '}
											{formatRelativeDate(stamp(latest), Date.now(), locale)}
										</span>
									</div>
									<div className="gallery-snapshot-actions">
										<Link
											className="gallery-icon-button"
											to={viewPath(latest.id, area.evolving && area.stack.captures.length > 1)}
											aria-label={t('View {name}', { name: latest.name })}
											title={t('View')}
										>
											<GalleryIcon name="view" />
										</Link>
									</div>
								</li>
							)
						})}
					</ul>
				</div>
			</div>
		</div>,
		document.body
	)
}
