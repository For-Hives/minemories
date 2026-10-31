import { type ReactNode, type RefObject, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useI18n } from '../i18n/I18n'
import type { ViewerQuality, ViewerWeather } from '../viewer-effects'
import type { ViewerScene } from '../viewer-scene'
import { SharePanel } from './SharePanel'
import { ViewerIcon } from './ViewerIcons'
import { ViewerTime } from './ViewerTime'
import './viewer-studio.css'

const IDLE_MS = 4000

function isTyping(event: KeyboardEvent): boolean {
	const field = event.target instanceof HTMLElement && event.target.matches('input, select, textarea')
	return field || event.metaKey || event.ctrlKey || event.altKey
}

export function ViewerStudio({
	sceneRef,
	memoryId,
	ready,
	minutes = 570,
	captureMinutes = null,
	fileInfo = '',
	onRecenter,
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
	/** Extra chrome (the capture film of a world) that rests and hides with the rest of the controls. */
	children?: ReactNode
}) {
	const { t } = useI18n()
	const [weather, setWeather] = useState<ViewerWeather>('clear')
	const [quality, setQuality] = useState<ViewerQuality>('auto')
	const [tour, setTour] = useState(false)
	const [firstPerson, setFirstPerson] = useState(false)
	const [sharing, setSharing] = useState(false)
	const [message, setMessage] = useState('')
	const [settings, setSettings] = useState(false)
	const [immersed, setImmersed] = useState(false)
	const [idle, setIdle] = useState(false)
	const panelOpen = settings || sharing
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
				setImmersed(false)
			} else if (!isTyping(event)) shortcuts[event.key.toLowerCase()]?.()
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
			setMessage(t('Fullscreen is unavailable in this browser.'))
		}
	}
	function postcard() {
		const image = sceneRef.current?.snapshot(1920, 1080)
		if (!image) return
		const link = document.createElement('a')
		link.href = image
		link.download = 'minemories-postcard.jpg'
		link.click()
		setMessage(t('Your postcard is ready.'))
	}
	return (
		<div className={`viewer-studio ${immersed ? 'is-immersed' : ''} ${idle && !panelOpen ? 'is-idle' : ''}`}>
			<div className="cinema-toolbar" role="toolbar" aria-orientation="vertical" aria-label={t('Explore')}>
				<button
					type="button"
					aria-expanded={settings}
					aria-controls="cinema-settings"
					aria-label={t('Atmosphere')}
					onClick={() => setSettings(!settings)}
				>
					<ViewerIcon name="atmosphere" />
					<span>{t('Atmosphere')}</span>
				</button>
				<button
					type="button"
					disabled={!ready}
					aria-pressed={tour}
					aria-label={t('Take a moment')}
					onClick={toggleTour}
				>
					<ViewerIcon name={tour ? 'pause' : 'play'} />
					<span>
						{t('Take a moment')} <kbd>T</kbd>
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
				{memoryId && (
					<button
						type="button"
						disabled={!ready}
						aria-label={t('Share')}
						aria-expanded={sharing}
						onClick={() => setSharing(!sharing)}
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
			{firstPerson && (
				<section className="cinema-navigation" aria-label={t('Explore')}>
					<strong>{t('Step inside the memory')}</strong>
					<p>{t('Drag to look · WASD or arrows · E / Space: up · Q: down · Shift: fast · Alt: precise')}</p>
					<div>
						{(['forward', 'back', 'up', 'down'] as const).map((direction, index) => (
							<button
								key={direction}
								type="button"
								onPointerDown={event => {
									event.currentTarget.setPointerCapture(event.pointerId)
									sceneRef.current?.moveFirstPerson(direction, true)
								}}
								onPointerUp={() => sceneRef.current?.moveFirstPerson(direction, false)}
								onPointerCancel={() => sceneRef.current?.moveFirstPerson(direction, false)}
								onBlur={() => sceneRef.current?.moveFirstPerson(direction, false)}
								onKeyDown={event => {
									if (event.key === ' ' || event.key === 'Enter') {
										event.preventDefault()
										sceneRef.current?.moveFirstPerson(direction, true)
									}
								}}
								onKeyUp={() => sceneRef.current?.moveFirstPerson(direction, false)}
							>
								{[t('Forward'), t('Back'), t('Up'), t('Down')][index]}
							</button>
						))}
					</div>
				</section>
			)}
			{settings && (
				<section id="cinema-settings" className="cinema-settings">
					<div className="cinema-panel-heading">
						<h2 className="cinema-panel-title">{t('Atmosphere')}</h2>
						<button type="button" aria-label={t('Close settings')} onClick={() => setSettings(false)}>
							×
						</button>
					</div>
					<h2>{t('A different light.')}</h2>
					<p>{t('The same story, a new atmosphere.')}</p>
					<fieldset disabled={!ready} className="viewer-weather">
						<legend>{t('The sky')}</legend>
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
					<label className="viewer-quality">
						{t('Rendering quality')}
						<select
							disabled={!ready}
							value={quality}
							onChange={event => {
								const value = event.target.value as ViewerQuality
								setQuality(value)
								sceneRef.current?.setQuality(value)
							}}
						>
							<option value="auto">{t('Auto · balanced')}</option>
							<option value="cinematic">{t('Cinematic · every detail')}</option>
							<option value="eco">{t('Eco · lightweight')}</option>
						</select>
					</label>
					<small>{t('Sky colors follow the memory’s biome when available.')}</small>
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
				<span className="cinema-live-dot" />
				{fileInfo || t('A world to revisit')}
				<span className="cinema-gesture">
					{firstPerson ? t('Drag to look · Keyboard to move') : t('Drag to explore · Scroll to move closer')}
				</span>
			</div>
			<button className="cinema-immerse" type="button" aria-pressed={immersed} onClick={() => setImmersed(!immersed)}>
				<ViewerIcon name={immersed ? 'eye' : 'eyeOff'} />
				<span>{t(immersed ? 'Show controls' : 'Immerse')}</span>
				<kbd>H</kbd>
			</button>
			{sharing && memoryId && (
				<section className="viewer-sharing">
					<div className="cinema-panel-heading">
						<h2>{t('Invite someone back.')}</h2>
						<button type="button" aria-label={t('Close sharing')} onClick={() => setSharing(false)}>
							×
						</button>
					</div>
					<p>{t('Anyone with the link can explore this memory. You can revoke access at any time.')}</p>
					<SharePanel key={memoryId} memoryId={memoryId} />
					<Link className="mm-button" to={`/gallery?publish=${encodeURIComponent(memoryId)}`}>
						{t('Publish in the public gallery')}
					</Link>
				</section>
			)}
			{message && (
				<p className="cinema-toast" role="status">
					{message}
				</p>
			)}
			{children}
		</div>
	)
}
