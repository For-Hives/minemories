import type { RoleStorage } from '@minemories/api-contract'
import { useEffect, useState } from 'react'
import { apiClient } from '../../api-client'
import { buttonDark } from '../../components/ui'
import { useI18n } from '../../i18n/I18n'
import { formatBytes } from '../../lib/bytes'
import { RoleStorageDialog } from '../AdminRoleStorage'
import '../admin-dialog.css'
import { BarRow, Card, Kpi, Meter } from './AdminKit'
import { ConsoleHeader } from './ConsoleHeader'
import { useConsole } from './console'

type Audit = Awaited<ReturnType<typeof apiClient.admin.audit>>

type Traffic = NonNullable<ReturnType<typeof useConsole>['data']['analytics']>['traffic']

/** Hourly request counters: which mod builds are downloaded, how the API answers, how pairing ends. Totals only. */
function TrafficCards({ traffic }: { traffic: Traffic }) {
	const { t, locale } = useI18n()
	const top = Math.max(1, ...traffic.downloads.map(row => row.count))
	const pairing = traffic.pairing
	const attempts = pairing.done + pairing.rejected + pairing.limited
	return (
		<>
			<div className="mm-con-grid is-wide">
				<Card title={t('Mod downloads')} hint={t('Downloads in the last 30 days, by target')}>
					{traffic.downloads.length === 0 ? (
						<p className="mm-con-note">{t('Nothing counted yet.')}</p>
					) : (
						<ul className="mm-con-rows">
							{traffic.downloads.slice(0, 8).map(row => (
								<BarRow
									key={row.target}
									label={row.target}
									share={row.count / top}
									text={row.count.toLocaleString(locale)}
								/>
							))}
						</ul>
					)}
				</Card>
				<Card title={t('Pairing, last 24 hours')} hint={t('How the 6-digit code exchanges ended')}>
					<Meter
						label={t('Pairing, last 24 hours')}
						total={attempts}
						parts={[
							{ label: t('Done'), value: pairing.done, tone: 'ok', text: pairing.done.toLocaleString(locale) },
							{
								label: t('Rejected'),
								value: pairing.rejected,
								tone: 'warn',
								text: pairing.rejected.toLocaleString(locale),
							},
							{
								label: t('Too many attempts'),
								value: pairing.limited,
								tone: 'bad',
								text: pairing.limited.toLocaleString(locale),
							},
						]}
					/>
				</Card>
			</div>
			<Card
				title={t('API, last 24 hours')}
				hint={t('Counting started {date}. Totals only: no address, account or path is stored.', {
					date: new Date(traffic.trackingStartedAt).toLocaleDateString(locale),
				})}
			>
				{traffic.api.length === 0 ? (
					<p className="mm-con-note">{t('Nothing counted yet.')}</p>
				) : (
					<div className="mm-con-table-wrap">
						<table className="mm-con-table">
							<thead>
								<tr>
									<th>{t('Route')}</th>
									<th className="is-num">{t('Requests')}</th>
									<th className="is-num">{t('Server errors')}</th>
									<th className="is-num">{t('Mean time')}</th>
								</tr>
							</thead>
							<tbody>
								{traffic.api.map(row => (
									<tr key={row.route}>
										<td>{row.route}</td>
										<td className="is-num">{row.requests.toLocaleString(locale)}</td>
										<td className="is-num">
											{row.serverErrors.toLocaleString(locale)}
											{row.serverErrors > 0 && ` · ${((row.serverErrors / row.requests) * 100).toFixed(1)} %`}
										</td>
										<td className="is-num">{row.meanMs.toLocaleString(locale)} ms</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>
		</>
	)
}

/** `/admin/platform`: where the bytes are and what is waiting, what each role may store, and who changed access. */
export function AdminPlatform() {
	const { t, locale } = useI18n()
	const { data, reload } = useConsole()
	const [roles, setRoles] = useState<RoleStorage[]>([])
	const [audit, setAudit] = useState<Audit>([])
	const [limit, setLimit] = useState<RoleStorage | null>(null)
	const [revision, setRevision] = useState(0)
	const [failed, setFailed] = useState(false)
	useEffect(() => {
		let live = true
		setFailed(false)
		Promise.all([apiClient.admin.storageRoles(), apiClient.admin.audit()])
			.then(([nextRoles, nextAudit]) => {
				if (!live) return
				setRoles(nextRoles)
				setAudit(nextAudit)
			})
			.catch(() => live && setFailed(true))
		return () => {
			live = false
		}
	}, [revision, data.loads])
	const totals = data.summary?.totals
	const roleName = { user: t('User'), admin: t('Admin') }
	return (
		<>
			<ConsoleHeader title={t('Platform')} lead={t('Storage, queues, limits and who changed access.')} />
			{failed && <p role="alert">{t('Could not load the dashboard. Try Refresh again.')}</p>}
			{totals && (
				<>
					<section className="mm-con-kpis" aria-label={t('Service overview')}>
						<Kpi locale={locale} label={t('Logical storage')} value={formatBytes(totals.storedBytes, locale)} />
						<Kpi locale={locale} label={t('Archived objects')} value={totals.coldObjects.toLocaleString(locale)} />
						<Kpi
							locale={locale}
							label={t('Objects restoring')}
							value={totals.restoringObjects.toLocaleString(locale)}
						/>
						<Kpi
							locale={locale}
							label={t('Pending deletion')}
							value={formatBytes(totals.pendingDeletionBytes, locale)}
						/>
						<Kpi locale={locale} label={t('Reserved uploads')} value={formatBytes(totals.reservedBytes, locale)} />
						<Kpi locale={locale} label={t('Trash')} value={formatBytes(totals.trashBytes, locale)} />
					</section>
					<div className="mm-con-grid is-wide">
						<Card title={t('Storage')} hint={t('Where the bytes are, and what is still waiting')}>
							<Meter
								label={t('Storage')}
								total={totals.storedBytes + totals.pendingDeletionBytes + totals.reservedBytes}
								parts={[
									{
										label: t('Captures'),
										value: totals.storedBytes - totals.trashBytes,
										tone: 'ember',
										text: formatBytes(totals.storedBytes - totals.trashBytes, locale),
									},
									{
										label: t('Trash'),
										value: totals.trashBytes,
										tone: 'info',
										text: formatBytes(totals.trashBytes, locale),
									},
									{
										label: t('Pending deletion'),
										value: totals.pendingDeletionBytes,
										tone: 'bad',
										text: formatBytes(totals.pendingDeletionBytes, locale),
									},
									{
										label: t('Reserved uploads'),
										value: totals.reservedBytes,
										tone: 'lore',
										text: formatBytes(totals.reservedBytes, locale),
									},
								]}
							/>
							<dl className="mm-con-kv" style={{ marginTop: 16 }}>
								<dt>{t('Paired devices')}</dt>
								<dd>{totals.devices.toLocaleString(locale)}</dd>
								<dt>{t('Valid sessions')}</dt>
								<dd>{totals.sessions.toLocaleString(locale)}</dd>
								<dt>{t('Administrators')}</dt>
								<dd>{totals.admins.toLocaleString(locale)}</dd>
							</dl>
						</Card>
						<Card
							title={t('Storage by role')}
							hint={t(
								'An account gets the largest limit among its roles. Lowering a limit deletes nothing: it only blocks new uploads.'
							)}
						>
							<div className="mm-con-table-wrap">
								<table className="mm-con-table">
									<thead>
										<tr>
											<th>{t('Role')}</th>
											<th className="is-num">{t('Holders')}</th>
											<th className="is-num">{t('Limit')}</th>
											<th />
										</tr>
									</thead>
									<tbody>
										{roles.map(row => (
											<tr key={row.role}>
												<td>{roleName[row.role]}</td>
												<td className="is-num">{row.accounts.toLocaleString(locale)}</td>
												<td className="is-num">{formatBytes(row.effectiveBytes, locale)}</td>
												<td>
													<button type="button" className={buttonDark} onClick={() => setLimit(row)}>
														{t('Change the limit')}
													</button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</Card>
					</div>
				</>
			)}
			{data.analytics && <TrafficCards traffic={data.analytics.traffic} />}
			<Card title={t('Access audit')} hint={t('The latest 50 role changes.')}>
				{audit.length === 0 ? (
					<p className="mm-con-note">{t('No changes recorded.')}</p>
				) : (
					<div className="mm-con-table-wrap">
						<table className="mm-con-table">
							<thead>
								<tr>
									<th>{t('Account')}</th>
									<th>{t('Role')}</th>
									<th>{t('Actions')}</th>
									<th>{t('Date')}</th>
								</tr>
							</thead>
							<tbody>
								{audit.map(row => (
									<tr key={row.id}>
										<td>{row.targetName ?? t('Deleted account')}</td>
										<td>
											{row.role === 'admin' ? t('Administrator access granted') : t('Administrator access removed')}
										</td>
										<td>{row.actorName ?? t('Server console')}</td>
										<td>{new Date(row.at).toLocaleString(locale)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>
			{limit && (
				<RoleStorageDialog
					row={limit}
					onClose={() => setLimit(null)}
					onSuccess={() => {
						setLimit(null)
						setRevision(value => value + 1)
						reload()
					}}
				/>
			)}
		</>
	)
}
