import { areaPath, HEATMAP_DAYS, HEATMAP_SLOTS, type Heatmap, linePath } from '../../lib/admin-insight'

export type SeriesPoint = { at: number; signups: number; uploads: number; uploadedBytes: number }
type Labels = { captures: string; signups: string; volume: string; previous: string }

const WIDTH = 760
const PANELS: ReadonlyArray<{
	key: 'uploads' | 'signups' | 'uploadedBytes'
	height: number
	kind: 'area' | 'bars'
	tone: string
}> = [
	{ key: 'uploads', height: 96, kind: 'area', tone: 'var(--ember)' },
	{ key: 'signups', height: 64, kind: 'bars', tone: 'var(--c-name)' },
	{ key: 'uploadedBytes', height: 76, kind: 'area', tone: 'var(--c-green)' },
]
const formatDay = (at: number, locale: string, hourly: boolean) =>
	new Intl.DateTimeFormat(locale, {
		timeZone: 'UTC',
		month: 'short',
		day: 'numeric',
		...(hourly ? { hour: '2-digit' } : {}),
	}).format(at)

/** Captures, sign-ups and volume on one time axis, one panel each, so a peak lines up across the three. The previous period is a dashed line on the captures panel. */
export function AlignedSeries({
	points,
	previous,
	hourly,
	locale,
	labels,
	format,
}: {
	points: readonly SeriesPoint[]
	previous: readonly number[] | null
	hourly: boolean
	locale: string
	labels: Labels
	format: (key: 'uploads' | 'signups' | 'uploadedBytes', value: number) => string
}) {
	const names = { uploads: labels.captures, signups: labels.signups, uploadedBytes: labels.volume }
	const step = points.length > 1 ? WIDTH / (points.length - 1) : WIDTH
	return (
		<div>
			{PANELS.map(panel => {
				const values = points.map(point => point[panel.key])
				const max = Math.max(1, ...values, ...(panel.key === 'uploads' && previous ? previous : []))
				return (
					<figure key={panel.key} style={{ margin: 0 }}>
						<figcaption className="mm-con-hint" style={{ margin: '0 0 2px' }}>
							{names[panel.key]} · {format(panel.key, max)}
						</figcaption>
						<svg
							viewBox={`0 0 ${WIDTH} ${panel.height}`}
							preserveAspectRatio="none"
							width="100%"
							height={panel.height}
							role="img"
							aria-label={names[panel.key]}
						>
							{panel.kind === 'area' ? (
								<>
									<path d={areaPath(values, WIDTH, panel.height, max)} fill={panel.tone} fillOpacity="0.2" />
									<path
										d={linePath(values, WIDTH, panel.height, max)}
										fill="none"
										stroke={panel.tone}
										strokeWidth="2.5"
										vectorEffect="non-scaling-stroke"
									/>
								</>
							) : (
								values.map((value, index) => (
									<rect
										key={points[index]?.at}
										x={index * step - Math.min(8, step * 0.35)}
										width={Math.min(16, step * 0.7)}
										y={panel.height - (value / max) * (panel.height - 4)}
										height={(value / max) * (panel.height - 4)}
										fill={panel.tone}
									/>
								))
							)}
							{panel.key === 'uploads' && previous && previous.length > 1 && (
								<path
									d={linePath(previous, WIDTH, panel.height, max)}
									fill="none"
									stroke="var(--text-2)"
									strokeWidth="1.5"
									strokeDasharray="4 4"
									vectorEffect="non-scaling-stroke"
								/>
							)}
							{points.map((point, index) => (
								<rect key={point.at} x={index * step - step / 2} width={step} height={panel.height} fill="transparent">
									<title>
										{formatDay(point.at, locale, hourly)} · {format(panel.key, point[panel.key])}
									</title>
								</rect>
							))}
						</svg>
					</figure>
				)
			})}
			<div className="mm-con-row" style={{ gridTemplateColumns: '1fr auto' }}>
				<span>{points[0] ? formatDay(points[0].at, locale, hourly) : ''}</span>
				<span>{points.at(-1) ? formatDay((points.at(-1) as SeriesPoint).at, locale, hourly) : ''}</span>
			</div>
			{previous && <p className="mm-con-hint">- - {labels.previous}</p>}
		</div>
	)
}

/** Seven weekday rows (Monday first) of twelve 2-hour slots, UTC; the tint is the share of the busiest slot. */
export function HeatmapGrid({ map, locale }: { map: Heatmap; locale: string }) {
	const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
	const rows = map.levels.map((levels, index) => ({
		index,
		day: HEATMAP_DAYS[index],
		cells: levels.map((level, slot) => ({ id: `${HEATMAP_DAYS[index]}-${slot}`, level })),
	}))
	const hours = Array.from({ length: HEATMAP_SLOTS }, (_, slot) => ({
		id: `h${slot * 2}`,
		label: slot % 2 === 0 ? slot * 2 : '',
	}))
	return (
		<div className="mm-con-heat" role="img" aria-label={`${map.total}`}>
			<span />
			{hours.map(hour => (
				<span key={hour.id} aria-hidden="true">
					{hour.label}
				</span>
			))}
			{rows.flatMap(row => [
				<span key={`d${row.day}`}>{weekday.format(Date.UTC(2024, 0, 1 + row.index))}</span>,
				...row.cells.map(cell => (
					<i key={cell.id} data-level={cell.level} style={{ ['--level' as string]: cell.level }} />
				)),
			])}
		</div>
	)
}
