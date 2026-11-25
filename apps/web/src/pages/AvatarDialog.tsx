import { minecraftHeadUrl } from '@minemories/api-contract'
import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buttonDark, buttonLime } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { useModal } from './GalleryDialog'

/** Java Edition names, as the API checks them (`minecraftUsername`). */
const MINECRAFT_NAME = /^\w{3,16}$/
/** The preview waits for a pause in typing: head.sttr.io sees a finished name, not every keystroke. */
const PREVIEW_DELAY_MS = 400

/** Head a name shows once typing stops, or `null` while the name is unfinished or invalid. */
function usePreview(name: string): string | null {
	const [preview, setPreview] = useState<string | null>(null)
	useEffect(() => {
		const trimmed = name.trim()
		if (!MINECRAFT_NAME.test(trimmed)) {
			setPreview(null)
			return
		}
		const timer = setTimeout(() => setPreview(minecraftHeadUrl(trimmed)), PREVIEW_DELAY_MS)
		return () => clearTimeout(timer)
	}, [name])
	return preview
}

/**
 * Picks the avatar: a Minecraft name, the head it gives, then save. `current` is the image shown today (a head or a
 * sign-in provider photo) and `initial` the letter shown without one. `onSave` and `onRemove` reject on failure: the
 * dialog stays open and shows `error`, the page's translated message.
 */
export function AvatarDialog({
	current,
	initial,
	busy,
	error,
	onSave,
	onRemove,
	onClose,
}: {
	current: string | null
	initial: string
	busy: boolean
	error: string
	onSave(username: string): Promise<void>
	onRemove(): Promise<void>
	onClose(): void
}) {
	const { t } = useI18n()
	const dialog = useModal(onClose)
	const field = useRef<HTMLInputElement>(null)
	// After `useModal` focused the dialog: typing goes straight to the name.
	useEffect(() => field.current?.focus(), [])
	const [name, setName] = useState('')
	const preview = usePreview(name)
	const shown = preview ?? current
	function submit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		void onSave(name.trim())
			.then(onClose)
			.catch(() => undefined)
	}
	function remove() {
		void onRemove()
			.then(onClose)
			.catch(() => undefined)
	}
	return createPortal(
		<div className="mm-avatar-backdrop">
			<button type="button" className="mm-avatar-backdrop-hit" tabIndex={-1} aria-hidden="true" onClick={onClose} />
			<div
				ref={dialog}
				className="mm-avatar-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="avatar-dialog-title"
				tabIndex={-1}
			>
				<h2 id="avatar-dialog-title" className="mm-avatar-title">
					{t('Avatar')}
				</h2>
				<p>{t('Type a Minecraft name to use its head.')}</p>
				<form className="mm-avatar-form" aria-labelledby="avatar-dialog-title" onSubmit={submit}>
					<span className="mm-avatar-preview mm-avatar-dialog-preview">
						<span aria-hidden="true">{initial}</span>
						{shown && <img src={shown} alt={t('Avatar preview')} width={96} height={96} />}
					</span>
					<label>
						{t('Minecraft name')}
						<input
							ref={field}
							className="mc-field"
							name="username"
							autoComplete="off"
							pattern="\w{3,16}"
							minLength={3}
							maxLength={16}
							required
							spellCheck={false}
							value={name}
							onChange={event => setName(event.target.value)}
							disabled={busy}
						/>
					</label>
					{error && (
						<p className="mm-account-error" role="alert">
							{error}
						</p>
					)}
					<p className="mm-avatar-note">{t('Only this name is sent, to head.sttr.io.')}</p>
					<div className="mm-avatar-actions">
						{current && (
							<button type="button" className={`${buttonDark} mm-avatar-remove`} disabled={busy} onClick={remove}>
								{t('Remove avatar')}
							</button>
						)}
						<button type="button" className={buttonDark} disabled={busy} onClick={onClose}>
							{t('Cancel')}
						</button>
						<button className={buttonLime} type="submit" disabled={busy || !preview}>
							{busy ? t('Saving…') : t('Save avatar')}
						</button>
					</div>
				</form>
			</div>
		</div>,
		document.body
	)
}
