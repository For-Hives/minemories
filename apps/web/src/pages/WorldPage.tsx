import type { TemporalFrame, WorldEvolution } from '@minemories/api-contract'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { buttonDark, buttonOutline } from '../components/ui'
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
	const stepRef = useRef(0)
	const [world, setWorld] = useState<WorldEvolution | null>(null)
	const [statuses, setStatuses] = useState<FrameStatus[]>([])
	const [step, setStep] = useState(0)
	const [playing, setPlaying] = useState(false)
	const [delay, setDelay] = useState(1)
	const [error, setError] = useState('')
	const [retry, setRetry] = useState(0)

	// biome-ignore lint/correctness/useExhaustiveDependencies: `retry` restarts the whole world on demand.
	useEffect(() => {
		if (!canvas.current) return
		let scene: ViewerScene
		try {
			scene = new ViewerScene(canvas.current, {
				onCycle: () => undefined,
				onFileInfo: () => undefined,
				onEmptyChange: () => undefined,
				onLoading: () => undefined,
			})
		} catch {
			setError('The 3D viewer could not start. Enable WebGL and reload this page.')
			return
		}
		const request = new AbortController()
		setError('')
		setWorld(null)
		void apiClient.timelapse
			.world({ memoryId }, { signal: request.signal })
			.then(evolution => {
				if (request.signal.aborted) return
				runtime.current = startWorld(scene, evolution, setStatuses, stepRef)
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
			scene.dispose()
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

export function WorldPage({ memoryId }: { memoryId: string }) {
	const state = useWorldEvolution(memoryId)
	const { t } = useI18n()
	const { world, statuses, error } = state
	const ready = statuses.filter(status => status === 'ready').length
	const skipped = statuses.filter(status => status === 'skipped').length
	return (
		<section className="mx-auto max-w-[1480px] px-5 py-8">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<div>
					<p className="font-mono text-xs text-[#607a4a]">{t('EVOLVING WORLD')}</p>
					<h1 className="text-2xl font-bold">{world?.name ?? t('Your world through time')}</h1>
					{world && (
						<p className="text-sm text-[#b4c1ad]">
							{t(scopeLabels[world.scope])} ·{' '}
							{t('{ready} of {total} captures loaded', { ready, total: world.frames.length })} ·{' '}
							{formatFileSize(world.totalBytes)}
						</p>
					)}
				</div>
				<Link className={buttonOutline} to="/gallery">
					{t('My gallery')}
				</Link>
			</div>
			{(world?.truncated || skipped > 0) && (
				<p role="status" className="mb-3 text-sm">
					{t('Only the most recent captures are loaded to keep the viewer fast.')}
				</p>
			)}
			{error && <WorldError error={error} onRetry={state.retryAll} />}
			<div className="grid grid-cols-[300px_minmax(0,1fr)] gap-4 max-tablet:grid-cols-1">
				<CaptureList state={state} />
				<div className="max-tablet:order-first">
					<div className="relative h-[68vh] min-h-[360px] overflow-hidden rounded-lg bg-night">
						<canvas ref={state.canvas} className="h-full w-full" aria-label={t('Interactive 3D scene')} />
						{world && ready === 0 && !error && (
							<p role="status" className="absolute left-4 top-4 rounded bg-night px-3 py-2 text-white">
								{t('Loading capture…')}
							</p>
						)}
						<button
							type="button"
							className={`${buttonOutline} absolute bottom-4 right-4`}
							onClick={state.recenter}
							disabled={ready === 0}
						>
							{t('Recenter the camera')}
						</button>
					</div>
					{world && <WorldControls state={state} world={world} />}
				</div>
			</div>
		</section>
	)
}

function WorldError({ error, onRetry }: { error: string; onRetry: () => void }) {
	const { t } = useI18n()
	return (
		<div role="alert" className="my-4">
			<p>{t(error)}</p>
			<button className={buttonOutline} type="button" onClick={onRetry}>
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
	if (!world) return <div aria-busy="true" className="rounded-lg border border-[#354238] p-4 max-tablet:hidden" />
	return (
		<nav aria-label={t('Captures of this world')} className="rounded-lg border border-[#354238] bg-[#151d17]">
			<h2 className="m-0 border-b border-[#354238] px-4 py-3 text-sm font-bold">
				{t('{count} captures, oldest first', { count: world.totalFrames })}
			</h2>
			<ol className="m-0 max-h-[62vh] list-none overflow-y-auto p-2 max-tablet:max-h-[40vh]">
				{world.frames.map((frame, position) => {
					const status = statuses[position] ?? 'waiting'
					const chunks = state.chunks(position)
					return (
						<li key={frame.id} className={position > step ? 'opacity-60' : ''}>
							<button
								type="button"
								aria-current={position === step ? 'step' : undefined}
								onClick={() => state.select(position)}
								className={`w-full cursor-pointer rounded-md border px-3 py-2 text-left ${position === step ? 'border-lime bg-[#243026]' : 'border-transparent bg-transparent hover:bg-[#1c2720]'}`}
							>
								<span className="block text-xs font-bold text-ink">
									<time dateTime={frame.at} title={frame.at}>
										{new Date(frame.at).toLocaleString(locale)}
									</time>
								</span>
								<span className="block truncate text-[11px] text-[#b4c1ad]">{frame.name}</span>
								<span className="block text-[10px] text-[#8e978a]">
									{t(statusLabels[status])}
									{chunks !== null && ` · ${t('{count} chunks', { count: chunks })}`}
								</span>
							</button>
							<span className="flex gap-3 px-3 pb-1 text-[10px]">
								<Link to={`/viewer?memory=${encodeURIComponent(frame.id)}`} className="text-[#8e978a]">
									{t('Open alone')}
								</Link>
								{status === 'failed' && (
									<button
										type="button"
										className="cursor-pointer border-0 bg-transparent p-0 text-[10px] text-[#d9c27a]"
										onClick={() => state.retryFrame(position)}
									>
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
	const current = world.frames[step]
	return (
		<div className="my-4 flex flex-wrap items-center gap-3">
			<button type="button" className={buttonOutline} disabled={step <= 0} onClick={() => select(step - 1)}>
				{t('Previous capture')}
			</button>
			<button
				type="button"
				className={buttonDark}
				disabled={!playing && step >= last}
				aria-pressed={playing}
				onClick={() => setPlaying(value => !value)}
			>
				{t(playing ? 'Pause' : 'Play')}
			</button>
			<button type="button" className={buttonOutline} disabled={step >= last} onClick={() => select(step + 1)}>
				{t('Next capture')}
			</button>
			<label>
				{t('Seconds per capture')}{' '}
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
			<label className="w-full">
				<span aria-live="polite">
					{current && new Date(current.at).toLocaleString(locale)} · {step + 1} / {last + 1}
				</span>
				<input
					aria-label={t('Moment of the world')}
					className="w-full"
					type="range"
					min={0}
					max={last}
					value={step}
					onChange={event => select(Number(event.target.value))}
				/>
			</label>
		</div>
	)
}
