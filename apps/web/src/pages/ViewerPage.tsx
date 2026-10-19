import type { ChangeEvent, DragEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { apiBase, apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { CaptureRestorationPanel, useCaptureRestoration } from '../components/CaptureRestoration'
import { fileInputHidden } from '../components/ui'
import { ViewerEmptyState, ViewerHeader, ViewerLoadState } from '../components/ViewerChrome'
import { ViewerStudio } from '../components/ViewerStudio'
import { errorMessageKey } from '../i18n/error-messages'
import { T, useI18n } from '../i18n/I18n'
import { downloadCapture } from '../lib/capture-file'
import { formatFileSize } from '../lib/glb'
import { ViewerScene } from '../viewer-scene'
import { TimelapsePage } from './TimelapsePage'

export function ViewerPage() {
	const [search] = useSearchParams()
	const id = search.get('memory')
	if (!(import.meta.env.DEV || id)) return <Navigate to="/explorer" replace />
	if (search.get('timelapse') === '1' && id) return <TimelapsePage key={id} memoryId={id} />
	return <SingleViewerPage />
}

function SingleViewerPage() {
	const { t, locale } = useI18n()

	const { viewerFile, setViewerFile } = useAppContext()
	const [search] = useSearchParams()
	const navigate = useNavigate()
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const sceneRef = useRef<ViewerScene | null>(null)
	const [minutes, setMinutes] = useState(570)
	const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null)
	const [empty, setEmpty] = useState(true)
	const [loading, setLoading] = useState<string | null>(null)
	const [loadError, setLoadError] = useState('')
	const [dragOver, setDragOver] = useState(false)
	const memoryId = search.get('memory')
	const restoration = useCaptureRestoration()
	const restoreLoad = restoration.load

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		let scene: ViewerScene
		try {
			scene = new ViewerScene(canvas, {
				onCycle: cycle => {
					setMinutes(cycle.minutes)
				},
				onFileInfo: (name, size) => setFileInfo({ name, size }),
				onEmptyChange: setEmpty,
				onLoading: setLoading,
			})
		} catch {
			setLoadError('WebGL is unavailable. Try another browser or enable hardware acceleration.')
			return
		}

		sceneRef.current = scene
		return () => {
			scene.dispose()
			sceneRef.current = null
		}
	}, [])

	const openFile = useCallback(async (file: File) => {
		const scene = sceneRef.current
		if (!scene) return false
		setLoadError('')
		try {
			await scene.loadFile(file)
			return true
		} catch (error) {
			setLoadError(errorMessageKey(error, 'Could not read this GLB'))
			return false
		}
	}, [])

	useEffect(() => {
		if (import.meta.env.DEV && viewerFile && !memoryId) {
			sceneRef.current?.setCaptureContext({
				x: null,
				y: null,
				z: null,
				dayTime: null,
				dimension: null,
				seed: null,
				biome: null,
			})
			void openFile(viewerFile)
		}
	}, [viewerFile, memoryId, openFile])

	useEffect(() => {
		if (!(memoryId && sceneRef.current)) return
		let cancelled = false
		const controller = new AbortController()
		setLoadError('')
		setLoading('Downloading the memory…')
		async function loadMemory(id: string) {
			try {
				const capture = await restoreLoad(
					() => fetchCapture(id, controller.signal),
					{ kind: 'owner', id },
					controller.signal
				)
				if (cancelled) return
				applyCaptureMetadata(capture.metadata)
				const ready = await openFile(capture.file)
				if (!cancelled) afterMemoryOpened(id, capture.metadata.thumbnail, capture.metadata.icon, ready)
			} catch (error) {
				if (!cancelled) {
					setLoading(null)
					setLoadError(loadErrorMessage(error))
				}
			}
		}
		void loadMemory(memoryId)
		return () => {
			cancelled = true
			controller.abort()
		}
	}, [memoryId, openFile, restoreLoad])

	function applyCaptureMetadata(metadata: Awaited<ReturnType<typeof fetchCapture>>['metadata']) {
		const scene = sceneRef.current
		if (!scene) return
		scene.setCaptureContext({
			x: metadata.x,
			y: metadata.y,
			z: metadata.z,
			dayTime: metadata.dayTime,
			dimension: metadata.dimension,
			seed: metadata.seed,
			biome: metadata.biome,
		})
		if (metadata.dayTime !== null) scene.setMinutes(ticksToMinutes(metadata.dayTime))
	}

	function afterMemoryOpened(id: string, thumbnail: string | null, icon: string | null, ready: boolean) {
		const scene = sceneRef.current
		if (!(ready && scene) || (thumbnail !== null && icon !== null)) return
		const snapshot = scene.snapshot()
		if (!snapshot || snapshot.length > 96_000) return
		if (icon === null && thumbnail !== null) {
			void apiClient.memories.setThumbnail({ id, thumbnail: snapshot, icon: thumbnail }).catch(() => undefined)
		} else {
			void apiClient.memories.setThumbnail({ id, thumbnail: snapshot }).catch(() => undefined)
		}
	}

	function chooseLocalFile(event: ChangeEvent<HTMLInputElement>) {
		if (!import.meta.env.DEV) return
		const file = event.currentTarget.files?.[0]
		if (file) {
			setViewerFile(file)
			navigate('/viewer', { replace: true })
		}
		event.currentTarget.value = ''
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault()
		setDragOver(false)
		if (!import.meta.env.DEV) return
		const file = event.dataTransfer.files?.[0]
		if (file) {
			setViewerFile(file)
			navigate('/viewer', { replace: true })
		}
	}

	return (
		<section className="viewer-page cinema-page">
			<ViewerHeader
				title={memoryId ? t('A world to find again.') : (viewerFile?.name ?? t('The memory studio'))}
				subtitle="STUDIO"
			>
				{import.meta.env.DEV && (
					<label className="cinema-open">
						<T message={'Choose a GLB'} />
						<span>＋</span>
						<input
							id="local-file-input"
							aria-label={t('Choose a GLB')}
							type="file"
							accept=".glb,model/gltf-binary"
							className={fileInputHidden}
							onChange={chooseLocalFile}
						/>
					</label>
				)}
			</ViewerHeader>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drag/drop supplements the keyboard-accessible file picker. */}
			<div
				className="viewer-stage"
				onDragEnter={event => {
					event.preventDefault()
					if (import.meta.env.DEV) setDragOver(true)
				}}
				onDragOver={event => event.preventDefault()}
				onDragLeave={() => setDragOver(false)}
				onDrop={handleDrop}
			>
				<canvas
					ref={canvasRef}
					className={empty ? 'cinema-canvas is-empty' : 'cinema-canvas'}
					aria-label={t('Interactive 3D scene')}
				/>
				<CaptureRestorationPanel view={restoration.view} onRestore={restoration.resume} />
				{empty && !loading && !loadError && !restoration.view && <ViewerEmptyState />}
				{dragOver && (
					<div className="cinema-drop">
						<T message={'Drop your world here'} />
					</div>
				)}
				{!restoration.view && <ViewerLoadState loading={loading} error={loadError} />}
			</div>
			{!empty && (
				<ViewerStudio
					sceneRef={sceneRef}
					ready={!(loading || restoration.view)}
					memoryId={memoryId}
					minutes={minutes}
					fileInfo={fileInfo ? `${fileInfo.name} · ${formatFileSize(fileInfo.size, locale)}` : ''}
				/>
			)}
		</section>
	)
}

async function fetchCapture(id: string, signal: AbortSignal) {
	const [file, captures] = await Promise.all([fetchMemoryFile(id, signal), apiClient.memories.list()])
	const capture = captures.find(item => item.id === id)
	return {
		file,
		metadata: capture?.metadata ?? {
			x: null,
			y: null,
			z: null,
			dayTime: null,
			dimension: null,
			seed: null,
			biome: null,
			thumbnail: null,
			icon: null,
		},
	}
}

export function ticksToMinutes(ticks: number): number {
	const timeOfDay = ((ticks % 24_000) + 24_000) % 24_000
	return Math.round((((timeOfDay + 6_000) % 24_000) / 24_000) * 1_440) % 1_440
}

function loadErrorMessage(error: unknown): string {
	return errorMessageKey(error, 'Could not load this memory.')
}

function fetchMemoryFile(memoryId: string, signal: AbortSignal): Promise<File> {
	return downloadCapture(`${apiBase}/api/memories/${encodeURIComponent(memoryId)}/file`, 'memory.glb', signal)
}
