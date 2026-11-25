import { type RefObject, useEffect, useState } from 'react'
import { apiClient } from '../api-client'
import { useI18n } from '../i18n/I18n'
import type { ViewerScene } from '../viewer-scene'
import { buttonDark, buttonLime } from './ui'

/** The API keeps pictures under this many characters (a data URL). */
const MAX_PICTURE = 96_000
/** Lower JPEG qualities tried in turn until a busy view fits. */
const QUALITIES = [0.8, 0.65, 0.5, 0.35]

/** The view on screen as a gallery picture (400 × 250, the gallery's previews), small enough to keep. */
export function pictureOf(scene: ViewerScene | null): string | null {
	for (const quality of QUALITIES) {
		const image = scene?.snapshot(400, 250, quality) ?? null
		if (!image || image.length <= MAX_PICTURE) return image
	}
	return null
}

type Profile = { key: string; name: string | null; defaultName: string }

/** The game's name again when cleared or typed as it is; no rename while the profile is unknown and the field empty. */
function renaming(profile: Profile | null, next: string): { name?: string | null } {
	if (!profile) return next ? { name: next } : {}
	return { name: next && next !== profile.defaultName ? next : null }
}

/**
 * The owner picks their server's picture from the viewer, and only here: the view on screen, never an uploaded
 * image. The panel shows it as the gallery's server card and as a public card before saving; saving also keeps it
 * as this capture's picture (`memories.setCover`), and renames the server when the name changed.
 */
export function ViewerCover({
	sceneRef,
	memoryId,
	onClose,
	onSaved,
}: {
	sceneRef: RefObject<ViewerScene | null>
	memoryId: string
	onClose(): void
	onSaved(): void
}) {
	const { t } = useI18n()
	const [image, setImage] = useState<string | null>(() => pictureOf(sceneRef.current))
	const [profile, setProfile] = useState<Profile | null>(null)
	const [name, setName] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')

	useEffect(() => {
		let active = true
		apiClient.memories
			.serverProfile({ id: memoryId })
			.then(found => {
				if (!active) return
				setProfile(found)
				setName(found.name ?? found.defaultName)
			})
			.catch(() => undefined)
		return () => {
			active = false
		}
	}, [memoryId])

	const shownName = name.trim() || profile?.defaultName || ''
	async function save() {
		if (!image || busy) return
		setBusy(true)
		setError('')
		try {
			await apiClient.memories.setCover({ id: memoryId, image, ...renaming(profile, name.trim()) })
			onSaved()
		} catch {
			setError(t('Could not save the cover. Try again.'))
			setBusy(false)
		}
	}

	return (
		<section className="viewer-sharing viewer-cover" aria-labelledby="viewer-cover-title">
			<div className="cinema-panel-heading">
				<h2 id="viewer-cover-title">{t('Cover')}</h2>
				<button type="button" aria-label={t('Close')} onClick={onClose}>
					×
				</button>
			</div>
			<p>{t('The view on screen becomes the cover.')}</p>
			{image ? (
				<div className="viewer-cover-previews">
					<figure>
						<figcaption>{t('In your gallery')}</figcaption>
						<div className="viewer-cover-server">
							<img src={image} alt="" />
							<strong>{shownName}</strong>
						</div>
					</figure>
					<figure>
						<figcaption>{t('When public')}</figcaption>
						<div className="viewer-cover-public">
							<img src={image} alt="" />
							<strong>{shownName}</strong>
						</div>
					</figure>
				</div>
			) : (
				<p role="alert">{t('Could not take this view. Move the camera and retake.')}</p>
			)}
			<label className="viewer-cover-name">
				{t('World name')}
				<input
					className="mc-field"
					value={name}
					maxLength={80}
					placeholder={profile?.defaultName}
					onChange={event => setName(event.target.value)}
				/>
			</label>
			{error && <p role="alert">{error}</p>}
			<div className="viewer-cover-actions">
				<button type="button" className={buttonDark} onClick={() => setImage(pictureOf(sceneRef.current))}>
					{t('Retake')}
				</button>
				<button type="button" className={buttonLime} disabled={!image || busy} onClick={() => void save()}>
					{busy ? '…' : t('Use as cover')}
				</button>
			</div>
		</section>
	)
}
