import { type RefObject, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'
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
	const { copy } = useLocalizedCopy()
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
			setMessage(
				copy('Le plein écran est indisponible dans ce navigateur.', 'Fullscreen is unavailable in this browser.')
			)
		}
	}
	function postcard() {
		const image = sceneRef.current?.snapshot(1920, 1080)
		if (!image) return
		const link = document.createElement('a')
		link.href = image
		link.download = 'minemories-postcard.jpg'
		link.click()
		setMessage(copy('Votre carte postale est prête.', 'Your postcard is ready.'))
	}
	return (
		<div className={`viewer-studio ${immersed ? 'is-immersed' : ''}`}>
			<div className="cinema-toolbar">
				<button
					type="button"
					aria-expanded={settings}
					aria-controls="cinema-settings"
					aria-label={copy('Ambiance', 'Atmosphere')}
					onClick={() => setSettings(!settings)}
				>
					☷ <span>{copy('Ambiance', 'Atmosphere')}</span>
				</button>
				<button
					type="button"
					disabled={!ready}
					aria-pressed={tour}
					aria-label={copy('Contempler', 'Take a moment')}
					onClick={() => {
						setFirstPerson(false)
						sceneRef.current?.setFirstPerson(false)
						setTour(!tour)
						sceneRef.current?.setTour(!tour)
					}}
				>
					{' '}
					{tour ? 'Ⅱ' : '▷'} <span>{copy('Contempler', 'Take a moment')}</span>
				</button>
				<button
					type="button"
					disabled={!ready}
					aria-label={copy('Recentrer', 'Recenter')}
					onClick={() => {
						setFirstPerson(false)
						sceneRef.current?.setFirstPerson(false)
						sceneRef.current?.resetView()
						setTour(false)
					}}
				>
					◎ <span>{copy('Recentrer', 'Recenter')}</span>
				</button>
				<button
					type="button"
					disabled={!ready}
					aria-pressed={firstPerson}
					aria-label={copy('Première personne', 'First person')}
					onClick={() => {
						setFirstPerson(!firstPerson)
						setTour(false)
						sceneRef.current?.setFirstPerson(!firstPerson)
					}}
				>
					⌖ <span>{copy('Première personne', 'First person')}</span>
				</button>
				<button type="button" disabled={!ready} aria-label={copy('Carte postale', 'Postcard')} onClick={postcard}>
					▧ <span>{copy('Carte postale', 'Postcard')}</span>
				</button>
				{memoryId && (
					<button
						type="button"
						disabled={!ready}
						aria-label={copy('Partager', 'Share')}
						aria-expanded={sharing}
						onClick={() => setSharing(!sharing)}
					>
						↗ <span>{copy('Partager', 'Share')}</span>
					</button>
				)}
				<button type="button" aria-label={copy('Plein écran', 'Fullscreen')} onClick={() => void fullscreen()}>
					⛶ <span>{copy('Plein écran', 'Fullscreen')}</span>
				</button>
			</div>
			{firstPerson && (
				<section className="cinema-navigation" aria-label={copy('Exploration', 'Explore')}>
					<strong>{copy('À hauteur de souvenir', 'Step inside the memory')}</strong>
					<p>
						{copy(
							'Glisser pour regarder · ZQSD / WASD ou flèches · E / Espace : monter · A (AZERTY) / Q (QWERTY) : descendre · Maj : rapide · Alt : précis',
							'Drag to look · WASD or arrows · E / Space: up · Q: down · Shift: fast · Alt: precise'
						)}
					</p>
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
								{copy(['Avancer', 'Reculer', 'Monter', 'Descendre'], ['Forward', 'Back', 'Up', 'Down'])[index]}
							</button>
						))}
					</div>
				</section>
			)}
			{settings && (
				<section id="cinema-settings" className="cinema-settings">
					<div className="cinema-panel-heading">
						<span className="cinema-kicker">{copy('FAÇONNER L’INSTANT', 'SHAPE THE MOMENT')}</span>
						<button
							type="button"
							aria-label={copy('Fermer les réglages', 'Close settings')}
							onClick={() => setSettings(false)}
						>
							×
						</button>
					</div>
					<h2>{copy('Une autre lumière.', 'A different light.')}</h2>
					<p>{copy('La même histoire, une nouvelle atmosphère.', 'The same story, a new atmosphere.')}</p>
					<fieldset disabled={!ready} className="viewer-weather">
						<legend>{copy('Le ciel', 'The sky')}</legend>
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
								{
									copy(
										['Limpide', 'Brume', 'Couvert', 'Pluie', 'Neige'],
										['Clear', 'Mist', 'Overcast', 'Rain', 'Snow']
									)[index]
								}
							</button>
						))}
					</fieldset>
					<label className="viewer-quality">
						{copy('Finesse du rendu', 'Rendering quality')}
						<select
							disabled={!ready}
							value={quality}
							onChange={event => {
								const value = event.target.value as ViewerQuality
								setQuality(value)
								sceneRef.current?.setQuality(value)
							}}
						>
							<option value="auto">{copy('Auto · équilibré', 'Auto · balanced')}</option>
							<option value="cinematic">{copy('Cinéma · tous les détails', 'Cinematic · every detail')}</option>
							<option value="eco">{copy('Économie · léger', 'Eco · lightweight')}</option>
						</select>
					</label>
					<small>
						{copy(
							'Les couleurs du ciel s’accordent au biome du souvenir lorsqu’il est connu.',
							'Sky colors follow the memory’s biome when available.'
						)}
					</small>
				</section>
			)}
			{ready && <ViewerTime minutes={minutes} onSelect={value => sceneRef.current?.setMinutes(value)} />}
			<div className="cinema-caption">
				<span className="cinema-live-dot" />
				{fileInfo || copy('Un monde à retrouver', 'A world to revisit')}
				<span className="cinema-gesture">
					{firstPerson
						? copy('Glisser pour regarder · Clavier pour avancer', 'Drag to look · Keyboard to move')
						: copy('Glisser pour explorer · Molette pour s’approcher', 'Drag to explore · Scroll to move closer')}
				</span>
			</div>
			<button className="cinema-immerse" type="button" aria-pressed={immersed} onClick={() => setImmersed(!immersed)}>
				{immersed ? '◉' : '◌'}{' '}
				{copy(immersed ? 'Afficher les commandes' : 'Immersion', immersed ? 'Show controls' : 'Immerse')}
			</button>
			{sharing && memoryId && (
				<section className="viewer-sharing">
					<div className="cinema-panel-heading">
						<h2>{copy('Inviter à se souvenir.', 'Invite someone back.')}</h2>
						<button
							type="button"
							aria-label={copy('Fermer le partage', 'Close sharing')}
							onClick={() => setSharing(false)}
						>
							×
						</button>
					</div>
					<p>
						{copy(
							'Toute personne avec le lien pourra explorer ce souvenir. Vous pouvez révoquer cet accès à tout moment.',
							'Anyone with the link can explore this memory. You can revoke access at any time.'
						)}
					</p>
					<SharePanel key={memoryId} memoryId={memoryId} />
					<Link className="mm-button" to={`/gallery?publish=${encodeURIComponent(memoryId)}`}>
						{copy('Publier dans la galerie publique', 'Publish in the public gallery')}
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
