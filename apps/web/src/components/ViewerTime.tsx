import { useI18n } from '../i18n/I18n'
import { formatClock } from '../viewer-scene'
import { ViewerIcon } from './ViewerIcons'

const PRESETS = [
	{ label: 'Dawn', minutes: 390 },
	{ label: 'Morning', minutes: 570 },
	{ label: 'Noon', minutes: 720 },
	{ label: 'Golden hour', minutes: 1035 },
	{ label: 'Night', minutes: 0 },
]

export function ViewerTime({
	minutes,
	captureMinutes = null,
	onSelect,
}: {
	minutes: number
	captureMinutes?: number | null
	onSelect: (minutes: number) => void
}) {
	const { t } = useI18n()
	const atCapture = captureMinutes !== null && minutes === captureMinutes
	return (
		<div className="cinema-time">
			<span className="cinema-clock-value">{formatClock(minutes)}</span>
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
			<div className="cinema-time-presets">
				{PRESETS.map(preset => (
					<button
						type="button"
						key={preset.minutes}
						title={t(preset.label)}
						aria-label={t(preset.label)}
						aria-pressed={Math.abs(minutes - preset.minutes) < 20}
						onClick={() => onSelect(preset.minutes)}
					/>
				))}
				{captureMinutes !== null && (
					<button
						type="button"
						className="cinema-time-capture"
						aria-label={t('Capture time')}
						title={`${t('Capture time')} · ${formatClock(captureMinutes)}`}
						aria-pressed={atCapture}
						onClick={() => onSelect(captureMinutes)}
					>
						<ViewerIcon name="camera" />
					</button>
				)}
			</div>
		</div>
	)
}
