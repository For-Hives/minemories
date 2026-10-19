import { type RefObject, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useI18n } from '../i18n/I18n'
import type { ViewerQuality, ViewerWeather } from '../viewer-effects'
import type { ViewerScene } from '../viewer-scene'
import { SharePanel } from './SharePanel'
import { ViewerTime } from './ViewerTime'
import './viewer-studio.css'

export function ViewerStudio({
	sceneRef,
	memoryId,
	ready,
	minutes = 570,
	fileInfo = '',
}: {
	sceneRef: RefObject<ViewerScene | null>
	memoryId?: string | null
	ready: boolean
	minutes?: number
	fileInfo?: string
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
	useEffect(() => {
		function dismissOverlays(event: KeyboardEvent) {
			if (event.key !== 'Escape') return
			setSettings(false)
			setSharing(false)
			setImmersed(false)
		}
		window.addEventListener('keydown', dismissOverlays)
		return () => window.removeEventListener('keydown', dismissOverlays)
	}, [])
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
		<div className={`viewer-studio ${immersed ? 'is-immersed' : ''}`}>
			<div className="cinema-toolbar">
				<button
					type="button"
					aria-expanded={settings}
					aria-controls="cinema-settings"
					aria-label={t('Atmosphere')}
					onClick={() => setSettings(!settings)}
				>
					☷ <span>{t('Atmosphere')}</span>
				</button>
				<button
					type="button"
					disabled={!ready}
					aria-pressed={tour}
					aria-label={t('Take a moment')}
					onClick={() => {
						setFirstPerson(false)
						sceneRef.current?.setFirstPerson(false)
						setTour(!tour)
						sceneRef.current?.setTour(!tour)
					}}
				>
					{' '}
					{tour ? 'Ⅱ' : '▷'} <span>{t('Take a moment')}</span>
				</button>
				<button
					type="button"
					disabled={!ready}
					aria-label={t('Recenter')}
					onClick={() => {
						setFirstPerson(false)
						sceneRef.current?.setFirstPerson(false)
						sceneRef.current?.resetView()
						setTour(false)
					}}
				>
					◎ <span>{t('Recenter')}</span>
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
					⌖ <span>{t('First person')}</span>
				</button>
				<button type="button" disabled={!ready} aria-label={t('Postcard')} onClick={postcard}>
					▧ <span>{t('Postcard')}</span>
				</button>
				{memoryId && (
					<button
						type="button"
						disabled={!ready}
						aria-label={t('Share')}
						aria-expanded={sharing}
						onClick={() => setSharing(!sharing)}
					>
						↗ <span>{t('Share')}</span>
					</button>
				)}
				<button type="button" aria-label={t('Fullscreen')} onClick={() => void fullscreen()}>
					⛶ <span>{t('Fullscreen')}</span>
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
						<span className="cinema-kicker">{t('SHAPE THE MOMENT')}</span>
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
			{ready && <ViewerTime minutes={minutes} onSelect={value => sceneRef.current?.setMinutes(value)} />}
			<div className="cinema-caption">
				<span className="cinema-live-dot" />
				{fileInfo || t('A world to revisit')}
				<span className="cinema-gesture">
					{firstPerson ? t('Drag to look · Keyboard to move') : t('Drag to explore · Scroll to move closer')}
				</span>
			</div>
			<button className="cinema-immerse" type="button" aria-pressed={immersed} onClick={() => setImmersed(!immersed)}>
				{immersed ? '◉' : '◌'} {t(immersed ? 'Show controls' : 'Immerse')}
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
		</div>
	)
}
