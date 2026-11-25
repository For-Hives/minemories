import type { TemporalFrame } from '@minemories/api-contract'
import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../api-client'
import { ViewerHeader } from '../components/ViewerChrome'
import { type FilmActions, useWorldEvolution, type WorldSource, WorldStage } from '../components/WorldViewer'
import { useI18n } from '../i18n/I18n'
import { CaptureRestorationRequired } from '../lib/capture-file'
import { RestorationNeeded } from '../lib/world-load'
import { fetchTemporalFile } from './temporal-files'

async function download(frame: TemporalFrame, signal: AbortSignal): Promise<File> {
	try {
		return await fetchTemporalFile(frame, signal)
	} catch (error) {
		if (error instanceof CaptureRestorationRequired) throw new RestorationNeeded()
		throw error
	}
}

/** Small capture images already shown in the gallery; the world view never blocks on them. */
function useCaptureImages() {
	const [images, setImages] = useState<Map<string, string>>(new Map())
	useEffect(() => {
		let live = true
		apiClient.memories
			.list()
			.then(memories => {
				if (!live) return
				const found = new Map<string, string>()
				for (const memory of memories) {
					const image = memory.metadata.icon ?? memory.metadata.thumbnail
					if (image) found.set(memory.id, image)
				}
				setImages(found)
			})
			.catch(() => undefined)
		return () => {
			live = false
		}
	}, [])
	return images
}

const openAlone = (frame: TemporalFrame) => `/viewer?memory=${encodeURIComponent(frame.id)}`

/** The owner's world: every capture of it in one scene, each one openable alone (where an archived one restores). */
export function WorldPage({ memoryId }: { memoryId: string }) {
	const { t } = useI18n()
	const source = useMemo<WorldSource>(
		() => ({
			key: memoryId,
			load: signal => apiClient.timelapse.world({ memoryId }, { signal }),
			download,
			unavailable: 'This world is unavailable. Sign in as its owner, or return to your gallery.',
		}),
		[memoryId]
	)
	const state = useWorldEvolution(source)
	const images = useCaptureImages()
	const actions = useMemo<FilmActions>(() => ({ openAlone, images }), [images])
	const { world, step } = state
	return (
		<section className="viewer-page cinema-page timelapse-page">
			<ViewerHeader title={world?.name ?? t('World')} backLabel={t('My gallery')} />
			<WorldStage
				state={state}
				actions={actions}
				memoryId={world?.frames[step]?.id ?? null}
				ariaLabel={t('Interactive 3D scene')}
			/>
		</section>
	)
}
