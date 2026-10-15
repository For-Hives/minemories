import type { TemporalFrame, TemporalWindow } from '@minemories/api-contract'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { buttonDark, buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { formatFileSize } from '../lib/glb'
import { ViewerScene } from '../viewer-scene'
import { fetchTemporalFile } from './temporal-files'
import { TemporalLoader } from './temporal-loader'
import { rememberFrame, resumedFrame } from './temporal-resume'

function useTimelapse(memoryId: string) {
	const canvas = useRef<HTMLCanvasElement>(null)
	const scene = useRef<ViewerScene | null>(null)
	const loader = useRef<TemporalLoader | null>(null)
	const series = useRef<string | null>(null)
	const rendered = useRef(false)
	const origin = useRef<TemporalFrame['origin'] | null>(null)
	const pageRequest = useRef<AbortController | null>(null)
	const [window, setWindow] = useState<TemporalWindow | null>(null)
	const [current, setCurrent] = useState<TemporalFrame | null>(null)
	const [selected, setSelected] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [paging, setPaging] = useState(true)
	const [playing, setPlaying] = useState(false)
	const [delay, setDelay] = useState(2)
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const [retry, setRetry] = useState(0)

	useEffect(() => {
		let disposed = false
		let viewer: ViewerScene
		if (!canvas.current) return
		try {
			viewer = new ViewerScene(canvas.current, {
				onCycle: () => undefined,
				onFileInfo: () => undefined,
				onEmptyChange: () => undefined,
				onLoading: () => undefined,
			})
		} catch {
			setError('The 3D viewer could not start. Enable WebGL and reload this page.')
			setPaging(false)
			return
		}
		scene.current = viewer
		const queue = new TemporalLoader(
			async (frame, signal) => {
				const file = await fetchTemporalFile(frame, signal)
				if (signal.aborted) return
				origin.current ??= frame.origin
				const base = origin.current
				await viewer.loadFile(file, {
					signal,
					preserveView: rendered.current,
					originDelta: { x: frame.origin.x - base.x, y: frame.origin.y - base.y, z: frame.origin.z - base.z },
				})
				if (signal.aborted) return
				viewer.setCaptureContext({
					x: base.x,
					y: base.y,
					z: base.z,
					dayTime: frame.dayTime,
					dimension: dimension.current,
					seed: frame.seed,
					biome: frame.biome,
				})
				if (frame.dayTime !== null) viewer.setMinutes(((((frame.dayTime % 24_000) + 30_000) % 24_000) * 1440) / 24_000)
			},
			frame => {
				if (disposed) return
				rendered.current = true
				setCurrent(frame)
				if (series.current) rememberFrame(series.current, frame.id)
			},
			() => {
				setError('This capture could not be loaded. Retry or select another capture.')
				setPlaying(false)
			},
			setBusy
		)
		loader.current = queue
		return () => {
			disposed = true
			pageRequest.current?.abort()
			queue.dispose()
			viewer.dispose()
			scene.current = null
			loader.current = null
		}
	}, [])

	const dimension = useRef<string | null>(null)
	useEffect(() => {
		if (!scene.current) return
		const controller = new AbortController()
		pageRequest.current = controller
		setPaging(true)
		setError('')
		void initialWindow(memoryId, controller.signal)
			.then(({ page, first, notice }) => {
				if (controller.signal.aborted) return
				series.current = page.seriesId
				dimension.current = page.dimension
				setWindow(page)
				setNotice(notice)
				setSelected(first.id)
				loader.current?.select(first)
			})
			.catch(() => {
				if (!controller.signal.aborted)
					setError('This timeline is unavailable. Sign in as its owner, or return to your gallery.')
			})
			.finally(() => {
				if (!controller.signal.aborted) {
					setPaging(false)
					pageRequest.current = null
				}
			})
		return () => controller.abort()
	}, [memoryId, retry])

	function select(frame: TemporalFrame) {
		setError('')
		setSelected(frame.id)
		loader.current?.select(frame)
	}

	async function changePage(direction: 'before' | 'after') {
		if (!window || pageRequest.current) return
		const edge = direction === 'before' ? window.frames[0] : window.frames.at(-1)
		if (!edge) return
		const controller = new AbortController()
		pageRequest.current = controller
		setPaging(true)
		setError('')
		try {
			const page = await nextWindow(memoryId, edge.id, direction, series.current, controller.signal)
			if (controller.signal.aborted) return
			applyNextPage(page, direction)
		} catch {
			pageError(controller.signal)
		} finally {
			if (!controller.signal.aborted) {
				setPaging(false)
				pageRequest.current = null
			}
		}
	}

	function pageError(signal: AbortSignal) {
		if (signal.aborted) return
		setPlaying(false)
		setError('The next captures could not be loaded. Try the page controls again.')
	}

	const index = window?.frames.findIndex(frame => frame.id === current?.id) ?? -1
	useEffect(() => {
		if (!(playing && !busy && !paging && current && window) || error) return
		const timer = globalThis.setTimeout(() => {
			const next = window.frames[index + 1]
			if (next) select(next)
			else if (window.hasNext) void changePage('after')
			else setPlaying(false)
		}, delay * 1000)
		return () => globalThis.clearTimeout(timer)
	})
	useEffect(() => {
		const pause = () => {
			if (document.hidden) setPlaying(false)
		}
		document.addEventListener('visibilitychange', pause)
		return () => document.removeEventListener('visibilitychange', pause)
	}, [])

	function move(offset: number) {
		setPlaying(false)
		const next = window?.frames[index + offset]
		if (next) select(next)
		else void changePage(offset < 0 ? 'before' : 'after')
	}

	function applyNextPage(page: TemporalWindow, direction: 'before' | 'after') {
		const frame = direction === 'before' ? page.frames.at(-1) : page.frames[0]
		if (!frame) {
			setPlaying(false)
			setNotice('No further capture is available. Reload to refresh the timeline.')
			return
		}
		setNotice('')
		setWindow(page)
		select(frame)
	}

	return {
		canvas,
		scene,
		window,
		current,
		selected,
		busy,
		paging,
		playing,
		delay,
		error,
		notice,
		index,
		select,
		changePage,
		move,
		setRetry,
		setPlaying,
		setDelay,
	}
}

type Timeline = ReturnType<typeof useTimelapse>

export function TimelapsePage({ memoryId }: { memoryId: string }) {
	const state = useTimelapse(memoryId)
	const { canvas, scene, window, current, busy, paging, error, notice } = state
	const { t, locale } = useI18n()

	return (
		<section className="mx-auto max-w-[1360px] px-5 py-8">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<div>
					<p className="font-mono text-xs text-[#607a4a]">{t('CAPTURE TIMELINE')}</p>
					<h1 className="text-2xl font-bold">{window?.name ?? t('Your world through time')}</h1>
				</div>
				<Link className={buttonOutline} to="/gallery">
					{t('My gallery')}
				</Link>
			</div>
			<p>{t('Only recorded captures are shown. No states between captures are reconstructed.')}</p>
			{window && (
				<p className="text-sm">
					{t(scopeLabels[window.scope])} · {window.totalFrames} {t('captures')} · {formatFileSize(window.totalBytes)}
				</p>
			)}
			<div className="relative h-[65vh] min-h-[360px] overflow-hidden rounded-lg bg-night">
				<canvas ref={canvas} className="h-full w-full" aria-label={t('Interactive 3D scene')} />
				{(busy || paging) && (
					<p role="status" className="absolute left-4 top-4 rounded bg-night px-3 py-2 text-white">
						{t('Loading capture…')}
					</p>
				)}
				<button
					type="button"
					className={`${buttonOutline} absolute bottom-4 right-4`}
					onClick={() => scene.current?.resetView()}
					disabled={!current || busy}
				>
					{t('Recenter the camera')}
				</button>
			</div>
			{error && <TimelineError state={state} />}
			{notice && <p role="status">{t(notice)}</p>}
			{current && (
				<p aria-live="polite">
					{current.name} ·{' '}
					<time dateTime={current.at} title={current.at}>
						{new Date(current.at).toLocaleString(locale)}
					</time>{' '}
					· {t(current.timeSource === 'capture' ? 'Capture time' : 'Upload time (capture time unknown)')}
					{current.captureFinishedAt && current.captureStartedAt && (
						<span className="mt-1 block break-all font-mono text-xs">
							{' '}
							· {t('Capture interval')}: {current.captureStartedAt} → {current.captureFinishedAt}
						</span>
					)}
				</p>
			)}
			{window && <TimelineControls state={state} window={window} />}
		</section>
	)
}

function TimelineError({ state }: { state: Timeline }) {
	const { t } = useI18n()
	const { error, busy, paging, window, selected, scene, select, setRetry } = state
	return (
		<div role="alert" className="my-4">
			<p>{t(error)}</p>
			{scene.current && (
				<button
					className={buttonOutline}
					type="button"
					disabled={busy || paging}
					onClick={() => {
						const target = window?.frames.find(frame => frame.id === selected)
						if (target && error === 'This capture could not be loaded. Retry or select another capture.') select(target)
						else setRetry(value => value + 1)
					}}
				>
					{t('Retry')}
				</button>
			)}
		</div>
	)
}

function TimelineControls({ state, window }: { state: Timeline; window: TemporalWindow }) {
	const { t } = useI18n()
	const {
		current,
		selected,
		busy,
		paging,
		index,
		playing,
		delay,
		error,
		move,
		setPlaying,
		setDelay,
		select,
		changePage,
		setRetry,
	} = state
	return (
		<div className="my-5 flex flex-wrap items-center gap-3">
			<button
				type="button"
				className={buttonOutline}
				disabled={busy || paging || (index <= 0 && !window.hasPrevious)}
				onClick={() => move(-1)}
			>
				{t('Previous capture')}
			</button>
			<button
				type="button"
				className={buttonDark}
				disabled={
					!playing && (paging || !current || !!error || (index === window.frames.length - 1 && !window.hasNext))
				}
				aria-pressed={playing}
				onClick={() => setPlaying(value => !value)}
			>
				{t(playing ? 'Pause' : 'Play')}
			</button>
			<button
				type="button"
				className={buttonOutline}
				disabled={busy || paging || (index === window.frames.length - 1 && !window.hasNext)}
				onClick={() => move(1)}
			>
				{t('Next capture')}
			</button>
			<label>
				{t('Seconds per capture')}{' '}
				<select
					aria-label={t('Seconds per capture')}
					value={delay}
					onChange={event => setDelay(Number(event.target.value))}
				>
					{[1, 2, 5, 10].map(value => (
						<option key={value} value={value}>
							{value}
						</option>
					))}
				</select>
			</label>
			<label className="w-full">
				{t('Capture in this page')}
				<input
					aria-label={t('Capture in this page')}
					className="w-full"
					type="range"
					min={0}
					max={Math.max(0, window.frames.length - 1)}
					value={Math.max(
						0,
						window.frames.findIndex(frame => frame.id === selected)
					)}
					disabled={paging}
					onChange={event => {
						setPlaying(false)
						const frame = window.frames[Number(event.target.value)]
						if (frame) select(frame)
					}}
				/>
			</label>
			<button
				className={buttonOutline}
				type="button"
				disabled={busy || paging || !window.hasPrevious}
				onClick={() => {
					setPlaying(false)
					void changePage('before')
				}}
			>
				{t('Earlier captures')}
			</button>
			<span>
				{window.frames.length} {t('captures in this page')}
			</span>
			<button
				className={buttonOutline}
				type="button"
				disabled={busy || paging || !window.hasNext}
				onClick={() => {
					setPlaying(false)
					void changePage('after')
				}}
			>
				{t('Later captures')}
			</button>
			<button
				className={buttonOutline}
				type="button"
				disabled={busy || paging}
				onClick={() => {
					setPlaying(false)
					setRetry(value => value + 1)
				}}
			>
				{t('Reload timeline')}
			</button>
		</div>
	)
}

async function initialWindow(memoryId: string, signal: AbortSignal) {
	const page = await apiClient.timelapse.frames({ memoryId, direction: 'around' }, { signal })
	const saved = resumedFrame(page.seriesId)
	if (saved && saved !== memoryId) {
		try {
			const resumed = await nextWindow(memoryId, saved, 'around', page.seriesId, signal)
			const first = resumed.frames.find(frame => frame.id === saved)
			if (!first) throw new Error('Saved capture unavailable')
			return { page: resumed, first, notice: 'Resumed at your last displayed capture.' }
		} catch {
			return initialSelection(page, memoryId, 'Your saved capture is unavailable. Opened the selected capture instead.')
		}
	}
	return initialSelection(page, memoryId, '')
}

function initialSelection(page: TemporalWindow, memoryId: string, notice: string) {
	const first = page.frames.find(frame => frame.id === memoryId)
	if (!first) throw new Error('Capture unavailable')
	return { page, first, notice }
}

async function nextWindow(
	memoryId: string,
	anchorId: string,
	direction: 'around' | 'before' | 'after',
	seriesId: string | null,
	signal: AbortSignal
) {
	const page = await apiClient.timelapse.frames({ memoryId, anchorId, direction }, { signal })
	if (page.seriesId !== seriesId) throw new Error('Series changed')
	return page
}

const scopeLabels = {
	world: 'Local world',
	session: 'Remote session — reconnecting starts a separate timeline',
	namespace: 'Configured remote world — set in M → Advanced → World',
}
