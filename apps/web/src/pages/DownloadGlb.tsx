import { useEffect, useRef, useState } from 'react'
import { apiBase } from '../api-client'
import { useAppContext } from '../app-context'
import { GalleryIcon } from '../components/GalleryIcons'
import { useI18n } from '../i18n/I18n'
import { CaptureRestorationRequired, captureFileName, downloadCapture } from '../lib/capture-file'
import './download-glb.css'

/** Saves a snapshot the account owns as a self-contained `.glb`, through the owner-scoped download route. */
export function DownloadGlb({
	memoryId,
	name,
	compact = false,
}: {
	memoryId: string
	name: string
	compact?: boolean
}) {
	const { t } = useI18n()
	const { notify } = useAppContext()
	const [busy, setBusy] = useState(false)
	const controller = useRef<AbortController | null>(null)
	useEffect(() => () => controller.current?.abort(), [])

	async function download() {
		if (busy) return
		const abort = new AbortController()
		controller.current = abort
		setBusy(true)
		try {
			const file = await downloadCapture(
				`${apiBase}/api/memories/${encodeURIComponent(memoryId)}/file`,
				captureFileName(name),
				abort.signal
			)
			const url = URL.createObjectURL(file)
			const link = document.createElement('a')
			link.href = url
			link.download = file.name
			link.click()
			setTimeout(() => URL.revokeObjectURL(url), 10_000)
		} catch (cause) {
			if (abort.signal.aborted) return
			notify(
				cause instanceof CaptureRestorationRequired
					? t('This snapshot is archived. Open it once to restore it, then download it again.')
					: t('Could not download this snapshot.')
			)
		} finally {
			if (!abort.signal.aborted) setBusy(false)
		}
	}
	const label = t('Download the GLB file')
	return compact ? (
		<button
			type="button"
			className="gallery-icon-button"
			title={label}
			aria-label={`${label}: ${name}`}
			disabled={busy}
			onClick={() => void download()}
		>
			<GalleryIcon name="download" />
		</button>
	) : (
		<button type="button" className="gallery-download" disabled={busy} onClick={() => void download()}>
			<GalleryIcon name="download" />
			{busy ? t('Preparing the file…') : label}
		</button>
	)
}
