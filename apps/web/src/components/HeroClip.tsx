import { useEffect, useRef, useState } from 'react'
import { translate } from '../i18n/catalog'
import { type ClipEnvironment, type ClipName, clipMode, clipShouldPlay, clipSources } from '../lib/hero-clips'

/**
 * One short silent clip of the landing (public/hero/clips, sources in docs/features/landing-film.md): real footage, looping, never loaded before it is needed.
 * - Nothing is fetched while the film runs: the poster is a lazy <img>, and the <video> gets its file only the first time it should play.
 * - It plays only on screen, in a visible tab and after the film (html[data-phase]); it pauses as soon as one of those stops being true.
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

/** The page signals a clip follows: its language, the film's phase and the motion settings. */
function readPage() {
	const root = document.documentElement
	return { lang: root.lang, phase: root.dataset.phase, mode: clipMode(readEnvironment()) }
}

/** How much of a clip must be on screen for it to play. */
const seenRatio = 0.35

export interface HeroClipProps {
	/** File name in public/hero/clips, without extension; `{ fr, en }` for a clip with in-game text. */
	readonly name: ClipName
	readonly width: number
	readonly height: number
	/** English key of the text alternative (the poster's alt). */
	readonly alt: string
	readonly className?: string
}

export function HeroClip({ name, width, height, alt, className }: HeroClipProps) {
	const video = useRef<HTMLVideoElement>(null)
	const root = useRef<HTMLDivElement>(null)
	// The prerender and the first client render are still: the page's real state arrives with the first effect.
	const [page, setPage] = useState<ReturnType<typeof readPage>>({
		lang: 'fr',
		phase: 'film',
		mode: 'poster',
	})
	const [inView, setInView] = useState(false)
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
			attributeFilter: ['lang', 'data-phase', 'data-mc-motion'],
		})
		const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
		query?.addEventListener?.('change', update)
		const visibility = () => setPageVisible(document.visibilityState !== 'hidden')
		visibility()
		document.addEventListener('visibilitychange', visibility)
		return () => {
			observer.disconnect()
			query?.removeEventListener?.('change', update)
			document.removeEventListener('visibilitychange', visibility)
		}
	}, [])

	useEffect(() => {
		const element = root.current
		if (!(element && 'IntersectionObserver' in window)) return
		// "seen" is a third of the clip on screen: isIntersecting alone would already be true for one visible pixel
		const seen = new IntersectionObserver(
			entries => setInView(entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= seenRatio)),
			{ threshold: [0, seenRatio] }
		)
		seen.observe(element)
		return () => seen.disconnect()
	}, [])

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
	const play = clipShouldPlay({ mode: page.mode, choice, inView, pageVisible, phase: page.phase })
	if (play && !loaded) setLoaded(true)

	useEffect(() => {
		const element = video.current
		if (!element) return
		if (play) element.play()?.catch(() => setPlaying(false))
		else element.pause()
	}, [play, sources.video])

	const stopped = !play
	return (
		<div
			ref={root}
			className={className ? `mm-clip ${className}` : 'mm-clip'}
			data-state={playing && !stopped ? 'playing' : 'still'}
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
					preload="none"
					autoPlay={play}
					aria-hidden="true"
					tabIndex={-1}
					onPlaying={() => setPlaying(true)}
					onPause={() => setPlaying(false)}
				/>
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
