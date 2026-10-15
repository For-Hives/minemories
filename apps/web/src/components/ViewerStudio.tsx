import { type RefObject, useState } from 'react'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'
import type { ViewerQuality, ViewerWeather } from '../viewer-effects'
import type { ViewerScene } from '../viewer-scene'
import { SharePanel } from './SharePanel'
import './viewer-studio.css'

export function ViewerStudio({
	sceneRef,
	memoryId,
	ready,
}: {
	sceneRef: RefObject<ViewerScene | null>
	memoryId?: string | null
	ready: boolean
}) {
	const { copy } = useLocalizedCopy()
	const [weather, setWeather] = useState<ViewerWeather>('clear')
	const [quality, setQuality] = useState<ViewerQuality>('auto')
	const [tour, setTour] = useState(false)
	const [sharing, setSharing] = useState(false)
	const [message, setMessage] = useState('')
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
		<div className="viewer-studio">
			<div className="viewer-studio-heading">
				<span>✦ {copy('LE TEMPS S’ARRÊTE ICI', 'TIME STANDS STILL HERE')}</span>
				<span>{copy('Un endroit. Mille ambiances.', 'One place. A thousand moods.')}</span>
			</div>
			<div className="viewer-studio-tools">
				<fieldset disabled={!ready} className="viewer-weather">
					<legend>{copy('Atmosphère', 'Atmosphere')}</legend>
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
							{['☀', '≋', '☁'][index]} {copy(['Limpide', 'Brume', 'Couvert'], ['Clear', 'Mist', 'Overcast'])[index]}
						</button>
					))}
				</fieldset>
				<label className="viewer-quality">
					{copy('Qualité', 'Quality')}
					<select
						value={quality}
						onChange={event => {
							const value = event.target.value as ViewerQuality
							setQuality(value)
							sceneRef.current?.setQuality(value)
						}}
					>
						<option value="auto">{copy('Auto · adaptative', 'Auto · adaptive')}</option>
						<option value="cinematic">{copy('Cinéma', 'Cinematic')}</option>
						<option value="eco">{copy('Économie', 'Eco')}</option>
					</select>
				</label>
				<div className="viewer-actions">
					<button
						type="button"
						disabled={!ready}
						aria-pressed={tour}
						onClick={() => {
							setTour(!tour)
							sceneRef.current?.setTour(!tour)
						}}
					>
						{tour ? 'Ⅱ' : '▷'} {copy('Contempler', 'Take a moment')}
					</button>
					<button type="button" disabled={!ready} onClick={postcard}>
						▧ {copy('Carte postale', 'Postcard')}
					</button>
					<button type="button" onClick={() => void fullscreen()}>
						⛶ {copy('Plein écran', 'Fullscreen')}
					</button>
					{memoryId && (
						<button type="button" disabled={!ready} aria-expanded={sharing} onClick={() => setSharing(!sharing)}>
							↗ {copy('Partager', 'Share')}
						</button>
					)}
				</div>
			</div>
			{sharing && memoryId && (
				<div className="viewer-sharing">
					<p>
						{copy(
							'Toute personne avec le lien pourra explorer ce souvenir. Vous pouvez révoquer cet accès à tout moment.',
							'Anyone with the link can explore this memory. You can revoke access at any time.'
						)}
					</p>
					<SharePanel key={memoryId} memoryId={memoryId} />
				</div>
			)}
			{message && <p role="status">{message}</p>}
		</div>
	)
}
