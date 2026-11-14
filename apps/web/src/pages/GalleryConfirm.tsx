import { createPortal } from 'react-dom'
import { useI18n } from '../i18n/I18n'
import { useModal } from './GalleryDialog'

/**
 * Asks before something in the trash is deleted for good (one snapshot, or the whole trash): the gallery's own panel,
 * centred over its veil, instead of the browser's confirm box. Escape, the veil and Cancel close it and give focus back
 * to the button that opened it; after a confirmation the page moves the focus itself (`TrashSection`, `GalleryPage`),
 * since that button is then disabled or gone. `title`, `note` and `confirmLabel` arrive translated.
 */
export function ConfirmDelete({
	title,
	note,
	confirmLabel,
	onConfirm,
	onCancel,
}: {
	title: string
	note?: string
	confirmLabel?: string
	onConfirm(): void
	onCancel(): void
}) {
	const { t } = useI18n()
	const dialog = useModal(onCancel)
	// Portalled so a hovered card's transform cannot become the containing block of the fixed overlay.
	return createPortal(
		<div className="gallery-backdrop is-centered">
			<button type="button" className="gallery-backdrop-hit" tabIndex={-1} aria-hidden="true" onClick={onCancel} />
			<div
				ref={dialog}
				className="gallery-confirm"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="gallery-confirm-title"
				aria-describedby="gallery-confirm-note"
				tabIndex={-1}
			>
				<h2 id="gallery-confirm-title">{title}</h2>
				<p id="gallery-confirm-note">{note ?? t('This cannot be undone.')}</p>
				<div className="gallery-confirm-actions">
					<button type="button" className="gallery-text-button" onClick={onCancel}>
						{t('Cancel')}
					</button>
					<button type="button" className="gallery-text-button is-danger" onClick={onConfirm}>
						{confirmLabel ?? t('Delete forever')}
					</button>
				</div>
			</div>
		</div>,
		document.body
	)
}
