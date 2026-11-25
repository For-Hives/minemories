import type { TemporalFrame } from '@minemories/api-contract'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { formatCaptureCount } from '../i18n/counts'
import { useI18n } from '../i18n/I18n'
import type { ViewLink } from '../lib/view-link'
import { WorldComposition } from '../lib/world-evolution'
import { type FrameStatus, plannedFrames, WorldLoader } from '../lib/world-load'
import { startStep } from '../lib/world-start'
import { ViewerScene } from '../viewer-scene'
import { applyLayer, type WorldLayer, type WorldLight } from '../viewer-world'
import { ChunkLoader } from './ChunkLoader'
import { useScenePageReady } from './PageFrame'
import { ViewerIcon } from './ViewerIcons'
import { ViewerStudio } from './ViewerStudio'
import './viewer-studio.css'
import '../pages/timelapse.css'

/** One capture of an evolving world; a shared world carries its small picture. */
export interface WorldFrame extends TemporalFrame {
	image?: string | null
}

/** The captures of one world, oldest first: the owner's own world or the one a world link opens. */
export interface WorldData {
	name: string
	dimension: string | null
	totalFrames: number
	truncated: boolean
	frames: WorldFrame[]
}

/** Where a world and its captures come from. A new `key` loads another world. */
export interface WorldSource {
	key: string
	load(signal: AbortSignal): Promise<WorldData>
	/** Throws `RestorationNeeded` for an archived capture. */
	download(frame: WorldFrame, signal: AbortSignal): Promise<File>
	/** Restores an archived capture, then downloads it; without it, an archived capture is opened alone. */
	restore?(frame: WorldFrame, signal: AbortSignal): Promise<File>
	/** The message shown when the world cannot be loaded. */
	unavailable: string
}

/** How a world opens: on a link's capture, and what to do once that capture is drawn and framed. */
export interface WorldStart {
	snapshot?: string | null | undefined
	onShown?(scene: ViewerScene): void
}

const pending = new Set<FrameStatus>(['waiting', 'loading'])

interface WorldRuntime {
	scene: ViewerScene
	composition: WorldComposition
	layers: Map<number, WorldLayer>
	base: TemporalFrame['origin']
	loader: WorldLoader<WorldFrame>
}

function visibleLights(runtime: WorldRuntime, step: number, floor: number): WorldLight[] {
	const lights: WorldLight[] = []
	for (const [position, layer] of runtime.layers) {
		if (position > step || position < floor) continue
		for (const light of layer.lights) {
			const block = light.position.clone().add(runtime.base)
			if (!runtime.composition.covered(position, step, block)) lights.push(light)
		}
	}
	return lights
}

/** With `onlyCurrent`, captures older than the one shown are not drawn: far fewer triangles on slow machines. */
function show(runtime: WorldRuntime, step: number, onlyCurrent: boolean) {
	const floor = onlyCurrent ? step : 0
	for (const position of runtime.composition.compose(step, floor)) {
		const layer = runtime.layers.get(position)
		if (layer) applyLayer(layer)
	}
	runtime.scene.showWorld(visibleLights(runtime, step, floor))
}

const PLAY_SECONDS = 1.8

/** Minecraft day ticks start at 06:00; the viewer clock counts minutes from midnight. */
export function captureClock(dayTime: number): number {
	return ((((dayTime % 24_000) + 30_000) % 24_000) * 1440) / 24_000
}

function isTyping(event: KeyboardEvent): boolean {
	const field = event.target instanceof HTMLElement && event.target.matches('input, select, textarea')
	return field || event.metaKey || event.ctrlKey || event.altKey
}

interface StartView {
	step: { current: number }
	onlyCurrent: { current: boolean }
	onShown: (() => void) | undefined
}

function startWorld(
	scene: ViewerScene,
	world: WorldData,
	download: (frame: WorldFrame, signal: AbortSignal) => Promise<File>,
	setStatuses: (update: (current: FrameStatus[]) => FrameStatus[]) => void,
	view: StartView
): WorldRuntime {
	const frames = world.frames
	const newest = frames.at(-1) as WorldFrame
	const base = (frames[0] as WorldFrame).origin
	scene.setCaptureContext({
		...base,
		dayTime: newest.dayTime,
		dimension: world.dimension,
		seed: newest.seed,
		biome: newest.biome,
	})
	const composition = new WorldComposition(frames.length)
	const layers = new Map<number, WorldLayer>()
	let centered = false
	setStatuses(() => frames.map(() => 'waiting'))
	const loader = new WorldLoader(frames, plannedFrames(frames.map(frame => frame.size)), {
		concurrency: 3,
		download,
		attach: async (frame, position, file, signal) => {
			const offset = { x: frame.origin.x - base.x, y: frame.origin.y - base.y, z: frame.origin.z - base.z }
			const layer = await scene.addLayer(file, { origin: frame.origin, bounds: frame.bounds, offset }, signal)
			composition.set(position, layer.capture)
			layers.set(position, layer)
			show(runtime, view.step.current, view.onlyCurrent.current)
			// The first layer was framed while it drew nothing: once the shown capture is composed, centre on the player.
			if (position === view.step.current && !centered) {
				centered = true
				scene.focusLayer(layer.root)
				view.onShown?.()
			}
		},
		onStatus: (position, status) =>
			setStatuses(current => current.map((value, index) => (index === position ? status : value))),
	})
	const runtime: WorldRuntime = { scene, composition, layers, base, loader }
	loader.start()
	return runtime
}

/** Plays, steps and keys through a world's captures in one composed scene. */
export function useWorldEvolution(source: WorldSource, start: WorldStart = {}) {
	const canvas = useRef<HTMLCanvasElement>(null)
	const runtime = useRef<WorldRuntime | null>(null)
	const scene = useRef<ViewerScene | null>(null)
	const stepRef = useRef(0)
	const onlyCurrentRef = useRef(false)
	const shown = useRef(-1)
	const sourceRef = useRef(source)
	sourceRef.current = source
	// The link's capture and view apply to the first load only.
	const startRef = useRef<WorldStart | null>(start)
	const restoring = useRef(new Set<string>())
	const [world, setWorld] = useState<WorldData | null>(null)
	const [statuses, setStatuses] = useState<FrameStatus[]>([])
	const [step, setStep] = useState(0)
	const [playing, setPlaying] = useState(false)
	const [onlyCurrent, setOnlyCurrentState] = useState(false)
	const [error, setError] = useState('')
	const [retry, setRetry] = useState(0)
	const [minutes, setMinutes] = useState(570)
	const key = source.key

	useEffect(() => {
		if (!(canvas.current && key)) return
		let viewer: ViewerScene
		try {
			viewer = new ViewerScene(canvas.current, {
				onCycle: cycle => setMinutes(cycle.minutes),
				onFileInfo: () => undefined,
				onEmptyChange: () => undefined,
				onLoading: () => undefined,
			})
		} catch {
			setError('Your browser can’t show 3D. Try Chrome or Firefox.')
			return
		}
		scene.current = viewer
		shown.current = -1
		const request = new AbortController()
		setError('')
		setWorld(null)
		const download = (frame: WorldFrame, signal: AbortSignal) => {
			const current = sourceRef.current
			if (!(current.restore && restoring.current.has(frame.id))) return current.download(frame, signal)
			return current.restore(frame, signal).finally(() => restoring.current.delete(frame.id))
		}
		void sourceRef.current
			.load(request.signal)
			.then(loaded => {
				if (request.signal.aborted) return
				const link = startRef.current
				startRef.current = null
				const planned = plannedFrames(loaded.frames.map(frame => frame.size))
				const first = startStep(
					loaded.frames.map(frame => frame.id),
					planned,
					link?.snapshot
				)
				const dayTime = loaded.frames[first]?.dayTime
				if (dayTime != null) viewer.setMinutes(captureClock(dayTime))
				stepRef.current = first
				runtime.current = startWorld(viewer, loaded, download, setStatuses, {
					step: stepRef,
					onlyCurrent: onlyCurrentRef,
					onShown: link?.onShown ? () => link.onShown?.(viewer) : undefined,
				})
				setStep(first)
				setWorld(loaded)
			})
			.catch(() => {
				if (!request.signal.aborted) setError(sourceRef.current.unavailable)
			})
		return () => {
			request.abort()
			runtime.current?.loader.dispose()
			runtime.current = null
			scene.current = null
			viewer.dispose()
		}
	}, [key, retry])

	// Each new moment glides the camera to the capture that changed and turns the sun to its hour.
	useEffect(() => {
		stepRef.current = step
		const current = runtime.current
		if (!current) return
		show(current, step, onlyCurrentRef.current)
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

	const setOnlyCurrent = useCallback((value: boolean) => {
		onlyCurrentRef.current = value
		setOnlyCurrentState(value)
		if (runtime.current) show(runtime.current, stepRef.current, value)
	}, [])

	const recenter = useCallback(() => {
		const current = runtime.current
		if (!current) return
		const loaded = [...current.layers.keys()].filter(position => position <= stepRef.current)
		const layer = current.layers.get(Math.max(...loaded))
		if (layer) current.scene.focusLayer(layer.root)
	}, [])

	// Double-click on a capture of the film: show it and frame the camera on it (like the recenter button).
	const focusFrame = useCallback(
		(position: number) => {
			select(position)
			const layer = runtime.current?.layers.get(position)
			if (layer) runtime.current?.scene.focusLayer(layer.root)
		},
		[select]
	)

	const restoreFrame = useCallback(
		(position: number) => {
			const frame = world?.frames[position]
			if (!frame) return
			restoring.current.add(frame.id)
			select(position)
			runtime.current?.loader.retry(position)
		},
		[world, select]
	)

	return {
		canvas,
		scene,
		minutes,
		world,
		statuses,
		step,
		playing,
		onlyCurrent,
		setOnlyCurrent,
		error,
		select,
		recenter,
		focusFrame,
		restoreFrame,
		togglePlay: () => {
			if (!playing && world && step >= world.frames.length - 1) setStep(0)
			setPlaying(value => !value)
		},
		retryAll: () => setRetry(value => value + 1),
		retryFrame: (position: number) => runtime.current?.loader.retry(position),
	}
}

export type WorldState = ReturnType<typeof useWorldEvolution>

/** What a capture of the film offers beside it: the owner opens it alone, a visitor restores it in place. */
export interface FilmActions {
	openAlone?: (frame: WorldFrame) => string
	images?: ReadonlyMap<string, string>
	restorable?: boolean
}

/**
 * The stage of an evolving world: the composed scene, its loader and the studio around it, the capture film
 * included. `overlay` goes over the scene (a restoration card), `children` above the film in the studio.
 */
export function WorldStage({
	state,
	actions,
	memoryId,
	ariaLabel,
	initialView,
	viewLink,
	overlay,
	children,
	onEngage,
}: {
	state: WorldState
	actions: FilmActions
	memoryId?: string | null
	ariaLabel: string
	initialView?: ViewLink
	viewLink?: boolean
	overlay?: ReactNode
	children?: ReactNode
	onEngage?: () => void
}) {
	const { world, statuses, error, step } = state
	const ready = statuses.some(status => status === 'ready')
	// on screen once the capture shown is drawn, or once it cannot come (archived, failed, not loaded), or once nothing is left to load; the stage loader
	// does not come back when a later capture is still on its way
	const shownNow =
		world !== null &&
		statuses.length > 0 &&
		!(pending.has(statuses[step] as FrameStatus) && statuses.some(status => pending.has(status)))
	const [drawn, setDrawn] = useState(false)
	useEffect(() => {
		if (shownNow) setDrawn(true)
	}, [shownNow])
	useScenePageReady(drawn || shownNow || Boolean(error))
	const current = world?.frames[step]
	return (
		<>
			<div className="viewer-stage">
				<canvas
					ref={state.canvas}
					className="cinema-canvas"
					aria-label={ariaLabel}
					onPointerDown={onEngage}
					onWheel={onEngage}
				/>
				{!error && <ChunkLoader active={!(drawn || shownNow)} label="Loading memory…" />}
				{overlay}
			</div>
			<ViewerStudio
				sceneRef={state.scene}
				memoryId={memoryId ?? null}
				ready={ready}
				minutes={state.minutes}
				captureMinutes={current?.dayTime == null ? null : captureClock(current.dayTime)}
				onRecenter={state.recenter}
				{...(initialView ? { initialView } : {})}
				{...(viewLink ? { viewLink, snapshot: current?.id ?? null } : {})}
			>
				{children}
				{error && <WorldError error={error} onRetry={state.retryAll} />}
				{world && <CaptureFilm state={state} world={world} actions={actions} />}
			</ViewerStudio>
		</>
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
	archived: 'Archived: open it alone to bring it back',
	failed: 'Could not load',
	skipped: 'Not loaded',
}

function statusLabel(status: FrameStatus, restorable: boolean | undefined): string {
	if (status === 'archived' && restorable) return 'Archived: bring it back to see it'
	return statusLabels[status]
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
			aria-label={t('Loading memory…')}
			aria-valuemin={0}
			aria-valuemax={planned}
			aria-valuenow={settled}
		>
			<span style={{ width: `${(settled / planned) * 100}%` }} />
		</div>
	)
}

function CaptureFilm({ state, world, actions }: { state: WorldState; world: WorldData; actions: FilmActions }) {
	const { t, locale } = useI18n()
	const { statuses, step, playing } = state
	const list = useRef<HTMLOListElement>(null)
	useEffect(() => {
		list.current?.querySelector('[aria-current="step"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
	}, [step])
	const first = world.frames[0]
	const last = world.frames.at(-1)
	return (
		<nav aria-label={t('Memories of this world')} className="film">
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
			<div className="film-steps">
				<button
					type="button"
					aria-label={t('Previous memory')}
					title={t('Previous memory')}
					disabled={step <= 0}
					onClick={() => state.select(step - 1)}
				>
					<ViewerIcon name="chevronUp" />
				</button>
				<button
					type="button"
					aria-label={t('Next memory')}
					title={t('Next memory')}
					disabled={step >= world.frames.length - 1}
					onClick={() => state.select(step + 1)}
				>
					<ViewerIcon name="chevronDown" />
				</button>
				<button
					type="button"
					aria-pressed={!state.onlyCurrent}
					aria-label={t('Older memories')}
					title={t('Older memories')}
					onClick={() => state.setOnlyCurrent(!state.onlyCurrent)}
				>
					<ViewerIcon name="layers" />
				</button>
			</div>
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
							actions={actions}
							status={statuses[position] ?? 'waiting'}
						/>
					)
				})}
			</ol>
			{world.truncated && <p className="film-note">{t('Only the latest memories are loaded, to keep it fast.')}</p>}
		</nav>
	)
}

/** Beside a capture: retry a failed one, restore an archived one in place, or open it alone. */
function FilmSide({
	frame,
	position,
	status,
	state,
	actions,
}: {
	frame: WorldFrame
	position: number
	status: FrameStatus
	state: WorldState
	actions: FilmActions
}) {
	const { t } = useI18n()
	const restore = status === 'archived' && actions.restorable
	if (status === 'failed' || restore)
		return (
			<button
				type="button"
				className="film-side"
				aria-label={restore ? `${t('Bring it back')} · ${frame.name}` : t('Retry')}
				title={t(restore ? 'Bring it back' : 'Retry')}
				onClick={() => (restore ? state.restoreFrame(position) : state.retryFrame(position))}
			>
				<ViewerIcon name="refresh" />
			</button>
		)
	if (!actions.openAlone) return null
	return (
		<Link
			className="film-side"
			to={actions.openAlone(frame)}
			aria-label={`${t('Open alone')} · ${frame.name}`}
			title={t('Open alone')}
		>
			<ViewerIcon name="share" />
		</Link>
	)
}

function FilmItem({
	frame,
	position,
	day,
	state,
	actions,
	status,
}: {
	frame: WorldFrame
	position: number
	day: string | null
	state: WorldState
	actions: FilmActions
	status: FrameStatus
}) {
	const { t, locale } = useI18n()
	const image = frame.image ?? actions.images?.get(frame.id)
	const time = new Date(frame.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
	const current = position === state.step
	const label = t(statusLabel(status, actions.restorable))
	return (
		<li className="film-item" data-status={status} data-future={position > state.step}>
			{day && <span className="film-day">{day}</span>}
			<div className="film-row">
				<button
					type="button"
					className="film-frame"
					aria-current={current ? 'step' : undefined}
					aria-label={`${frame.name} · ${new Date(frame.at).toLocaleString(locale)} · ${label}`}
					title={`${frame.name} · ${label}`}
					onClick={() => state.select(position)}
					onDoubleClick={() => state.focusFrame(position)}
				>
					<span className="film-thumb" style={image ? { backgroundImage: `url("${image}")` } : undefined}>
						<span className="film-status" aria-hidden="true" />
					</span>
					<time dateTime={frame.at}>{time}</time>
				</button>
				<FilmSide frame={frame} position={position} status={status} state={state} actions={actions} />
			</div>
		</li>
	)
}
