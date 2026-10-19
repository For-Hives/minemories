import type { AdminSummary } from '@minemories/api-contract'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'

export function hourLabel(at: number, locale: string): string {
	return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit' }).format(
		at
	)
}
export function gigabytes(bytes: number, locale: string): string {
	return (bytes / 1000000000).toLocaleString(locale, { maximumFractionDigits: 2 })
}
function Bars({
	series,
	field,
	label,
}: {
	series: AdminSummary['series']
	field: 'uploadedBytes' | 'signups'
	label: string
}) {
	const { locale, copy } = useLocalizedCopy(),
		maximum = Math.max(1, ...series.map(row => row[field])),
		width = 960,
		height = 180
	return (
		<svg viewBox={`0 0 ${width} ${height + 20}`} role="img" aria-label={label} className="mm-admin-chart">
			<desc>
				{copy(
					'Valeurs horaires en UTC ; les zones grises précèdent le début du suivi.',
					'Hourly UTC values; grey areas predate tracking.'
				)}{' '}
				{copy('Maximum', 'Maximum')}: {field === 'uploadedBytes' ? gigabytes(maximum, locale) : maximum}
			</desc>
			{[0, 0.25, 0.5, 0.75, 1].map(part => (
				<line key={part} x1={0} x2={width} y1={part * height} y2={part * height} stroke="#354238" />
			))}
			{series.map((row, i) => {
				const barHeight = (row[field] / maximum) * height
				return (
					<g key={row.at}>
						<title>
							{hourLabel(row.at, locale)} UTC ·{' '}
							{field === 'uploadedBytes' ? `${gigabytes(row[field], locale)} ${copy('Go', 'GB')}` : row[field]}
						</title>
						{row.coverage === 'none' ? (
							<rect
								x={(i * width) / series.length}
								y={0}
								width={width / series.length}
								height={height}
								fill="#354238"
								opacity="0.45"
							/>
						) : (
							<rect
								x={(i * width) / series.length}
								y={height - barHeight}
								width={Math.max(0.7, (width / series.length) * 0.7)}
								height={barHeight}
								fill={field === 'uploadedBytes' ? '#d9f36c' : '#78c3ac'}
								opacity={row.coverage === 'partial' ? 0.55 : 1}
							/>
						)}
					</g>
				)
			})}
		</svg>
	)
}
export function AdminCharts({ summary }: { summary: AdminSummary }) {
	const { copy, locale } = useLocalizedCopy()
	return (
		<>
			<div className="mm-admin-charts">
				<section className="mm-admin-card">
					<div className="mm-admin-card-title">
						<h2>{copy('Volume finalisé par heure', 'Completed volume per hour')}</h2>
						<b>
							{gigabytes(summary.period.uploadedBytes, locale)} {copy('Go', 'GB')}
						</b>
					</div>
					<p>
						{copy(
							'Captures reçues avec succès · reprises non comptées deux fois',
							'Successfully received captures · retries counted once'
						)}
					</p>
					<Bars
						series={summary.series}
						field="uploadedBytes"
						label={copy('Go uploadés par heure', 'Uploaded GB per hour')}
					/>
					<div className="mm-admin-axis">
						<span>{hourLabel(summary.from, locale)}</span>
						<span>UTC</span>
						<span>{hourLabel(summary.to, locale)}</span>
					</div>
				</section>
				<section className="mm-admin-card">
					<div className="mm-admin-card-title">
						<h2>{copy('Inscriptions par heure', 'Registrations per hour')}</h2>
						<b>{summary.period.signups.toLocaleString(locale)}</b>
					</div>
					<p>{copy('Nouveaux comptes créés sur la période', 'New accounts created during the period')}</p>
					<Bars
						series={summary.series}
						field="signups"
						label={copy('Inscriptions par heure', 'Registrations per hour')}
					/>
					<div className="mm-admin-axis">
						<span>{hourLabel(summary.from, locale)}</span>
						<span>UTC</span>
						<span>{hourLabel(summary.to, locale)}</span>
					</div>
				</section>
			</div>
			<p className="mm-admin-note">
				{copy('Suivi des inscriptions et uploads depuis le', 'Registration and upload tracking since')}{' '}
				{new Date(summary.trackingStartedAt).toLocaleString(locale, { timeZone: 'UTC' })} UTC.{' '}
				{copy(
					'Les heures antérieures sont indisponibles ; les heures en cours ou au démarrage sont partielles.',
					'Earlier hours are unavailable; the current and initial hours are partial.'
				)}
			</p>
			<details className="mm-admin-values">
				<summary>{copy('Afficher les valeurs horaires', 'Show hourly values')}</summary>
				<div className="mm-admin-table-wrap">
					<table>
						<thead>
							<tr>
								<th>{copy('Heure UTC', 'UTC hour')}</th>
								<th>{copy('Inscriptions', 'Registrations')}</th>
								<th>{copy('Captures', 'Captures')}</th>
								<th>{copy('Go', 'GB')}</th>
								<th>{copy('Suivi', 'Coverage')}</th>
							</tr>
						</thead>
						<tbody>
							{[...summary.series].reverse().map(row => (
								<tr key={row.at}>
									<td>{hourLabel(row.at, locale)}</td>
									<td>{row.coverage === 'none' ? '—' : row.signups}</td>
									<td>{row.coverage === 'none' ? '—' : row.uploads}</td>
									<td>{row.coverage === 'none' ? '—' : gigabytes(row.uploadedBytes, locale)}</td>
									<td>
										{row.coverage === 'full'
											? copy('Complet', 'Full')
											: copy('Partiel / indisponible', 'Partial / unavailable')}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>
		</>
	)
}
