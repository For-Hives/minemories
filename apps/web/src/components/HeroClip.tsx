import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { translate } from '../i18n/catalog'
import {
	type ClipEnvironment,
	type ClipName,
	clipMayPreload,
	clipMode,
	clipShouldPlay,
	clipSide,
	clipSources,
	createClipStage,
} from '../lib/hero-clips'

/**
 * One short silent clip of the landing (public/hero/clips, sources in docs/features/landing-film.md): real footage, looping, never loaded before it is needed.
 * - Nothing is fetched while the film or the loading screen (#boot) runs: the poster is a lazy <img>, and the <video> gets its file the first time it
 *   comes within half a screen of the viewport (when it would start by itself) or should play.
 * - It plays only on screen, in a visible tab, after the film and the loading screen (html[data-phase], #boot / data-mm-boot-full), and only the most
 *   visible clip plays by itself; it pauses as soon as one of those stops being true.
 * - A clip cut from the game to the browser (`cut`) shows an HTML chip naming the side on screen, following the video's time.
 * - Reduced motion (the media query or the site's option) and Save-Data or a slow connection keep the poster, with a play button; the button also pauses a playing clip.
 * - A clip that shows in-game text has a French and an English take: the page's own `lang` picks it, and a language switch swaps the file.
 * Same text contract as HeroMarkup: rendered in French, the film's bridge rewrites `data-i18n` / `data-i18n-attr` in the visitor's language. React never changes
 * those nodes after the first render (the play and pause labels are both in the markup, CSS shows the right one), so the two never fight.
 */
const t = (key: string) => translate('fr', key)

interface Connection {
	readonly saveData?: boolean
	readonly effectiveType?: string
}

function readEnvironment(): ClipEnvironment {
	const connection = (navigator as { connection?: Connection }).connection
	return {
		reducedMotion: Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
		motionOption: document.documentElement.dataset.mcMotion,
		saveData: connection?.saveData,
		effectiveType: connection?.effectiveType,
	}
}

/** The page signals a clip follows: its language, the film's phase, the loading screen and the motion settings. */
function readPage() {
	const root = document.documentElement
	return {
		lang: root.lang,
		phase: root.dataset.phase,
		booting: Boolean(document.getElementById('boot')) && root.dataset.mmBootFull !== '1',
		mode: clipMode(readEnvironment()),
	}
}

/** How much of a clip must be on screen for it to play. */
const seenRatio = 0.35
/** Visibility steps reported to the stage, so it can tell which clip shows the most. */
const ratioSteps = [0, 0.1, 0.2, seenRatio, 0.5, 0.65, 0.8, 1]
/** All the clips of the page: only the most visible one plays by itself. */
const stage = createClipStage(seenRatio)

/** How far (px) the element's centre is from the middle of the screen. */
function middleDistance(element: Element): number {
	const box = element.getBoundingClientRect()
	return Math.abs(box.top + box.height / 2 - window.innerHeight / 2)
}

/** The element's visible ratio and distance to the middle of the screen, measured now; null before it has a size. */
function viewOf(element: Element): { ratio: number; distance: number } | null {
	const box = element.getBoundingClientRect()
	if (box.height <= 0) return null
	const visible = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0)
	return { ratio: Math.max(0, visible) / box.height, distance: middleDistance(element) }
}

/** A cut from one place to another inside a clip: when it happens and the English keys of the chip on each side. */
export interface ClipCut {
	readonly at: number
	readonly before: string
	readonly after: string
}

export interface HeroClipProps {
	/** File name in public/hero/clips, without extension; `{ fr, en }` for a clip with in-game text. */
	readonly name: ClipName
	readonly width: number
	readonly height: number
	/** English key of the text alternative (the poster's alt). */
	readonly alt: string
	readonly className?: string
	/** The time (s) of the poster frame, when it is not the first one: the video starts there, so nothing jumps when it replaces the poster. */
	readonly posterAt?: number
	/** A cut inside the clip, named by a chip over it. */
	readonly cut?: ClipCut
	/** Where the play/pause button sits: 'start' (top left, the default) or 'end' (bottom right, off a panel in the top half). */
	readonly toggleAt?: 'start' | 'end'
}

export function HeroClip({
	name,
	width,
	height,
	alt,
	className,
	posterAt = 0,
	cut,
	toggleAt = 'start',
}: HeroClipProps) {
	const video = useRef<HTMLVideoElement>(null)
	const root = useRef<HTMLDivElement>(null)
	// The prerender and the first client render are still: the page's real state arrives with the first effect.
	const [page, setPage] = useState<ReturnType<typeof readPage>>({
		lang: 'fr',
		phase: 'film',
		booting: true,
		mode: 'poster',
	})
	const [id] = useState(stage.add)
	const foremost = useSyncExternalStore(
		stage.subscribe,
		() => stage.foremost() === id,
		() => false
	)
	const [inView, setInView] = useState(false)
	const [near, setNear] = useState(false)
	const [side, setSide] = useState(clipSide(posterAt, cut?.at ?? Number.POSITIVE_INFINITY))
	const [pageVisible, setPageVisible] = useState(true)
	const [choice, setChoice] = useState<'play' | 'pause' | null>(null)
	const [loaded, setLoaded] = useState(false)
	const [playing, setPlaying] = useState(false)

	useEffect(() => {
		const update = () => setPage(readPage())
		update()
		const observer = new MutationObserver(update)
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['lang', 'data-phase', 'data-mc-motion', 'data-mm-boot-full'],
		})
		// The loading screen sends mm:boot-full as it reaches 100 % (and also marks <html data-mm-boot-full>).
		window.addEventListener('mm:boot-full', update)
		const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
		query?.addEventListener?.('change', update)
		const visibility = () => setPageVisible(document.visibilityState !== 'hidden')
		visibility()
		document.addEventListener('visibilitychange', visibility)
		return () => {
			observer.disconnect()
			window.removeEventListener('mm:boot-full', update)
			query?.removeEventListener?.('change', update)
			document.removeEventListener('visibilitychange', visibility)
		}
	}, [])

	useEffect(() => {
		const element = root.current
		if (!(element && 'IntersectionObserver' in window)) return
		// "seen" is a third of the clip on screen: isIntersecting alone would already be true for one visible pixel
		const seen = new IntersectionObserver(
			entries => {
				const entry = entries[entries.length - 1]
				const ratio = entry?.isIntersecting ? entry.intersectionRatio : 0
				setInView(ratio >= seenRatio)
				stage.report(id, ratio, middleDistance(element))
			},
			{ threshold: ratioSteps }
		)
		// Two whole clips on a tall screen keep the same ratio while the page scrolls: the scroll tells the stage which one is nearer the middle.
		let frame = 0
		const scrolled = () => {
			if (frame) return
			frame = requestAnimationFrame(() => {
				frame = 0
				const view = viewOf(element)
				if (view) stage.report(id, view.ratio, view.distance)
			})
		}
		window.addEventListener('scroll', scrolled, { passive: true })
		// Half a screen ahead, the file starts loading, so the clip is ready when it shows.
		const ahead = new IntersectionObserver(entries => setNear(entries.some(entry => entry.isIntersecting)), {
			rootMargin: '0px 0px 50% 0px',
		})
		seen.observe(element)
		ahead.observe(element)
		return () => {
			seen.disconnect()
			ahead.disconnect()
			window.removeEventListener('scroll', scrolled)
			cancelAnimationFrame(frame)
			stage.remove(id)
		}
	}, [id])

	const sources = clipSources(name, page.lang)
	// A clip with a French and an English take has both posters in the markup, so the page reads right without JavaScript; CSS shows the one of the page's
	// language (:lang(fr)), and a lazy image that is not displayed is never fetched.
	const posters =
		typeof name === 'string'
			? [{ lang: 'all', src: sources.poster }]
			: [
					{ lang: 'fr', src: clipSources(name, 'fr').poster },
					{ lang: 'en', src: clipSources(name, 'en').poster },
				]
	const play = clipShouldPlay({ ...page, choice, inView, pageVisible, foremost })
	if (!loaded && (play || clipMayPreload({ ...page, near }))) setLoaded(true)

	useEffect(() => {
		const element = video.current
		if (!element) return
		if (play) element.play()?.catch(() => setPlaying(false))
		else element.pause()
	}, [play, sources.video])

	const shown = playing && play
	// The chip follows the frame on screen: the poster's while still, the video's time while it plays (read every frame: timeupdate comes 4 times a second).
	useEffect(() => {
		const element = video.current
		if (!(cut && element && shown)) {
			if (cut) setSide(clipSide(posterAt, cut.at))
			return
		}
		let frame = 0
		const follow = () => {
			setSide(clipSide(element.currentTime, cut.at))
			frame = requestAnimationFrame(follow)
		}
		follow()
		return () => cancelAnimationFrame(frame)
	}, [cut, shown, posterAt])

	return (
		<div
			ref={root}
			className={className ? `mm-clip ${className}` : 'mm-clip'}
			data-state={shown ? 'playing' : 'still'}
			data-side={cut ? side : undefined}
			data-toggle={toggleAt}
		>
			{posters.map(poster => (
				<img
					key={poster.lang}
					className={`mm-clip__poster mm-clip__poster--${poster.lang}`}
					src={poster.src}
					alt={t(alt)}
					data-i18n-attr={`alt:${alt}`}
					width={width}
					height={height}
					loading="lazy"
					decoding="async"
				/>
			))}
			{loaded && (
				<video
					key={sources.video}
					ref={video}
					className="mm-clip__video"
					src={sources.video}
					width={width}
					height={height}
					muted
					playsInline
					loop
					preload="auto"
					autoPlay={play}
					aria-hidden="true"
					tabIndex={-1}
					onLoadedMetadata={event => {
						// Start on the poster's frame; the loop then covers the whole clip.
						if (posterAt > 0 && event.currentTarget.currentTime === 0) event.currentTarget.currentTime = posterAt
					}}
					onPlaying={() => setPlaying(true)}
					onPause={() => setPlaying(false)}
				/>
			)}
			{cut && (
				<span className="mm-clip__chip" aria-hidden="true">
					<span className="mm-clip__side mm-clip__side--before" data-i18n={cut.before}>
						{t(cut.before)}
					</span>
					<span className="mm-clip__side mm-clip__side--after" data-i18n={cut.after}>
						{t(cut.after)}
					</span>
				</span>
			)}
			<button
				className="mm-clip__toggle"
				type="button"
				onClick={() => setChoice(play ? 'pause' : 'play')}
				data-playing={play ? 'true' : 'false'}
			>
				<span className="mm-clip__icon" aria-hidden="true" />
				<span className="mm-clip__label mm-clip__label--play" data-i18n="Play the clip">
					{t('Play the clip')}
				</span>
				<span className="mm-clip__label mm-clip__label--pause" data-i18n="Pause the clip">
					{t('Pause the clip')}
				</span>
			</button>
		</div>
	)
}
