import { Link } from 'react-router'
import { useI18n } from '../../i18n/I18n'
import {
	busiestSlot,
	bytesPerDay,
	dailyBuckets,
	delta,
	heatmap,
	lastHours,
	periodView,
	projectBytes,
} from '../../lib/admin-insight'
import { formatBytes } from '../../lib/bytes'
import { Card, Kpi, Meter } from './AdminKit'
import { ConsoleHeader } from './ConsoleHeader'
import { AlignedSeries, HeatmapGrid } from './charts'
import { type Console, useConsole } from './console'

type Summary = NonNullable<Console['data']['summary']>
type Translate = ReturnType<typeof useI18n>['t']
type Tile = { to: string; tone: string; value: string | number; title: string; text: string }
const tileTone: Record<string, string> = { warn: 'c-gold', bad: 'bad', ok: 'c-green', info: 'c-name' }

function tiles(console: Console, locale: Parameters<typeof formatBytes>[1], t: Translate): Tile[] {
	const { access, data } = console
	const list: Tile[] = []
	if (access.moderator && data.queue)
		list.push({
			to: '/admin/moderation',
			tone: 'warn',
			value: data.queue.pending + data.queue.reported,
			title: t('Waiting for review'),
			text: t('{pending} pending · {reported} reported', {
				pending: data.queue.pending,
				reported: data.queue.reported,
			}),
		})
	if (access.operator && data.openIssues)
		list.push({
			to: '/admin/diagnostics',
			tone: 'bad',
			value: `${data.openIssues.count}${data.openIssues.more ? '+' : ''}`,
			title: t('Open error groups'),
			text: t('Reported by the mod, with consent'),
		})
	if (access.admin && data.overview)
		list.push({
			to: '/admin/users?sort=storage_desc',
			tone: 'ok',
			value: data.overview.nearQuotaAccounts,
			title: t('Accounts near their quota'),
			text: `${t('Total storage used')}: ${formatBytes(data.overview.usedBytes, locale)}`,
		})
	if (access.admin && data.summary)
		list.push({
			to: '/admin/platform',
			tone: 'info',
			value: data.summary.totals.restoringObjects,
			title: t('Objects restoring'),
			text: `${t('Pending deletion')}: ${formatBytes(data.summary.totals.pendingDeletionBytes, locale)}`,
		})
	return list
}

function KeyFigures({ summary, console }: { summary: Summary; console: Console }) {
	const { t, locale } = useI18n()
	const view = periodView(summary.series, console.hours, console.compare)
	const days = dailyBuckets(lastHours(summary.series, 720))
	const change = (current: number, previous: number) => (view.comparable ? delta(current, previous) : undefined)
	return (
		<section className="mm-con-kpis" aria-label={t('Key figures')}>
			<Kpi
				locale={locale}
				label={t('Current accounts')}
				value={summary.totals.users.toLocaleString(locale)}
				delta={change(view.totals.signups, view.before.signups)}
				note={t('{count} new in the period', { count: view.totals.signups.toLocaleString(locale) })}
				spark={days.map(day => day.signups)}
				tone="info"
				to="/admin/users"
			/>
			<Kpi
				locale={locale}
				label={t('Active accounts, 30 days')}
				value={(console.data.insights?.activity.activeUsers ?? 0).toLocaleString(locale)}
				note={t('of {count}', { count: summary.totals.users.toLocaleString(locale) })}
				to="/admin/users"
			/>
			<Kpi
				locale={locale}
				label={t('Completed captures')}
				value={view.totals.uploads.toLocaleString(locale)}
				delta={change(view.totals.uploads, view.before.uploads)}
				note={t('during the period')}
				spark={days.map(day => day.uploads)}
			/>
			<Kpi
				locale={locale}
				label={t('Completed volume')}
				value={formatBytes(view.totals.uploadedBytes, locale)}
				delta={change(view.totals.uploadedBytes, view.before.uploadedBytes)}
				note={t('during the period')}
				spark={days.map(day => day.uploadedBytes)}
			/>
			<Kpi
				locale={locale}
				label={t('Logical storage')}
				value={formatBytes(summary.totals.storedBytes, locale)}
				note={t('{rate} per day', { rate: formatBytes(bytesPerDay(lastHours(summary.series, console.hours)), locale) })}
				to="/admin/platform"
			/>
			<Kpi
				locale={locale}
				label={t('Approved publications')}
				value={summary.totals.publicCaptures.toLocaleString(locale)}
				to="/admin/moderation"
			/>
		</section>
	)
}

function Charts({ summary, console }: { summary: Summary; console: Console }) {
	const { t, locale } = useI18n()
	const view = periodView(summary.series, console.hours, console.compare)
	const map = heatmap(lastHours(summary.series, 720))
	const peak = busiestSlot(map)
	const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })
	return (
		<div className="mm-con-grid is-wide is-2-1">
			<Card title={t('Activity')} hint={t('Captures, sign-ups and volume on one time axis. Hours are UTC.')}>
				<AlignedSeries
					points={view.shown}
					previous={view.earlier}
					hourly={view.hourly}
					locale={locale}
					labels={{
						captures: t('Completed captures'),
						signups: t('Sign-ups'),
						volume: t('Completed volume'),
						previous: t('previous period'),
					}}
					format={(key, value) => (key === 'uploadedBytes' ? formatBytes(value, locale) : value.toLocaleString(locale))}
				/>
			</Card>
			<Card title={t('When people capture')} hint={t('Captures by weekday and 2-hour slot, last 30 days, UTC')}>
				<HeatmapGrid map={map} locale={locale} />
				{peak && (
					<p className="mm-con-hint">
						{t('Busiest: {day}, {from}:00–{to}:00', {
							day: weekday.format(Date.UTC(2024, 0, 7 + peak.weekday)),
							from: peak.slot * 2,
							to: peak.slot * 2 + 2,
						})}
					</p>
				)}
			</Card>
		</div>
	)
}

function Cards({ summary, console }: { summary: Summary; console: Console }) {
	const { t, locale } = useI18n()
	const { totals } = summary
	const { insights } = console.data
	const perDay = bytesPerDay(lastHours(summary.series, console.hours))
	const part = (label: string, value: number, tone: 'ember' | 'info' | 'bad' | 'lore') => ({
		label,
		value,
		tone,
		text: formatBytes(value, locale),
	})
	return (
		<div className="mm-con-grid">
			<Card title={t('Storage')} hint={t('Logical bytes by state')}>
				<Meter
					label={t('Storage')}
					total={totals.storedBytes + totals.pendingDeletionBytes + totals.reservedBytes}
					parts={[
						part(t('Captures'), totals.storedBytes - totals.trashBytes, 'ember'),
						part(t('Trash'), totals.trashBytes, 'info'),
						part(t('Pending deletion'), totals.pendingDeletionBytes, 'bad'),
						part(t('Reserved uploads'), totals.reservedBytes, 'lore'),
					]}
				/>
				<p className="mm-con-hint">
					{t('At this pace: {size} in 90 days (estimate)', {
						size: formatBytes(projectBytes(totals.storedBytes, perDay, 90), locale),
					})}
				</p>
			</Card>
			{insights && (
				<Card title={t('Most active accounts')} hint={t('Over the last {days} days', { days: insights.windowDays })}>
					<ol className="mm-con-rows">
						{insights.activity.users.slice(0, 5).map(user => (
							<li key={user.id} className="mm-con-row" style={{ gridTemplateColumns: '1fr auto' }}>
								<span>{user.name}</span>
								<output>{user.score}</output>
							</li>
						))}
					</ol>
				</Card>
			)}
			{insights && (
				<Card title={t('Shared links')} hint={t('Links created, active and opened')}>
					<dl className="mm-con-kv">
						<dt>{t('Active links')}</dt>
						<dd>{insights.shares.activeLinks.toLocaleString(locale)}</dd>
						<dt>{t('Opened at least once')}</dt>
						<dd>{insights.shares.openedLinks.toLocaleString(locale)}</dd>
						<dt>{t('Total openings')}</dt>
						<dd>{insights.shares.opens.toLocaleString(locale)}</dd>
					</dl>
				</Card>
			)}
		</div>
	)
}

/** `/admin`: is the service healthy, and what needs someone today? Only what the account may open is shown. */
export function AdminPulse() {
	const { t, locale } = useI18n()
	const console = useConsole()
	const { access, data } = console
	const attention = tiles(console, locale, t)
	return (
		<>
			<ConsoleHeader
				title={t('Pulse')}
				lead={t('Is the service healthy, and what needs someone today?')}
				periodTools={access.admin}
			/>
			{data.loading && !data.summary && <p role="status">{t('Loading the dashboard…')}</p>}
			{attention.length > 0 && (
				<section className="mm-con-attn" aria-label={t('Needs attention')}>
					{attention.map(tile => (
						<Link key={tile.to} to={tile.to} style={{ ['--tone' as string]: `var(--${tileTone[tile.tone]})` }}>
							<b>{tile.value}</b>
							<span>
								<em>{tile.title}</em>
								{tile.text}
							</span>
						</Link>
					))}
				</section>
			)}
			{data.summary && (
				<>
					<KeyFigures summary={data.summary} console={console} />
					<Charts summary={data.summary} console={console} />
					<Cards summary={data.summary} console={console} />
				</>
			)}
		</>
	)
}
