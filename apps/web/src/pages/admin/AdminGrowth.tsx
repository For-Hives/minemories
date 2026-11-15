import type { AdminAnalytics } from '@minemories/api-contract'
import { useI18n } from '../../i18n/I18n'
import { lorenzPath, retentionAt, retentionRows, shareOf } from '../../lib/admin-insight'
import { BarRow, Card, Kpi } from './AdminKit'
import { ConsoleHeader } from './ConsoleHeader'
import { useConsole } from './console'

type Translate = ReturnType<typeof useI18n>['t']
type Loc = ReturnType<typeof useI18n>['locale']
const percent = (value: number, locale: Loc) => `${Math.round(value * 100).toLocaleString(locale)} %`
const FIRST_CAPTURE_LABELS = ['<5 min', '5–30 min', '30 min–2 h', '2–24 h', '1–7 d', '>7 d']
const WEEKS = Array.from({ length: 8 }, (_, week) => ({ week, id: `w${week}` }))

function Funnel({ funnel, locale, t }: { funnel: AdminAnalytics['funnel']; locale: Loc; t: Translate }) {
	const steps: Array<[string, number]> = [
		[t('Accounts'), funnel.accounts],
		[t('Email verified'), funnel.verified],
		[t('Device paired'), funnel.paired],
		[t('First capture'), funnel.captured],
		[t('Shared a link'), funnel.shared],
		[t('Submitted to the gallery'), funnel.submitted],
	]
	return (
		<Card title={t('From sign-up to the gallery')} hint={t('Accounts that reached each step, ever')}>
			<ul className="mm-con-rows">
				{steps.map(([label, count]) => (
					<BarRow
						key={label}
						label={label}
						share={shareOf(count, funnel.accounts)}
						text={`${count.toLocaleString(locale)} · ${percent(shareOf(count, funnel.accounts), locale)}`}
						tone="info"
					/>
				))}
			</ul>
		</Card>
	)
}

function Cohorts({ cohorts, locale, t }: { cohorts: AdminAnalytics['cohorts']; locale: Loc; t: Translate }) {
	const date = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', day: 'numeric' })
	const rows = retentionRows(cohorts)
	return (
		<Card
			title={t('Retention by sign-up week')}
			hint={t('Share of each sign-up week still active n weeks later. Newest week last.')}
		>
			<div className="mm-con-table-wrap">
				<table className="mm-con-table mm-con-cohorts">
					<thead>
						<tr>
							<th>{t('Week of')}</th>
							<th className="is-num">{t('Accounts')}</th>
							{WEEKS.map(({ week, id }) => (
								<th key={id} className="is-num">{`W${week}`}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map(row => (
							<tr key={row.weekStart}>
								<td>{date.format(row.weekStart)}</td>
								<td className="is-num">{row.size}</td>
								{WEEKS.map(({ week, id }) => {
									const rate = row.rates[week]
									return rate === undefined ? (
										<td key={id} />
									) : (
										<td
											key={`w${week}`}
											className="is-num is-rate"
											style={{ ['--level' as string]: Math.round(rate * 100) }}
										>
											{Math.round(rate * 100)}
										</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="mm-con-hint">
				{t(
					'Active means a login, an upload or a paired device seen. Sessions that expired are not counted, so rates are a minimum.'
				)}
			</p>
		</Card>
	)
}

function FirstCapture({ data, locale, t }: { data: AdminAnalytics['firstCapture']; locale: Loc; t: Translate }) {
	const biggest = Math.max(1, ...data.buckets)
	return (
		<Card title={t('Time to first capture')} hint={t('From the first paired device to the first upload')}>
			<div className="mm-con-hist" role="img" aria-label={t('Time to first capture')}>
				{data.buckets.map((count, index) => (
					<div key={FIRST_CAPTURE_LABELS[index]}>
						<span>{count.toLocaleString(locale)}</span>
						<i style={{ height: `${(count / biggest) * 100}%` }} />
						<small>{FIRST_CAPTURE_LABELS[index]}</small>
					</div>
				))}
			</div>
			<p className="mm-con-hint">
				{data.medianMinutes === null
					? t('No account has uploaded yet.')
					: t('Median: {minutes} min, over {count} accounts', {
							minutes: data.medianMinutes.toLocaleString(locale),
							count: data.samples,
						})}
			</p>
		</Card>
	)
}

function Concentration({ data, locale, t }: { data: AdminAnalytics['concentration']; locale: Loc; t: Translate }) {
	return (
		<Card
			title={t('Who holds the storage')}
			hint={t('Accounts sorted from smallest to largest, and the share of bytes they hold')}
		>
			<svg
				viewBox="0 0 260 180"
				width="100%"
				role="img"
				aria-label={t('Top 10% of accounts hold {share} of the bytes', { share: percent(data.topTenShare, locale) })}
			>
				<line x1="0" y1="180" x2="260" y2="0" stroke="var(--text-3)" strokeDasharray="4 4" />
				<path d={`${lorenzPath(data.lorenz, 260, 180)}L260 180L0 180Z`} fill="var(--ember)" fillOpacity="0.18" />
				<path
					d={lorenzPath(data.lorenz, 260, 180)}
					fill="none"
					stroke="var(--ember)"
					strokeWidth="2.5"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<p className="mm-con-hint">
				{t('Top 10% of accounts hold {share} of the bytes', { share: percent(data.topTenShare, locale) })} · Gini{' '}
				{data.gini.toFixed(2)}
			</p>
		</Card>
	)
}

function Publication({ data, locale, t }: { data: AdminAnalytics['publication']; locale: Loc; t: Translate }) {
	const steps: Array<[string, number, number]> = [
		[t('Captures'), data.captures, data.captures],
		[t('Shared by link'), data.shared, data.captures],
		[t('Submitted'), data.submitted, data.captures],
		[t('Approved'), data.approved, data.submitted],
		[t('Got a vote'), data.voted, data.approved],
		[t('5 votes or more'), data.wellVoted, data.voted],
	]
	return (
		<Card title={t('From capture to public')} hint={t('After the first rows, each share is of the step before')}>
			<ul className="mm-con-rows">
				{steps.map(([label, count, of]) => (
					<BarRow
						key={label}
						label={label}
						share={shareOf(count, data.captures)}
						text={`${count.toLocaleString(locale)} · ${percent(shareOf(count, of), locale)}`}
						tone="lore"
					/>
				))}
			</ul>
		</Card>
	)
}

/** `/admin/growth`: do people arrive, get to their first capture, stay, and how concentrated is the storage? */
export function AdminGrowth() {
	const { t, locale } = useI18n()
	const { data } = useConsole()
	const analytics = data.analytics
	const week = analytics ? retentionAt(analytics.cohorts, 1) : null
	return (
		<>
			<ConsoleHeader title={t('Growth')} lead={t('Do people arrive, reach their first capture and stay?')} />
			{!analytics && <p role="status">{t('Loading the dashboard…')}</p>}
			{analytics && (
				<>
					<section className="mm-con-kpis" aria-label={t('Key figures')}>
						<Kpi
							locale={locale}
							label={t('Activation')}
							value={percent(shareOf(analytics.funnel.captured, analytics.funnel.accounts), locale)}
							note={t('accounts with a capture')}
						/>
						<Kpi
							locale={locale}
							label={t('Time to first capture')}
							value={
								analytics.firstCapture.medianMinutes === null
									? '–'
									: `${analytics.firstCapture.medianMinutes.toLocaleString(locale)} min`
							}
							note={t('median')}
						/>
						<Kpi
							locale={locale}
							label={t('Active after one week')}
							value={week === null ? '–' : percent(week, locale)}
							note={t('minimum, all cohorts')}
						/>
						<Kpi
							locale={locale}
							label={t('Held by the top 10%')}
							value={percent(analytics.concentration.topTenShare, locale)}
							note={t('of the stored bytes')}
						/>
					</section>
					<div className="mm-con-grid is-wide">
						<Funnel funnel={analytics.funnel} locale={locale} t={t} />
						<FirstCapture data={analytics.firstCapture} locale={locale} t={t} />
					</div>
					<Cohorts cohorts={analytics.cohorts} locale={locale} t={t} />
					<div className="mm-con-grid is-wide">
						<Concentration data={analytics.concentration} locale={locale} t={t} />
						<Publication data={analytics.publication} locale={locale} t={t} />
					</div>
				</>
			)}
		</>
	)
}
