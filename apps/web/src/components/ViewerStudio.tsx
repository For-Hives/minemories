import { type RefObject, useEffect, useState } from 'react'
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
					onClick={() => sceneRef.current?.resetView()}
				>
					◎ <span>{copy('Recentrer', 'Recenter')}</span>
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
						{(['clear', 'mist', 'overcast'] as const).map((value, index) => (
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
								{copy(['Limpide', 'Brume', 'Couvert'], ['Clear', 'Mist', 'Overcast'])[index]}
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
					{copy('Glisser pour explorer · Molette pour s’approcher', 'Drag to explore · Scroll to move closer')}
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
