import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { apiBase, apiClient } from '../api-client'
import { CaptureRestorationPanel, useCaptureRestoration } from '../components/CaptureRestoration'
import { GalleryIcon } from '../components/GalleryIcons'
import { ViewerHeader, ViewerLoadState } from '../components/ViewerChrome'
import { ViewerStudio } from '../components/ViewerStudio'
import { errorMessageKey } from '../i18n/error-messages'
import { T, useI18n } from '../i18n/I18n'
import { localeTag } from '../i18n/locales'
import { downloadCapture } from '../lib/capture-file'
import { formatFileSize } from '../lib/glb'
import { ViewerScene } from '../viewer-scene'
import { ticksToMinutes } from './ViewerPage'
import './share-timeline.css'

interface SharedSnapshot {
	id: string
	at: string
}

interface SharedCapture {
	name: string
	size: number
	/** Present on a world link: every snapshot of the world, oldest first. The served one is `id`. */
	id?: string
	snapshots?: SharedSnapshot[]
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

async function fetchSharedCapture(
	token: string,
	signal: AbortSignal,
	snapshot?: string | null
): Promise<{ capture: SharedCapture; file: File }> {
	const base = `${apiBase}/api/shared/${encodeURIComponent(token)}`
	const query = snapshot ? `?snapshot=${encodeURIComponent(snapshot)}` : ''
	const metaResponse = await fetch(`${base}${query}`, { signal })
	if (!metaResponse.ok) throw new Error('This link is invalid or was revoked.')
	const capture = (await metaResponse.json()) as SharedCapture
	const file = await downloadCapture(`${base}/file${query}`, 'shared.glb', signal)
	return { capture, file }
}

async function fetchPublicCapture(
	id: string,
	review: boolean,
	signal: AbortSignal
): Promise<{ capture: SharedCapture; file: File }> {
	const procedure = review ? apiClient.discovery.review : apiClient.discovery.get
	const entry = await procedure({ id }, { signal })
	const file = await downloadCapture(`${apiBase}/api/public/${encodeURIComponent(id)}/file`, 'public.glb', signal)
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

/** A world link: a slider over the snapshots, oldest to newest, committed once the visitor stops moving. */
function SnapshotTimeline({
	snapshots,
	shown,
	onPick,
}: {
	snapshots: SharedSnapshot[]
	shown: string | null
	onPick(id: string): void
}) {
	const { t, locale } = useI18n()
	const current = Math.max(
		0,
		snapshots.findIndex(entry => entry.id === shown)
	)
	const [position, setPosition] = useState(current)
	useEffect(() => setPosition(current), [current])
	useEffect(() => {
		const picked = snapshots[position]
		if (!picked || picked.id === shown) return
		const timer = setTimeout(() => onPick(picked.id), 250)
		return () => clearTimeout(timer)
	}, [position, snapshots, shown, onPick])
	const stamp = new Date(snapshots[position]?.at ?? '')
	const label = Number.isNaN(stamp.getTime())
		? '—'
		: new Intl.DateTimeFormat(localeTag(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(stamp)
	return (
		<div className="share-timeline">
			<GalleryIcon name="layers" />
			<input
				type="range"
				min={0}
				max={snapshots.length - 1}
				step={1}
				value={position}
				aria-label={t('Snapshots')}
				aria-valuetext={label}
				onChange={event => setPosition(Number(event.currentTarget.value))}
			/>
			<time dateTime={snapshots[position]?.at}>{label}</time>
			<span>
				{position + 1}/{snapshots.length}
			</span>
		</div>
	)
}

export function SharePage({ isPublic = false }: { isPublic?: boolean }) {
	const { t, locale } = useI18n()

	const { token, id } = useParams()
	const [params] = useSearchParams()
	const review = isPublic && params.get('review') === '1'
	const reference = isPublic ? id : token
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const sceneRef = useRef<ViewerScene | null>(null)
	const [minutes, setMinutes] = useState(570)
	const [title, setTitle] = useState<string | null>(null)
	const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null)
	const [empty, setEmpty] = useState(true)
	const [snapshots, setSnapshots] = useState<SharedSnapshot[] | null>(null)
	const [shown, setShown] = useState<string | null>(null)
	const [wanted, setWanted] = useState<string | null>(null)
	const [status, setStatus] = useState<string | null>('Loading the shared world…')
	const [error, setError] = useState('')
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
			setError(errorMessageKey(cause, 'Could not load this world.'))
			setStatus(null)
		}
		async function loadShared() {
			const scene = sceneRef.current
			if (!(scene && reference)) return
			try {
				const { capture, file } = await restoreLoad(
					() =>
						isPublic
							? fetchPublicCapture(reference, review, controller.signal)
							: fetchSharedCapture(reference, controller.signal, wanted),
					isPublic ? { kind: 'public', id: reference } : { kind: 'shared', token: reference },
					controller.signal
				)
				if (cancelled) return
				applySharedCapture(scene, capture, setTitle)
				setSnapshots(capture.snapshots ?? null)
				setShown(capture.id ?? null)
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
	}, [reference, isPublic, review, restoreLoad, wanted])

	const publicBack = review ? '/admin/moderation' : '/explore'
	return (
		<section className="viewer-page cinema-page">
			<ViewerHeader
				title={title ?? t('A shared world.')}
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
				{snapshots && snapshots.length > 1 && (
					<SnapshotTimeline snapshots={snapshots} shown={shown} onPick={setWanted} />
				)}
				<CaptureRestorationPanel view={restoration.view} onRestore={restoration.resume} />
				{!restoration.view && <ViewerLoadState loading={status} error={error} />}
			</div>
			{!empty && (
				<ViewerStudio
					sceneRef={sceneRef}
					ready={!(status || restoration.view)}
					minutes={minutes}
					fileInfo={fileInfo ? `${fileInfo.name} · ${formatFileSize(fileInfo.size, locale)}` : ''}
				/>
			)}
		</section>
	)
}
