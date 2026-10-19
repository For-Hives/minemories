import { useI18n } from '../i18n/I18n'
import { formatClock } from '../viewer-scene'

export function ViewerTime({ minutes, onSelect }: { minutes: number; onSelect: (minutes: number) => void }) {
	const { t } = useI18n()
	const presets = [
		{ label: t('Dawn'), minutes: 390, icon: '◔' },
		{ label: t('Morning'), minutes: 570, icon: '☀' },
		{ label: t('Noon'), minutes: 720, icon: '☼' },
		{ label: t('Golden hour'), minutes: 1035, icon: '◒' },
		{ label: t('Night'), minutes: 0, icon: '☾' },
	]
	return (
		<div className="cinema-time">
			<div className="cinema-clock">
				<span>{t('THE LIGHT')}</span>
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
					aria-label={t('Time of day')}
					aria-valuetext={formatClock(minutes)}
					onChange={event => onSelect(Number(event.target.value))}
				/>
			</div>
		</div>
	)
}
