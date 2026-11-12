import { useEffect, useRef } from 'react'
import { GalleryIcon } from '../components/GalleryIcons'
import { useI18n } from '../i18n/I18n'
import type { Draft } from './use-draft'
import './editing.css'

/** "Draft, not saved yet", with the way back to the saved value. */
export function DraftMarker({ onDiscard, className = 'mm-draft' }: { onDiscard: () => void; className?: string }) {
	const { t } = useI18n()
	return (
		<p className={className}>
			<span className="mm-draft-chip">{t('Draft, not saved yet')}</span>
			<button type="button" className="mm-draft-discard" onClick={onDiscard}>
				{t('Discard draft')}
			</button>
		</p>
	)
}

/** A polite "Saved" after a successful save; the live region stays mounted so it is announced. */
export function SavedNote({ visible }: { visible: boolean }) {
	const { t } = useI18n()
	return (
		<span role="status" className="mm-saved-note">
			{visible ? t('Saved') : ''}
		</span>
	)
}

/** Gives focus back to the edit button when an inline edit ends, so the keyboard never lands on the page body. */
export function useReturnFocus(editing: boolean) {
	const button = useRef<HTMLButtonElement>(null)
	const was = useRef(editing)
	useEffect(() => {
		if (was.current && !editing) button.current?.focus()
		was.current = editing
	}, [editing])
	return button
}

/**
 * Inline rename: focused once with the caret at the end when it opens, Enter saves, Escape stops editing and keeps the
 * draft (also when it sits in a dialog: the dialog stays open).
 */
export function RenameForm({
	draft,
	saved,
	label,
	placeholder,
	saving,
	error,
	className,
	onSave,
	onCancel,
}: {
	draft: Draft<string>
	saved: string
	label: string
	placeholder?: string
	saving: boolean
	error: string
	className?: string
	onSave: () => void
	onCancel: () => void
}) {
	const { t } = useI18n()
	const input = useRef<HTMLInputElement>(null)
	useEffect(() => {
		const field = input.current
		if (!field) return
		field.focus()
		field.setSelectionRange(field.value.length, field.value.length)
	}, [])
	const next = draft.value.trim()
	const unchanged = !next || next === saved
	return (
		<form
			className={className}
			onSubmit={event => {
				event.preventDefault()
				if (!saving) onSave()
			}}
		>
			<div className="mm-rename-row">
				<input
					ref={input}
					value={draft.value}
					maxLength={80}
					aria-label={label}
					aria-invalid={error ? true : undefined}
					placeholder={placeholder}
					onChange={event => draft.setValue(event.currentTarget.value)}
					onKeyDown={event => {
						if (event.key !== 'Escape') return
						event.preventDefault()
						onCancel()
					}}
				/>
				<button type="submit" className="gallery-field-button" disabled={saving || unchanged}>
					{saving ? t('Saving…') : t('Save')}
				</button>
				<button type="button" className="gallery-field-button" aria-label={t('Cancel')} onClick={onCancel}>
					<GalleryIcon name="close" />
				</button>
			</div>
			{draft.isDraft && (
				<DraftMarker
					onDiscard={() => {
						draft.discard()
						input.current?.focus()
					}}
				/>
			)}
			{error && (
				<p role="alert" className="mm-field-error">
					{t(error)}
				</p>
			)}
		</form>
	)
}

/** The small "Draft" chip beside an edit button, when unsaved typing waits behind it. */
export function DraftChip() {
	const { t } = useI18n()
	return (
		<span className="mm-draft-chip is-small" title={t('Draft, not saved yet')}>
			{t('Draft')}
		</span>
	)
}
