import { useLocalizedCopy } from '../i18n/useLocalizedCopy'
import { formatClock } from '../viewer-scene'

export function ViewerTime({ minutes, onSelect }: { minutes: number; onSelect: (minutes: number) => void }) {
	const { copy } = useLocalizedCopy()
	const presets = [
		{ label: copy('Aube', 'Dawn'), minutes: 390, icon: '◔' },
		{ label: copy('Matin', 'Morning'), minutes: 570, icon: '☀' },
		{ label: copy('Midi', 'Noon'), minutes: 720, icon: '☼' },
		{ label: copy('Heure dorée', 'Golden hour'), minutes: 1035, icon: '◒' },
		{ label: copy('Nuit', 'Night'), minutes: 0, icon: '☾' },
	]
	return (
		<div className="cinema-time">
			<div className="cinema-clock">
				<span>{copy('LA LUMIÈRE', 'THE LIGHT')}</span>
				<span className="cinema-clock-value">{formatClock(minutes)}</span>
			</div>
			<div className="cinema-time-controls">
				<div className="cinema-time-presets">
					{presets.map(preset => (
						<button
							type="button"
							key={preset.minutes}
							aria-pressed={Math.abs(minutes - preset.minutes) < 20}
							onClick={() => onSelect(preset.minutes)}
						>
							<span aria-hidden="true">{preset.icon}</span>
							{preset.label}
						</button>
					))}
				</div>
				<input
					type="range"
					min="0"
					max="1439"
					step="5"
					value={minutes}
					aria-label={copy('Heure de la journée', 'Time of day')}
					aria-valuetext={formatClock(minutes)}
					onChange={event => onSelect(Number(event.target.value))}
				/>
			</div>
		</div>
	)
}
