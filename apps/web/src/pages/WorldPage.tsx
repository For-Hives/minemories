import type { TemporalFrame, WorldEvolution } from '@minemories/api-contract'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { ViewerHeader } from '../components/ViewerChrome'
import { ViewerIcon } from '../components/ViewerIcons'
import { ViewerStudio } from '../components/ViewerStudio'
import '../components/viewer-studio.css'
import './timelapse.css'
import { formatCaptureCount } from '../i18n/counts'
import { useI18n } from '../i18n/I18n'
import { CaptureRestorationRequired } from '../lib/capture-file'
import { WorldComposition } from '../lib/world-evolution'
import { type FrameStatus, plannedFrames, RestorationNeeded, WorldLoader } from '../lib/world-load'
import { ViewerScene } from '../viewer-scene'
import { applyLayer, type WorldLayer, type WorldLight } from '../viewer-world'
import { fetchTemporalFile } from './temporal-files'

async function download(frame: TemporalFrame, signal: AbortSignal): Promise<File> {
	try {
		return await fetchTemporalFile(frame, signal)
	} catch (error) {
		if (error instanceof CaptureRestorationRequired) throw new RestorationNeeded()
		throw error
	}
}

const pending = new Set<FrameStatus>(['waiting', 'loading'])
const dimensionLabels: Record<string, string> = {
	'minecraft:overworld': 'Overworld',
	'minecraft:the_nether': 'Nether',
	'minecraft:the_end': 'The End',
}

interface WorldRuntime {
	scene: ViewerScene
	composition: WorldComposition
	layers: Map<number, WorldLayer>
	base: TemporalFrame['origin']
	loader: WorldLoader<TemporalFrame>
}

function visibleLights(runtime: WorldRuntime, step: number): WorldLight[] {
	const lights: WorldLight[] = []
	for (const [position, layer] of runtime.layers) {
		if (position > step) continue
		for (const light of layer.lights) {
			const block = light.position.clone().add(runtime.base)
			if (!runtime.composition.covered(position, step, block)) lights.push(light)
		}
	}
	return lights
}

function show(runtime: WorldRuntime, step: number) {
	for (const position of runtime.composition.compose(step)) {
		const layer = runtime.layers.get(position)
		if (layer) applyLayer(layer)
	}
	runtime.scene.showWorld(visibleLights(runtime, step))
}

const PLAY_SECONDS = 1.8

/** Minecraft day ticks start at 06:00; the viewer clock counts minutes from midnight. */
function captureClock(dayTime: number): number {
	return ((((dayTime % 24_000) + 30_000) % 24_000) * 1440) / 24_000
}

function isTyping(event: KeyboardEvent): boolean {
	const field = event.target instanceof HTMLElement && event.target.matches('input, select, textarea')
	return field || event.metaKey || event.ctrlKey || event.altKey
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

function useWorldEvolution(memoryId: string) {
	const canvas = useRef<HTMLCanvasElement>(null)
	const runtime = useRef<WorldRuntime | null>(null)
	const scene = useRef<ViewerScene | null>(null)
	const stepRef = useRef(0)
	const shown = useRef(-1)
	const [world, setWorld] = useState<WorldEvolution | null>(null)
	const [statuses, setStatuses] = useState<FrameStatus[]>([])
	const [step, setStep] = useState(0)
	const [playing, setPlaying] = useState(false)
	const [error, setError] = useState('')
	const [retry, setRetry] = useState(0)
	const [minutes, setMinutes] = useState(570)
	const images = useCaptureImages()

	useEffect(() => {
		if (!canvas.current) return
		let viewer: ViewerScene
		try {
			viewer = new ViewerScene(canvas.current, {
				onCycle: cycle => setMinutes(cycle.minutes),
				onFileInfo: () => undefined,
				onEmptyChange: () => undefined,
				onLoading: () => undefined,
			})
		} catch {
			setError('The 3D viewer could not start. Enable WebGL and reload this page.')
			return
		}
		scene.current = viewer
		shown.current = -1
		const request = new AbortController()
		setError('')
		setWorld(null)
		void apiClient.timelapse
			.world({ memoryId }, { signal: request.signal })
			.then(evolution => {
				if (request.signal.aborted) return
				runtime.current = startWorld(viewer, evolution, setStatuses, stepRef)
				const first = Math.max(0, plannedFrames(evolution.frames.map(frame => frame.size)).indexOf(true))
				const dayTime = evolution.frames[first]?.dayTime
				if (dayTime != null) viewer.setMinutes(captureClock(dayTime))
				stepRef.current = first
				setStep(first)
				setWorld(evolution)
			})
			.catch(() => {
				if (!request.signal.aborted)
					setError('This world is unavailable. Sign in as its owner, or return to your gallery.')
			})
		return () => {
			request.abort()
			runtime.current?.loader.dispose()
			runtime.current = null
			scene.current = null
			viewer.dispose()
		}
	}, [memoryId, retry])

	// Each new moment glides the camera to the capture that changed and turns the sun to its hour.
	useEffect(() => {
		stepRef.current = step
		const current = runtime.current
		if (!current) return
		show(current, step)
		const previous = shown.current
		shown.current = step
		if (previous < 0 || previous === step) return
		const layer = current.layers.get(step)
		if (layer) current.scene.glideToLayer(layer.root)
		const dayTime = world?.frames[step]?.dayTime
		if (dayTime != null) current.scene.setMinutes(captureClock(dayTime), true)
	}, [step, world])

	useEffect(() => {
		if (!(playing && world)) return
		const next = step + 1
		if (next >= world.frames.length) {
			setPlaying(false)
			return
		}
		if (pending.has(statuses[next] as FrameStatus)) return
		const timer = globalThis.setTimeout(() => setStep(next), PLAY_SECONDS * 1000)
		return () => globalThis.clearTimeout(timer)
	}, [playing, world, step, statuses])

	useEffect(() => {
		const pause = () => {
			if (document.hidden) setPlaying(false)
		}
		document.addEventListener('visibilitychange', pause)
		return () => document.removeEventListener('visibilitychange', pause)
	}, [])

	const select = useCallback((position: number) => {
		setPlaying(false)
		setStep(position)
	}, [])

	useEffect(() => {
		const last = (world?.frames.length ?? 0) - 1
		function onKey(event: KeyboardEvent) {
			if (isTyping(event) || last < 0) return
			const offset = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key]
			if (!offset) return
			event.preventDefault()
			select(Math.min(last, Math.max(0, stepRef.current + offset)))
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [world, select])

	const recenter = useCallback(() => {
		const current = runtime.current
		if (!current) return
		const loaded = [...current.layers.keys()].filter(position => position <= stepRef.current)
		const layer = current.layers.get(Math.max(...loaded))
		if (layer) current.scene.focusLayer(layer.root)
	}, [])

	return {
		canvas,
		scene,
		minutes,
		world,
		statuses,
		step,
		playing,
		error,
		images,
		select,
		recenter,
		togglePlay: () => {
			if (!playing && world && step >= world.frames.length - 1) setStep(0)
			setPlaying(value => !value)
		},
		retryAll: () => setRetry(value => value + 1),
		retryFrame: (position: number) => runtime.current?.loader.retry(position),
	}
}

function startWorld(
	scene: ViewerScene,
	evolution: WorldEvolution,
	setStatuses: (update: (current: FrameStatus[]) => FrameStatus[]) => void,
	stepRef: { current: number }
): WorldRuntime {
	const frames = evolution.frames
	const newest = frames.at(-1) as TemporalFrame
	const base = (frames[0] as TemporalFrame).origin
	scene.setCaptureContext({
		...base,
		dayTime: newest.dayTime,
		dimension: evolution.dimension,
		seed: newest.seed,
		biome: newest.biome,
	})
	const composition = new WorldComposition(frames.length)
	const layers = new Map<number, WorldLayer>()
	setStatuses(() => frames.map(() => 'waiting'))
	const loader = new WorldLoader(frames, plannedFrames(frames.map(frame => frame.size)), {
		concurrency: 3,
		download,
		attach: async (frame, position, file, signal) => {
			const offset = { x: frame.origin.x - base.x, y: frame.origin.y - base.y, z: frame.origin.z - base.z }
			const layer = await scene.addLayer(file, { origin: frame.origin, bounds: frame.bounds, offset }, signal)
			composition.set(position, layer.capture)
			layers.set(position, layer)
			show(world, stepRef.current)
		},
		onStatus: (position, status) =>
			setStatuses(current => current.map((value, index) => (index === position ? status : value))),
	})
	const world: WorldRuntime = { scene, composition, layers, base, loader }
	loader.start()
	return world
}

type WorldState = ReturnType<typeof useWorldEvolution>

export function WorldPage({ memoryId }: { memoryId: string }) {
	const state = useWorldEvolution(memoryId)
	const { t } = useI18n()
	const { world, statuses, error, step } = state
	const ready = statuses.some(status => status === 'ready')
	const current = world?.frames[step]
	return (
		<section className="viewer-page cinema-page timelapse-page">
			<ViewerHeader
				title={world?.name ?? t('Your world through time')}
				subtitle={world?.dimension ? t(dimensionLabels[world.dimension] ?? world.dimension) : ''}
				backLabel={t('My gallery')}
			/>
			<div className="viewer-stage">
				<canvas ref={state.canvas} className="cinema-canvas" aria-label={t('Interactive 3D scene')} />
			</div>
			<ViewerStudio
				sceneRef={state.scene}
				memoryId={current?.id ?? null}
				ready={ready}
				minutes={state.minutes}
				captureMinutes={current?.dayTime == null ? null : captureClock(current.dayTime)}
				onRecenter={state.recenter}
			>
				{error && <WorldError error={error} onRetry={state.retryAll} />}
				{world && <CaptureFilm state={state} world={world} />}
			</ViewerStudio>
		</section>
	)
}

function WorldError({ error, onRetry }: { error: string; onRetry: () => void }) {
	const { t } = useI18n()
	return (
		<div role="alert" className="timeline-error">
			<p>{t(error)}</p>
			<button type="button" onClick={onRetry}>
				{t('Retry')}
			</button>
		</div>
	)
}

const statusLabels: Record<FrameStatus, string> = {
	waiting: 'Waiting',
	loading: 'Loading…',
	ready: 'Loaded',
	archived: 'Archived — open it alone to restore it',
	failed: 'Could not load',
	skipped: 'Not loaded',
}

function dayOf(iso: string, locale: string): string {
	const date = new Date(iso)
	const year = date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
	return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year })
}

function LoadProgress({ statuses }: { statuses: FrameStatus[] }) {
	const { t } = useI18n()
	const planned = statuses.filter(status => status !== 'skipped').length
	const settled = statuses.filter(status => status !== 'skipped' && !pending.has(status)).length
	if (planned === 0 || settled === planned) return null
	return (
		<div
			className="film-progress"
			role="progressbar"
			aria-label={t('Loading capture…')}
			aria-valuemin={0}
			aria-valuemax={planned}
			aria-valuenow={settled}
		>
			<span style={{ width: `${(settled / planned) * 100}%` }} />
		</div>
	)
}

function CaptureFilm({ state, world }: { state: WorldState; world: WorldEvolution }) {
	const { t, locale } = useI18n()
	const { statuses, step, playing } = state
	const list = useRef<HTMLOListElement>(null)
	useEffect(() => {
		list.current?.querySelector('[aria-current="step"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
	}, [step])
	const first = world.frames[0]
	const last = world.frames.at(-1)
	return (
		<nav aria-label={t('Captures of this world')} className="film">
			<header className="film-head">
				<button
					type="button"
					className="film-play"
					aria-pressed={playing}
					aria-label={t(playing ? 'Pause' : 'Play')}
					title={t(playing ? 'Pause' : 'Play')}
					disabled={world.frames.length < 2}
					onClick={state.togglePlay}
				>
					<ViewerIcon name={playing ? 'pause' : 'play'} />
				</button>
				<div className="film-title">
					<strong>{formatCaptureCount(locale, world.totalFrames)}</strong>
					{first && last && (
						<span>
							{dayOf(first.at, locale)}
							{first !== last && ` → ${dayOf(last.at, locale)}`}
						</span>
					)}
				</div>
			</header>
			<LoadProgress statuses={statuses} />
			<ol ref={list} className="film-list">
				{world.frames.map((frame, position) => {
					const day = dayOf(frame.at, locale)
					const newDay = position === 0 || dayOf(world.frames[position - 1]?.at ?? '', locale) !== day
					return (
						<FilmItem
							key={frame.id}
							frame={frame}
							position={position}
							day={newDay ? day : null}
							state={state}
							status={statuses[position] ?? 'waiting'}
						/>
					)
				})}
			</ol>
			{world.truncated && (
				<p className="film-note">{t('Only the most recent captures are loaded to keep the viewer fast.')}</p>
			)}
		</nav>
	)
}

function FilmItem({
	frame,
	position,
	day,
	state,
	status,
}: {
	frame: TemporalFrame
	position: number
	day: string | null
	state: WorldState
	status: FrameStatus
}) {
	const { t, locale } = useI18n()
	const image = state.images.get(frame.id)
	const time = new Date(frame.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
	const current = position === state.step
	return (
		<li className="film-item" data-status={status} data-future={position > state.step}>
			{day && <span className="film-day">{day}</span>}
			<div className="film-row">
				<button
					type="button"
					className="film-frame"
					aria-current={current ? 'step' : undefined}
					aria-label={`${frame.name} · ${new Date(frame.at).toLocaleString(locale)} · ${t(statusLabels[status])}`}
					title={`${frame.name} · ${t(statusLabels[status])}`}
					onClick={() => state.select(position)}
				>
					<span className="film-thumb" style={image ? { backgroundImage: `url("${image}")` } : undefined}>
						<span className="film-status" aria-hidden="true" />
					</span>
					<time dateTime={frame.at}>{time}</time>
				</button>
				{status === 'failed' ? (
					<button
						type="button"
						className="film-side"
						aria-label={t('Retry')}
						title={t('Retry')}
						onClick={() => state.retryFrame(position)}
					>
						<ViewerIcon name="refresh" />
					</button>
				) : (
					<Link
						className="film-side"
						to={`/viewer?memory=${encodeURIComponent(frame.id)}`}
						aria-label={`${t('Open alone')} · ${frame.name}`}
						title={t('Open alone')}
					>
						<ViewerIcon name="share" />
					</Link>
				)}
			</div>
		</li>
	)
}
