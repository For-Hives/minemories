import { createPortal } from 'react-dom'
import { useI18n } from '../i18n/I18n'
import { useModal } from './GalleryDialog'

/**
 * Asks before a snapshot in the trash is deleted for good: the gallery's own panel, centred over its veil, instead of
 * the browser's confirm box. Escape, the veil and Cancel close it and give focus back to the button that opened it; after a
 * confirmation the trash heading takes focus instead (`TrashSection`), since that button is then disabled.
 */
export function ConfirmDelete({ name, onConfirm, onCancel }: { name: string; onConfirm(): void; onCancel(): void }) {
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
				<h2 id="gallery-confirm-title">{t('Delete {name} forever?', { name })}</h2>
				<p id="gallery-confirm-note">{t('This cannot be undone.')}</p>
				<div className="gallery-confirm-actions">
					<button type="button" className="gallery-text-button" onClick={onCancel}>
						{t('Cancel')}
					</button>
					<button type="button" className="gallery-text-button is-danger" onClick={onConfirm}>
						{t('Delete forever')}
					</button>
				</div>
			</div>
		</div>,
		document.body
	)
}
