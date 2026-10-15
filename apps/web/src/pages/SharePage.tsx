import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { apiBase, apiClient } from '../api-client'
import { ViewerHeader, ViewerLoadState } from '../components/ViewerChrome'
import { ViewerStudio } from '../components/ViewerStudio'
import { T, useI18n } from '../i18n/I18n'
import { formatFileSize } from '../lib/glb'
import { ViewerScene } from '../viewer-scene'
import { ticksToMinutes } from './ViewerPage'

interface SharedCapture {
	name: string
	size: number
	metadata: {
		x: number | null
		y: number | null
		z: number | null
		dayTime: number | null
		dimension: string | null
		seed: string | null
		biome: string | null
	}
}

async function fetchSharedCapture(token: string, signal: AbortSignal): Promise<{ capture: SharedCapture; file: File }> {
	const metaResponse = await fetch(`${apiBase}/api/shared/${encodeURIComponent(token)}`, { signal })
	if (!metaResponse.ok) throw new Error('This link is invalid or was revoked.')
	const capture = (await metaResponse.json()) as SharedCapture
	const fileResponse = await fetch(`${apiBase}/api/shared/${encodeURIComponent(token)}/file`, { signal })
	if (!fileResponse.ok) throw new Error('Could not download this world.')
	return { capture, file: new File([await fileResponse.blob()], 'shared.glb', { type: 'model/gltf-binary' }) }
}

async function fetchPublicCapture(
	id: string,
	review: boolean,
	signal: AbortSignal
): Promise<{ capture: SharedCapture; file: File }> {
	const procedure = review ? apiClient.discovery.review : apiClient.discovery.get
	const entry = await procedure({ id }, { signal })
	const response = await fetch(`${apiBase}/api/public/${encodeURIComponent(id)}/file`, {
		signal,
		credentials: 'include',
	})
	if (!response.ok) throw new Error('This publication is unavailable or was withdrawn.')
	const file = new File([await response.blob()], 'public.glb', { type: 'model/gltf-binary' })
	return {
		file,
		capture: {
			name: entry.title,
			size: file.size,
			metadata: { x: null, y: null, z: null, dayTime: null, dimension: null, seed: null, biome: null },
		},
	}
}

function applySharedCapture(scene: ViewerScene, capture: SharedCapture, onTitle: (name: string) => void): void {
	scene.setCaptureContext({
		x: capture.metadata.x,
		y: capture.metadata.y,
		z: capture.metadata.z,
		dayTime: capture.metadata.dayTime,
		dimension: capture.metadata.dimension,
		seed: capture.metadata.seed,
		biome: capture.metadata.biome,
	})
	if (capture.metadata.dayTime !== null) scene.setMinutes(ticksToMinutes(capture.metadata.dayTime))
	onTitle(capture.name)
}

export function SharePage({ isPublic = false }: { isPublic?: boolean }) {
	const { t } = useI18n()

	const { token, id } = useParams()
	const [params] = useSearchParams()
	const review = isPublic && params.get('review') === '1'
	const reference = isPublic ? id : token
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const sceneRef = useRef<ViewerScene | null>(null)
	const [minutes, setMinutes] = useState(570)
	const [title, setTitle] = useState('A shared world.')
	const [fileInfo, setFileInfo] = useState('')
	const [empty, setEmpty] = useState(true)
	const [status, setStatus] = useState<string | null>('Loading the shared world…')
	const [error, setError] = useState('')

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		let scene: ViewerScene
		try {
			scene = new ViewerScene(canvas, {
				onCycle: cycle => {
					setMinutes(cycle.minutes)
				},
				onFileInfo: (name, size) => setFileInfo(`${name} · ${formatFileSize(size)}`),
				onEmptyChange: setEmpty,
				onLoading: setStatus,
			})
		} catch {
			setError('WebGL is unavailable. Try another browser or enable hardware acceleration.')
			setStatus(null)
			return
		}

		sceneRef.current = scene
		return () => {
			scene.dispose()
			sceneRef.current = null
		}
	}, [])

	useEffect(() => {
		if (!reference) {
			setError('This link is incomplete.')
			setStatus(null)
			return
		}
		let cancelled = false
		const controller = new AbortController()
		function reportError(cause: unknown) {
			if (cancelled) return
			setError(cause instanceof Error ? cause.message : 'Could not load this world.')
			setStatus(null)
		}
		async function loadShared() {
			const scene = sceneRef.current
			if (!(scene && reference)) return
			try {
				const { capture, file } = await (isPublic
					? fetchPublicCapture(reference, review, controller.signal)
					: fetchSharedCapture(reference, controller.signal))
				if (cancelled) return
				applySharedCapture(scene, capture, setTitle)
				await scene.loadFile(file)
			} catch (cause) {
				reportError(cause)
			}
		}
		void loadShared()
		return () => {
			cancelled = true
			controller.abort()
		}
	}, [reference, isPublic, review])

	const publicBack = review ? '/moderation' : '/explorer'
	return (
		<section className="viewer-page cinema-page">
			<ViewerHeader
				title={t(title)}
				subtitle={isPublic ? t('PUBLIC MEMORY') : t('SHARED MEMORY')}
				back={isPublic ? publicBack : '/'}
				backLabel={isPublic ? t(review ? 'Back to moderation' : 'Back to public gallery') : 'Minemories'}
			>
				<Link className="cinema-open" to="/">
					<T message={'Keep my own worlds'} /> ↗
				</Link>
			</ViewerHeader>
			<div className="viewer-stage">
				<canvas
					ref={canvasRef}
					className={empty ? 'cinema-canvas is-empty' : 'cinema-canvas'}
					aria-label={t('Shared 3D scene')}
				/>
				<ViewerLoadState loading={status} error={error} />
			</div>
			{!empty && <ViewerStudio sceneRef={sceneRef} ready={!status} minutes={minutes} fileInfo={fileInfo} />}
		</section>
	)
}
