import type { TemporalFrame, WorldEvolution } from '@minemories/api-contract'
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { ViewerHeader } from '../components/ViewerChrome'
import { ViewerStudio } from '../components/ViewerStudio'
import '../components/viewer-studio.css'
import './timelapse.css'
import { useI18n } from '../i18n/I18n'
import { CaptureRestorationRequired } from '../lib/capture-file'
import { formatFileSize } from '../lib/glb'
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
const scopeLabels = {
	world: 'Local world',
	session: 'Remote session — reconnecting starts a separate timeline',
	namespace: 'Configured remote world — set in M → Advanced → World',
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

function useWorldEvolution(memoryId: string) {
	const canvas = useRef<HTMLCanvasElement>(null)
	const runtime = useRef<WorldRuntime | null>(null)
	const scene = useRef<ViewerScene | null>(null)
	const stepRef = useRef(0)
	const [world, setWorld] = useState<WorldEvolution | null>(null)
	const [statuses, setStatuses] = useState<FrameStatus[]>([])
	const [step, setStep] = useState(0)
	const [playing, setPlaying] = useState(false)
	const [delay, setDelay] = useState(1)
	const [error, setError] = useState('')
	const [retry, setRetry] = useState(0)
	const [minutes, setMinutes] = useState(570)

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
		const request = new AbortController()
		setError('')
		setWorld(null)
		void apiClient.timelapse
			.world({ memoryId }, { signal: request.signal })
			.then(evolution => {
				if (request.signal.aborted) return
				runtime.current = startWorld(viewer, evolution, setStatuses, stepRef)
				const first = Math.max(0, plannedFrames(evolution.frames.map(frame => frame.size)).indexOf(true))
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

	useEffect(() => {
		stepRef.current = step
		if (runtime.current) show(runtime.current, step)
	}, [step])

	useEffect(() => {
		if (!(playing && world)) return
		const next = step + 1
		if (next >= world.frames.length) {
			setPlaying(false)
			return
		}
		if (pending.has(statuses[next] as FrameStatus)) return
		const timer = globalThis.setTimeout(() => setStep(next), delay * 1000)
		return () => globalThis.clearTimeout(timer)
	}, [playing, world, step, statuses, delay])

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

	const recenter = useCallback(() => {
		const current = runtime.current
		if (!current) return
		const shown = [...current.layers.keys()].filter(position => position <= stepRef.current)
		const layer = current.layers.get(Math.max(...shown))
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
		delay,
		error,
		select,
		recenter,
		setPlaying,
		setDelay,
		retryAll: () => setRetry(value => value + 1),
		retryFrame: (position: number) => runtime.current?.loader.retry(position),
		chunks: (position: number) => runtime.current?.layers.get(position)?.capture.cells.size ?? null,
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

/** Minecraft day ticks start at 06:00; the viewer clock counts minutes from midnight. */
function captureClock(dayTime: number): number {
	return ((((dayTime % 24_000) + 30_000) % 24_000) * 1440) / 24_000
}

export function WorldPage({ memoryId }: { memoryId: string }) {
	const state = useWorldEvolution(memoryId)
	const { t, locale } = useI18n()
	const { world, statuses, error, step } = state
	const ready = statuses.filter(status => status === 'ready').length
	const skipped = statuses.filter(status => status === 'skipped').length
	const current = world?.frames[step]
	return (
		<section className="viewer-page cinema-page timelapse-page">
			<ViewerHeader
				title={world?.name ?? t('Your world through time')}
				subtitle={t('CAPTURE TIMELINE')}
				backLabel={t('My gallery')}
			/>
			<div className="viewer-stage">
				<canvas ref={state.canvas} className="cinema-canvas" aria-label={t('Interactive 3D scene')} />
			</div>
			<ViewerStudio
				sceneRef={state.scene}
				memoryId={current?.id ?? null}
				ready={ready > 0}
				minutes={state.minutes}
				captureMinutes={current?.dayTime == null ? null : captureClock(current.dayTime)}
				onRecenter={state.recenter}
			/>
			<div className="viewer-studio timeline-studio">
				{world && ready === 0 && !error && (
					<p role="status" className="timeline-loading">
						{t('Loading capture…')}
					</p>
				)}
				<aside className="timeline-card">
					{world && (
						<p className="timeline-meta">
							{t(scopeLabels[world.scope])} ·{' '}
							{t('{ready} of {total} captures loaded', { ready, total: world.frames.length })} ·{' '}
							{formatFileSize(world.totalBytes)}
						</p>
					)}
					{current && (
						<p className="timeline-current" aria-live="polite">
							{current.name} ·{' '}
							<time dateTime={current.at} title={current.at}>
								{new Date(current.at).toLocaleString(locale)}
							</time>
						</p>
					)}
					{(world?.truncated || skipped > 0) && (
						<p role="status">{t('Only the most recent captures are loaded to keep the viewer fast.')}</p>
					)}
					{error && <WorldError error={error} onRetry={state.retryAll} />}
					<CaptureList state={state} />
				</aside>
				{world && <WorldControls state={state} world={world} />}
			</div>
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

function CaptureList({ state }: { state: WorldState }) {
	const { t, locale } = useI18n()
	const { world, statuses, step } = state
	if (!world) return null
	return (
		<nav aria-label={t('Captures of this world')} className="timeline-list">
			<h2>{t('{count} captures, oldest first', { count: world.totalFrames })}</h2>
			<ol>
				{world.frames.map((frame, position) => {
					const status = statuses[position] ?? 'waiting'
					const chunks = state.chunks(position)
					return (
						<li key={frame.id} data-later={position > step}>
							<button
								type="button"
								aria-current={position === step ? 'step' : undefined}
								onClick={() => state.select(position)}
							>
								<strong>
									<time dateTime={frame.at} title={frame.at}>
										{new Date(frame.at).toLocaleString(locale)}
									</time>
								</strong>
								<span>{frame.name}</span>
								<small>
									{t(statusLabels[status])}
									{chunks !== null && ` · ${t('{count} chunks', { count: chunks })}`}
								</small>
							</button>
							<span className="timeline-item-actions">
								<Link className="timeline-item-action" to={`/viewer?memory=${encodeURIComponent(frame.id)}`}>
									{t('Open alone')}
								</Link>
								{status === 'failed' && (
									<button type="button" className="timeline-item-action" onClick={() => state.retryFrame(position)}>
										{t('Retry')}
									</button>
								)}
							</span>
						</li>
					)
				})}
			</ol>
		</nav>
	)
}

function WorldControls({ state, world }: { state: WorldState; world: WorldEvolution }) {
	const { t, locale } = useI18n()
	const { step, playing, delay, setPlaying, setDelay, select } = state
	const last = world.frames.length - 1
	const day = (iso?: string) =>
		iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
	return (
		<div className="timeline-dock">
			<div className="timeline-scrub">
				<input
					aria-label={t('Moment of the world')}
					type="range"
					min={0}
					max={last}
					value={step}
					style={{ '--progress': `${last > 0 ? (step / last) * 100 : 0}%` } as CSSProperties}
					onChange={event => select(Number(event.target.value))}
				/>
				<div className="timeline-ends" aria-hidden="true">
					<span>{day(world.frames[0]?.at)}</span>
					<span>
						{step + 1} / {last + 1}
					</span>
					<span>{day(world.frames[last]?.at)}</span>
				</div>
			</div>
			<div className="timeline-transport">
				<button type="button" disabled={step <= 0} onClick={() => select(step - 1)}>
					{t('Previous capture')}
				</button>
				<button
					type="button"
					className="timeline-play"
					disabled={!playing && step >= last}
					aria-pressed={playing}
					onClick={() => setPlaying(value => !value)}
				>
					{t(playing ? 'Pause' : 'Play')}
				</button>
				<button type="button" disabled={step >= last} onClick={() => select(step + 1)}>
					{t('Next capture')}
				</button>
				<label className="timeline-speed">
					{t('Seconds per capture')}
					<select
						aria-label={t('Seconds per capture')}
						value={delay}
						onChange={event => setDelay(Number(event.target.value))}
					>
						{[0.5, 1, 2, 5].map(value => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
				</label>
			</div>
		</div>
	)
}
