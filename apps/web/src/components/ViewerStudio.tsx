import { type ReactNode, type RefObject, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useI18n } from '../i18n/I18n'
import { type ViewLink, withViewLink } from '../lib/view-link'
import {
	browserStorage,
	readViewerLighting,
	storeViewerLighting,
	type ViewerLighting,
	viewerLightings,
} from '../lib/viewer-lighting'
import type { ViewerQuality, ViewerWeather } from '../viewer-effects'
import type { ViewerScene } from '../viewer-scene'
import { FlightLayer, useFlight } from './FlightControls'
import { SharePanel } from './SharePanel'
import { SiteSelect } from './SiteSelect'
import { buttonLime } from './ui'
import { ViewerCover } from './ViewerCover'
import { ViewerIcon } from './ViewerIcons'
import { ViewerLayers } from './ViewerLayers'
import { ViewerTime } from './ViewerTime'
import './viewer-studio.css'

const IDLE_MS = 4000
/** How long a notification stays before it leaves on its own. */
export const TOAST_MS = 5000

function isTyping(event: KeyboardEvent): boolean {
	// A control that takes its own keys (the dropdowns' lists) keeps them: 'r' there jumps to a choice, it does not recenter.
	const field =
		event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [data-own-keys]') !== null
	return field || event.metaKey || event.ctrlKey || event.altKey
}

function startingWeather(view: ViewLink | undefined): ViewerWeather {
	return view?.weather ?? 'clear'
}

function startingLighting(view: ViewLink | undefined): ViewerLighting {
	return view?.lighting ?? readViewerLighting(browserStorage())
}

/** The owner's way to pick their server's picture: only in the viewer, from the view on screen. */
function CoverButton({
	owner,
	ready,
	open,
	onToggle,
}: {
	owner: string | null | undefined
	ready: boolean
	open: boolean
	onToggle(): void
}) {
	const { t } = useI18n()
	if (!owner) return null
	return (
		<button type="button" disabled={!ready} aria-label={t('Cover')} aria-expanded={open} onClick={onToggle}>
			<ViewerIcon name="picture" />
			<span>{t('Cover')}</span>
		</button>
	)
}

function CoverPanel({
	open,
	memoryId,
	sceneRef,
	onClose,
	onSaved,
}: {
	open: boolean
	memoryId: string | null | undefined
	sceneRef: RefObject<ViewerScene | null>
	onClose(): void
	onSaved(): void
}) {
	if (!(open && memoryId)) return null
	return <ViewerCover key={memoryId} sceneRef={sceneRef} memoryId={memoryId} onClose={onClose} onSaved={onSaved} />
}

/** A visitor's Share (no memory of their own here): copies this page's address with the current view. */
function CopyViewButton({
	shown,
	owner,
	ready,
	onCopy,
}: {
	shown: boolean | undefined
	owner: string | null | undefined
	ready: boolean
	onCopy(): void
}) {
	const { t } = useI18n()
	if (!shown || owner) return null
	return (
		<button type="button" disabled={!ready} aria-label={t('Copy a link to this view')} onClick={onCopy}>
			<ViewerIcon name="share" />
			<span>{t('Copy a link to this view')}</span>
		</button>
	)
}

/** A link's weather, once the scene can show it (the buttons set it directly afterwards). */
function useLinkWeather(sceneRef: RefObject<ViewerScene | null>, ready: boolean, view: ViewLink | undefined): void {
	const weather = view?.weather
	useEffect(() => {
		if (ready && weather) sceneRef.current?.setWeather(weather)
	}, [ready, weather, sceneRef])
}

/** Copies this page's address with `view`, reporting the outcome. */
async function copyViewLink(
	view: ViewLink,
	snapshot: string | null | undefined,
	report: (message: string) => void
): Promise<void> {
	if (snapshot) view.snapshot = snapshot
	try {
		await navigator.clipboard.writeText(withViewLink(window.location.href, view))
		report('Link to this view copied.')
	} catch {
		report('Could not copy this link.')
	}
}

/** Everything a share link needs to reopen this exact view. */
function studioView(scene: ViewerScene | null, view: ViewLink): ViewLink {
	const place = scene?.currentView()
	if (place) {
		view.camera = place.camera
		view.target = place.target
	}
	const hidden = scene?.categories().filter(category => !scene.isCategoryVisible(category)) ?? []
	if (hidden.length) view.hidden = hidden
	return view
}

/** The studio's state classes: immersed, idle, flying with touch controls. */
function studioClass(state: { immersed: boolean; idle: boolean; touchFlying: boolean }): string {
	const names = ['viewer-studio']
	if (state.immersed) names.push('is-immersed')
	if (state.idle) names.push('is-idle')
	if (state.touchFlying) names.push('is-touch-flying')
	return names.join(' ')
}

/** The gesture hint has done its job once the visitor has pressed on the 3D view. */
function useFirstDrag(): boolean {
	const [dragged, setDragged] = useState(false)
	useEffect(() => {
		if (dragged) return
		const press = (event: PointerEvent) => {
			if (event.target instanceof HTMLCanvasElement) setDragged(true)
		}
		window.addEventListener('pointerdown', press, { passive: true })
		return () => window.removeEventListener('pointerdown', press)
	}, [dragged])
	return dragged
}

export function ViewerStudio({
	sceneRef,
	memoryId,
	ready,
	minutes = 570,
	captureMinutes = null,
	fileInfo = '',
	onRecenter,
	initialView,
	viewLink,
	snapshot,
	children,
}: {
	sceneRef: RefObject<ViewerScene | null>
	memoryId?: string | null
	ready: boolean
	minutes?: number
	captureMinutes?: number | null
	fileInfo?: string
	/** A page that frames its own content (a composed world) supplies how to recenter. */
	onRecenter?: () => void
	/** A view opened from a link: its weather and lighting start the studio (the page applies the rest). */
	initialView?: ViewLink
	/** A visitor's page (no `memoryId`): Share copies this page's address with the current view. */
	viewLink?: boolean
	/** The snapshot shown on a world link, carried in the view. */
	snapshot?: string | null
	/** Extra chrome (the capture film of a world) that rests and hides with the rest of the controls. */
	children?: ReactNode
}) {
	const { t } = useI18n()
	const [weather, setWeather] = useState<ViewerWeather>(() => startingWeather(initialView))
	const [quality, setQuality] = useState<ViewerQuality>('auto')
	// A link's lighting applies to this visit only; the remembered choice is not overwritten.
	const [lighting, setLighting] = useState<ViewerLighting>(() => startingLighting(initialView))
	const [tour, setTour] = useState(false)
	const [firstPerson, setFirstPerson] = useState(false)
	const flight = useFlight(sceneRef, ready)
	const [sharing, setSharing] = useState(false)
	const [covering, setCovering] = useState(false)
	const [toast, setToast] = useState({ text: '', id: 0 })
	const [settings, setSettings] = useState(false)
	const [immersed, setImmersed] = useState(false)
	const [idle, setIdle] = useState(false)
	const dragged = useFirstDrag()
	const panelOpen = settings || sharing || covering || flight.open
	// Each notice gets its own id, so a second postcard restarts the countdown.
	const notify = (text: string) => setToast(current => ({ text, id: current.id + 1 }))
	const dismiss = () => setToast(current => ({ ...current, text: '' }))
	useEffect(() => {
		if (!toast.text) return
		const timer = window.setTimeout(dismiss, TOAST_MS)
		return () => window.clearTimeout(timer)
	}, [toast])
	// A remembered choice applies to every capture this viewer opens.
	useEffect(() => {
		if (ready) sceneRef.current?.setLighting(lighting)
	}, [ready, lighting, sceneRef])
	useLinkWeather(sceneRef, ready, initialView)
	const currentView = () => studioView(sceneRef.current, { minutes, weather, lighting })
	const copyView = () => copyViewLink(currentView(), snapshot, text => notify(t(text)))
	useEffect(() => {
		if (panelOpen) return
		let timer = window.setTimeout(() => setIdle(true), IDLE_MS)
		function wake() {
			setIdle(false)
			window.clearTimeout(timer)
			timer = window.setTimeout(() => setIdle(true), IDLE_MS)
		}
		const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const
		for (const name of events) window.addEventListener(name, wake, { passive: true })
		return () => {
			window.clearTimeout(timer)
			for (const name of events) window.removeEventListener(name, wake)
		}
	}, [panelOpen])
	const toggleTour = () => {
		setFirstPerson(false)
		sceneRef.current?.setFirstPerson(false)
		setTour(!tour)
		sceneRef.current?.setTour(!tour)
	}
	const recenter = () => {
		setFirstPerson(false)
		sceneRef.current?.setFirstPerson(false)
		if (onRecenter) onRecenter()
		else sceneRef.current?.resetView()
		setTour(false)
	}
	useEffect(() => {
		const shortcuts: Record<string, (() => void) | undefined> = {
			h: () => setImmersed(value => !value),
			f: () => void fullscreen(),
			r: ready ? recenter : undefined,
			t: ready ? toggleTour : undefined,
		}
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				setSettings(false)
				setSharing(false)
				setCovering(false)
				flight.setOpen(false)
				setImmersed(false)
			} else if (!(isTyping(event) || (firstPerson && flight.flies(event.code))))
				// A key that flies while flying never also toggles the tour or recentres.
				shortcuts[event.key.toLowerCase()]?.()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	})
	async function fullscreen() {
		try {
			const element = document.querySelector('.viewer-page')
			if (document.fullscreenElement) await document.exitFullscreen()
			else await element?.requestFullscreen()
		} catch {
			notify(t('Fullscreen is unavailable in this browser.'))
		}
	}
	function postcard() {
		const image = sceneRef.current?.snapshot(1920, 1080)
		if (!image) return
		const link = document.createElement('a')
		link.href = image
		link.download = 'minemories-postcard.jpg'
		link.click()
		notify(t('Your postcard is ready.'))
	}
	return (
		<>
			<div className={studioClass({ immersed, idle: idle && !panelOpen, touchFlying: firstPerson && flight.touch })}>
				<div className="cinema-toolbar" role="toolbar" aria-orientation="vertical" aria-label={t('Explore')}>
					<button
						type="button"
						aria-expanded={settings}
						aria-controls="cinema-settings"
						aria-label={t('Atmosphere')}
						onClick={() => {
							setSharing(false)
							setCovering(false)
							setSettings(!settings)
						}}
					>
						<ViewerIcon name="atmosphere" />
						<span>{t('Atmosphere')}</span>
					</button>
					<button
						type="button"
						disabled={!ready}
						aria-pressed={tour}
						aria-label={t('Auto-rotate')}
						onClick={toggleTour}
					>
						<ViewerIcon name={tour ? 'pause' : 'play'} />
						<span>
							{t('Auto-rotate')} <kbd>T</kbd>
						</span>
					</button>
					<button type="button" disabled={!ready} aria-label={t('Recenter')} onClick={recenter}>
						<ViewerIcon name="recenter" />
						<span>
							{t('Recenter')} <kbd>R</kbd>
						</span>
					</button>
					<button
						type="button"
						disabled={!ready}
						aria-pressed={firstPerson}
						aria-label={t('First person')}
						onClick={() => {
							setFirstPerson(!firstPerson)
							setTour(false)
							sceneRef.current?.setFirstPerson(!firstPerson)
						}}
					>
						<ViewerIcon name="person" />
						<span>{t('First person')}</span>
					</button>
					<hr />
					<button type="button" disabled={!ready} aria-label={t('Postcard')} onClick={postcard}>
						<ViewerIcon name="camera" />
						<span>{t('Postcard')}</span>
					</button>
					<CoverButton
						owner={memoryId}
						ready={ready}
						open={covering}
						onToggle={() => {
							setSettings(false)
							setSharing(false)
							setCovering(!covering)
						}}
					/>
					<CopyViewButton shown={viewLink} owner={memoryId} ready={ready} onCopy={() => void copyView()} />
					{memoryId && (
						<button
							type="button"
							disabled={!ready}
							aria-label={t('Share')}
							aria-expanded={sharing}
							onClick={() => {
								setSettings(false)
								setCovering(false)
								setSharing(!sharing)
							}}
						>
							<ViewerIcon name="share" />
							<span>{t('Share')}</span>
						</button>
					)}
					<button type="button" aria-label={t('Fullscreen')} onClick={() => void fullscreen()}>
						<ViewerIcon name="expand" />
						<span>
							{t('Fullscreen')} <kbd>F</kbd>
						</span>
					</button>
				</div>
				<FlightLayer
					flight={flight}
					flying={firstPerson}
					sceneRef={sceneRef}
					onOpen={() => {
						setSettings(false)
						setSharing(false)
						setCovering(false)
					}}
				/>
				{settings && (
					<section id="cinema-settings" className="cinema-settings">
						<div className="cinema-panel-heading">
							<h2 className="cinema-panel-title">{t('Atmosphere')}</h2>
							<button type="button" aria-label={t('Close settings')} onClick={() => setSettings(false)}>
								×
							</button>
						</div>
						<fieldset disabled={!ready} className="viewer-weather">
							<legend>{t('Sky')}</legend>
							{(['clear', 'mist', 'overcast', 'rain', 'snow'] as const).map((value, index) => (
								<button
									type="button"
									key={value}
									aria-pressed={weather === value}
									onClick={() => {
										setWeather(value)
										sceneRef.current?.setWeather(value)
									}}
								>
									<span className={`cinema-weather-swatch ${value}`} aria-hidden="true" />
									{[t('Clear'), t('Mist'), t('Overcast'), t('Rain'), t('Snow')][index]}
								</button>
							))}
						</fieldset>
						<fieldset disabled={!ready} className="viewer-weather viewer-lighting">
							<legend>{t('Lighting')}</legend>
							{viewerLightings.map(value => (
								<button
									type="button"
									key={value}
									aria-pressed={lighting === value}
									onClick={() => {
										setLighting(value)
										storeViewerLighting(browserStorage(), value)
									}}
								>
									{value === 'faithful' ? t('Faithful to the game') : t('Realistic')}
								</button>
							))}
						</fieldset>
						<SiteSelect
							className="viewer-quality"
							label={t('Quality')}
							disabled={!ready}
							value={quality}
							options={[
								{ value: 'auto' as const, label: t('Auto') },
								{ value: 'cinematic' as const, label: t('High') },
								{ value: 'eco' as const, label: t('Low') },
							]}
							onChange={value => {
								setQuality(value)
								sceneRef.current?.setQuality(value)
							}}
						/>
						<ViewerLayers sceneRef={sceneRef} ready={ready} />
					</section>
				)}
				{ready && (
					<ViewerTime
						minutes={minutes}
						captureMinutes={captureMinutes}
						onSelect={value => sceneRef.current?.setMinutes(value)}
					/>
				)}
				<div className="cinema-caption">
					{fileInfo}
					{!dragged && (
						<span className="cinema-gesture">
							{firstPerson ? t('Drag to look · Keys to move') : t('Drag to look around · Scroll to zoom')}
						</span>
					)}
				</div>
				<button className="cinema-immerse" type="button" aria-pressed={immersed} onClick={() => setImmersed(!immersed)}>
					<ViewerIcon name={immersed ? 'eye' : 'eyeOff'} />
					<span>{t(immersed ? 'Show controls' : 'Hide controls')}</span>
					<kbd>H</kbd>
				</button>
				<CoverPanel
					open={covering}
					memoryId={memoryId}
					sceneRef={sceneRef}
					onClose={() => setCovering(false)}
					onSaved={() => {
						setCovering(false)
						notify(t('Cover saved.'))
					}}
				/>
				{sharing && memoryId && (
					<section className="viewer-sharing">
						<div className="cinema-panel-heading">
							<h2>{t('Share')}</h2>
							<button type="button" aria-label={t('Close sharing')} onClick={() => setSharing(false)}>
								×
							</button>
						</div>
						<SharePanel key={memoryId} memoryId={memoryId} view={currentView} />
						<Link className={buttonLime} to={`/gallery?publish=${encodeURIComponent(memoryId)}`}>
							{t('Make public')}
						</Link>
					</section>
				)}
				{children}
			</div>
			{/* Beside the studio, not in it: the page header (a shared scene's welcome line) sits above the studio layer. */}
			{toast.text && (
				<div key={toast.id} className="cinema-toast" role="status">
					<p>{toast.text}</p>
					<button type="button" aria-label={t('Close')} onClick={dismiss}>
						×
					</button>
				</div>
			)}
		</>
	)
}
