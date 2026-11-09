import type { AdminInsights as Insights } from '@minemories/api-contract'
import { useI18n } from '../i18n/I18n'

type Count = Insights['versions']['mod'][number]

function VersionList({ title, rows, total }: { title: string; rows: Count[]; total: number }) {
	const { t, locale } = useI18n()
	return (
		<div className="mm-admin-versions-list">
			<h3>{title}</h3>
			{rows.length === 0 ? (
				<p className="mm-admin-note">{t('No data yet.')}</p>
			) : (
				<ol>
					{rows.map(row => (
						<li key={row.version}>
							<span>{row.version === 'unknown' ? t('Unknown version') : row.version}</span>
							<meter min={0} max={Math.max(total, 1)} value={row.devices} aria-label={row.version} />
							<b>{row.devices.toLocaleString(locale)}</b>
						</li>
					))}
				</ol>
			)}
		</div>
	)
}
function Versions({ versions }: { versions: Insights['versions'] }) {
	const { t, locale } = useI18n()
	return (
		<section className="mm-admin-card">
			<h2>{t('Versions in use')}</h2>
			<p>
				{t('Latest versions reported by {count} devices that sent diagnostics with consent.', {
					count: versions.reportingDevices.toLocaleString(locale),
				})}
			</p>
			<div className="mm-admin-versions">
				<VersionList title="Minecraft" rows={versions.minecraft} total={versions.reportingDevices} />
				<VersionList title={t('Mod loader')} rows={versions.loader} total={versions.reportingDevices} />
				<VersionList title="Minemories" rows={versions.mod} total={versions.reportingDevices} />
			</div>
		</section>
	)
}
function Shares({ shares }: { shares: Insights['shares'] }) {
	const { t, locale } = useI18n()
	const rows = [
		[t('Share links created'), shares.links],
		[t('Active links'), shares.activeLinks],
		[t('Revoked links'), shares.revokedLinks],
		[t('World links'), shares.worldLinks],
		[t('Links opened at least once'), shares.openedLinks],
		[t('Total openings'), shares.opens],
	] as const
	return (
		<section className="mm-admin-card">
			<h2>{t('Shared links')}</h2>
			<dl className="mm-admin-operations">
				{rows.map(([label, value]) => (
					<div key={label}>
						<dt>{label}</dt>
						<dd>{value.toLocaleString(locale)}</dd>
					</div>
				))}
			</dl>
			{shares.top.length > 0 && (
				<>
					<h3>{t('Most opened links')}</h3>
					<ol className="mm-admin-ranking">
						{shares.top.map(row => (
							<li key={`${row.owner}-${row.name}-${row.scope}-${row.opens}`}>
								<span>
									<strong>{row.name}</strong>
									<small>
										{row.owner ?? t('Deleted account')} · {row.scope === 'world' ? t('World') : t('Snapshot')}
										{row.revoked ? ` · ${t('Revoked')}` : ''}
									</small>
								</span>
								<b>{row.opens.toLocaleString(locale)}</b>
							</li>
						))}
					</ol>
				</>
			)}
		</section>
	)
}
function Activity({ activity, days }: { activity: Insights['activity']; days: number }) {
	const { t, locale } = useI18n()
	const labels = { high: t('Very active'), medium: t('Active'), low: t('Occasional') } as const
	return (
		<section className="mm-admin-card">
			<h2>{t('Most active accounts')}</h2>
			<p>
				{t(
					'{count} accounts active in the last {days} days, ranked by logins, snapshots uploaded and paired devices seen.',
					{
						count: activity.activeUsers.toLocaleString(locale),
						days,
					}
				)}
			</p>
			{activity.users.length === 0 ? (
				<p className="mm-admin-note">{t('No activity in this period.')}</p>
			) : (
				<ol className="mm-admin-ranking">
					{activity.users.map(user => (
						<li key={user.id}>
							<span>
								<strong>{user.name}</strong>
								<small>
									{user.email} · {t('{logins} logins', { logins: user.logins })} ·{' '}
									{t('{uploads} snapshots', { uploads: user.uploads })}
									{user.lastActiveAt ? ` · ${new Date(user.lastActiveAt).toLocaleDateString(locale)}` : ''}
								</small>
							</span>
							<span className={`mm-admin-level is-${user.level}`}>{labels[user.level]}</span>
						</li>
					))}
				</ol>
			)}
		</section>
	)
}
export function AdminInsights({ insights }: { insights: Insights }) {
	return (
		<>
			<Versions versions={insights.versions} />
			<div className="mm-admin-lower">
				<Shares shares={insights.shares} />
				<Activity activity={insights.activity} days={insights.windowDays} />
			</div>
		</>
	)
}
