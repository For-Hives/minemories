import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { bootDissolve, bootFade, mapLevels, mapPlan, paintMap } from '../../../../scripts/boot-screen/chunk-screen.mjs'
import { bootConfig, DIRT, dirtTile, SEED } from '../../../../scripts/boot-screen/look.mjs'
import { useI18n } from '../i18n/I18n'
import { CHUNK_DELAY, type ChunkClock, chunkFill, chunkHeld, startChunkClock, stepChunkClock } from '../lib/chunk-clock'
import './chunk-loader.css'

const C = bootConfig()
const TIMINGS = { lead: C.lead, quick: C.quick, hold: C.hold }

let dirt: string | null | undefined
/** The loading screen's own dirt tile (scripts/boot-screen/look.mjs), drawn once as a 16 x 16 PNG; null without a 2D canvas. */
function dirtUrl(): string | null {
	if (dirt !== undefined) return dirt
	const canvas = document.createElement('canvas')
	canvas.width = 16
	canvas.height = 16
	const g = canvas.getContext('2d')
	if (!g) {
		dirt = null
		return dirt
	}
	const image = g.createImageData(16, 16)
	const tile = dirtTile(SEED)
	for (let i = 0; i < tile.length; i++) image.data.set([...(DIRT[tile[i] ?? 0] ?? []), 255], i * 4)
	g.putImageData(image, 0, 0)
	dirt = canvas.toDataURL()
	return dirt
}

/** The clock at the page screen's 95 %: no black lead, no refill. */
const handOver = (): ChunkClock => ({ clock: C.lead + 0.95 * C.quick, shown: 0.95, fullAt: 0 })

const reducedMotion = () =>
	Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ||
	document.documentElement.dataset.mcMotion === 'reduced'

/** Paints the map and its percentage, only when they change (the speckles are re-drawn every 150 ms). */
function painter(root: HTMLElement) {
	const label = root.querySelector('.boot-pc')
	const ctx = root.querySelector('canvas')?.getContext('2d') ?? null
	const image = ctx?.createImageData(3 * C.n, 3 * C.n)
	const plan = mapPlan(C.n, C.seed, C.at)
	let key = ''
	return (s: ChunkClock) => {
		const pct = Math.floor(s.shown * 100)
		const q = chunkFill(s, TIMINGS)
		const tick = Math.floor(s.clock / 150)
		const next = `${pct} ${tick} ${q >= 2}`
		if (next === key) return
		key = next
		if (label) label.textContent = `${pct}%`
		if (ctx && image) ctx.putImageData(paintMap(image, mapLevels(q, plan, tick), C.colors), 0, 0)
	}
}

/**
 * Plays one load on `root`: transparent (announced, not seen) for the first CHUNK_DELAY ms and while the page's own loading screen (#boot, index.html) still covers it, then the
 * map fills, waits at 95 % while `loading()` holds, reaches 100 %, holds, and the dirt leaves block by block (a short fade with reduced motion).
 * Calls `done` once it has gone, or at once if the load ended before it showed. Returns the stop for an unmount.
 */
function playLoad(root: HTMLElement, loading: () => boolean, done: () => void) {
	const paint = painter(root)
	const tile = new Image()
	const url = dirtUrl()
	if (url) tile.src = url
	let s = startChunkClock()
	let waited = 0
	let covered = false
	let last = performance.now()
	let frame = 0
	const reveal = () => {
		if (reducedMotion() || !(tile.complete && tile.naturalWidth)) bootFade(root, window, done)
		else bootDissolve(root, window, C, tile, done)
	}
	// the waiting phase (transparent): true while the screen stays unseen
	const unseen = (elapsed: number) => {
		if (!root.classList.contains('is-waiting')) return false
		waited += elapsed
		const boot = document.getElementById('boot')
		covered ||= Boolean(boot)
		if (waited < CHUNK_DELAY || boot) return true
		root.classList.remove('is-waiting')
		// the page's screen gave up (its safety stop) while the capture still loads: carry on from where it stood, at 95 %
		if (covered) s = handOver()
		return true
	}
	const step = () => {
		const now = performance.now()
		const elapsed = now - last
		last = now
		if (root.classList.contains('is-waiting') && !loading()) return done()
		if (unseen(elapsed)) {
			frame = requestAnimationFrame(step)
			return
		}
		// a new load during the hold at 100 %: a new map, the dirt stays (no reveal of a stage that is about to change)
		if (s.fullAt && loading()) s = startChunkClock()
		s = stepChunkClock(s, elapsed, !loading(), TIMINGS)
		paint(s)
		if (chunkHeld(s, TIMINGS)) reveal()
		else frame = requestAnimationFrame(step)
	}
	frame = requestAnimationFrame(step)
	return () => cancelAnimationFrame(frame)
}

/**
 * The world-loading screen of the landing (index.html), inside a viewer's stage: while `active`, a capture is on its way. One load plays in full, even
 * if `active` turns false meanwhile (it fills to 100 % then reveals the scene); a new load during the reveal starts a new map.
 */
export function ChunkLoader({ active, label }: { active: boolean; label: string }) {
	const { t } = useI18n()
	const activeRef = useRef(active)
	activeRef.current = active
	const [run, setRun] = useState(active ? 1 : 0)
	const root = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (active) setRun(value => value || 1)
	}, [active])
	useEffect(() => {
		const element = root.current
		if (!(run && element)) return
		let live = true
		const stop = playLoad(
			element,
			() => activeRef.current,
			() => {
				if (live) setRun(value => (activeRef.current ? value + 1 : 0))
			}
		)
		return () => {
			live = false
			stop()
		}
	}, [run])
	if (!run) return null
	const url = dirtUrl()
	return (
		<div
			key={run}
			ref={root}
			className="mm-chunk is-waiting"
			role="status"
			style={url ? ({ '--mm-dirt': `url(${url})` } as CSSProperties) : undefined}
		>
			<span className="boot-t">{t(label)}</span>
			<div className="boot-map" aria-hidden="true">
				<p className="boot-pc">0%</p>
				<canvas width={3 * C.n} height={3 * C.n} />
			</div>
		</div>
	)
}
