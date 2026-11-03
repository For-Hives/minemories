import type { AdminSummary } from '@minemories/api-contract'
import { useI18n } from '../i18n/I18n'

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
	const { locale, t } = useI18n(),
		maximum = Math.max(1, ...series.map(row => row[field])),
		width = 960,
		height = 180
	return (
		<svg viewBox={`0 0 ${width} ${height + 20}`} role="img" aria-label={label} className="mm-admin-chart">
			<desc>
				{t('Hourly UTC values; grey areas predate tracking.')} {t('Maximum')}:{' '}
				{field === 'uploadedBytes' ? gigabytes(maximum, locale) : maximum}
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
							{field === 'uploadedBytes' ? `${gigabytes(row[field], locale)} ${t('GB')}` : row[field]}
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
	const { t, locale } = useI18n()
	return (
		<>
			<div className="mm-admin-charts">
				<section className="mm-admin-card">
					<div className="mm-admin-card-title">
						<h2>{t('Completed volume per hour')}</h2>
						<b>
							{gigabytes(summary.period.uploadedBytes, locale)} {t('GB')}
						</b>
					</div>
					<p>{t('Successfully received captures · retries counted once')}</p>
					<Bars series={summary.series} field="uploadedBytes" label={t('Uploaded GB per hour')} />
					<div className="mm-admin-axis">
						<span>{hourLabel(summary.from, locale)}</span>
						<span>UTC</span>
						<span>{hourLabel(summary.to, locale)}</span>
					</div>
				</section>
				<section className="mm-admin-card">
					<div className="mm-admin-card-title">
						<h2>{t('Registrations per hour')}</h2>
						<b>{summary.period.signups.toLocaleString(locale)}</b>
					</div>
					<p>{t('New accounts created during the period')}</p>
					<Bars series={summary.series} field="signups" label={t('Registrations per hour')} />
					<div className="mm-admin-axis">
						<span>{hourLabel(summary.from, locale)}</span>
						<span>UTC</span>
						<span>{hourLabel(summary.to, locale)}</span>
					</div>
				</section>
			</div>
			<p className="mm-admin-note">
				{t('Registration and upload tracking since')}{' '}
				{new Date(summary.trackingStartedAt).toLocaleString(locale, { timeZone: 'UTC' })} UTC.{' '}
				{t('Earlier hours are unavailable; the current and initial hours are partial.')}
			</p>
			<details className="mm-admin-values">
				<summary>{t('Show hourly values')}</summary>
				<div className="mm-admin-table-wrap">
					<table>
						<thead>
							<tr>
								<th>{t('UTC hour')}</th>
								<th>{t('Registrations')}</th>
								<th>{t('Captures')}</th>
								<th>{t('GB')}</th>
								<th>{t('Coverage')}</th>
							</tr>
						</thead>
						<tbody>
							{[...summary.series].reverse().map(row => (
								<tr key={row.at}>
									<td>{hourLabel(row.at, locale)}</td>
									<td>{row.coverage === 'none' ? '—' : row.signups}</td>
									<td>{row.coverage === 'none' ? '—' : row.uploads}</td>
									<td>{row.coverage === 'none' ? '—' : gigabytes(row.uploadedBytes, locale)}</td>
									<td>{row.coverage === 'full' ? t('Full') : t('Partial / unavailable')}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>
		</>
	)
}
