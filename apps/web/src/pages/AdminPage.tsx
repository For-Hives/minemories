import type { AdminSummary, AdminUser, AdminUserSort } from '@minemories/api-contract'
import { useState } from 'react'
import { Link } from 'react-router'
import { buttonLime } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { AdminCharts, gigabytes } from './AdminCharts'
import { Directory, type RoleFilter } from './AdminDirectory'
import { AdminInsights } from './AdminInsights'
import { AdminRoleDialog } from './AdminRoleDialog'
import { type AdminDataset, useAdminData } from './admin-data'
import './admin.css'

function Totals({ data }: { data: AdminSummary }) {
	const { t, locale } = useI18n()
	const cards = [
		{
			label: t('Current accounts'),
			value: data.totals.users.toLocaleString(locale),
			note: t('on the service'),
		},
		{
			label: t('Completed captures'),
			value: data.period.uploads.toLocaleString(locale),
			note: t('during the period'),
		},
		{
			label: t('Completed volume'),
			value: `${gigabytes(data.period.uploadedBytes, locale)} ${t('GB')}`,
			note: t('during the period'),
		},
		{
			label: t('Logical storage'),
			value: `${gigabytes(data.totals.storedBytes, locale)} ${t('GB')}`,
			note: t('captures and trash'),
		},
	]
	return (
		<div className="mm-admin-kpis">
			{cards.map(card => (
				<article className="mm-admin-kpi" key={card.label}>
					<span>{card.label}</span>
					<strong>{card.value}</strong>
					<small>{card.note}</small>
				</article>
			))}
		</div>
	)
}
function Operations({ data }: { data: AdminSummary['totals'] }) {
	const { t, locale } = useI18n()
	const rows = [
		[t('Administrators'), data.admins.toLocaleString(locale)],
		[t('Valid sessions'), data.sessions.toLocaleString(locale)],
		[t('Paired devices'), data.devices.toLocaleString(locale)],
		[t('Approved publications'), data.publicCaptures.toLocaleString(locale)],
		[t('Trash'), `${gigabytes(data.trashBytes, locale)} ${t('GB')}`],
		[t('Pending deletion'), `${gigabytes(data.pendingDeletionBytes, locale)} ${t('GB')}`],
		[t('Reserved uploads'), `${gigabytes(data.reservedBytes, locale)} ${t('GB')}`],
		[t('Archived objects'), data.coldObjects.toLocaleString(locale)],
		[t('Objects restoring'), data.restoringObjects.toLocaleString(locale)],
	]
	return (
		<section className="mm-admin-card">
			<h2>{t('Service overview')}</h2>
			<dl className="mm-admin-operations">
				{rows.map(([label, value]) => (
					<div key={label}>
						<dt>{label}</dt>
						<dd>{value}</dd>
					</div>
				))}
			</dl>
		</section>
	)
}
function Audit({ rows }: { rows: AdminDataset['audit'] }) {
	const { t, locale } = useI18n()
	return (
		<section className="mm-admin-card">
			<h2>{t('Access audit')}</h2>
			<p>{t('The latest 50 role changes.')}</p>
			{rows.length === 0 ? (
				<p>{t('No changes recorded.')}</p>
			) : (
				<ol className="mm-admin-audit">
					{rows.map(row => (
						<li key={row.id}>
							<span className="mm-admin-audit-dot" />
							<div>
								<strong>{row.targetName ?? t('Deleted account')}</strong>
								<p>
									{row.role === 'admin' ? t('Administrator access granted') : t('Administrator access removed')} ·{' '}
									{row.actorName ?? t('Server console')}
								</p>
								<time dateTime={new Date(row.at).toISOString()}>{new Date(row.at).toLocaleString(locale)}</time>
							</div>
						</li>
					))}
				</ol>
			)}
		</section>
	)
}
export function AdminPage() {
	const { t } = useI18n()
	const [filters, setFilters] = useState({
		hours: 24 as 24 | 168 | 720,
		query: '',
		role: 'all' as RoleFilter,
		page: 1,
		sort: 'registered_desc' as AdminUserSort,
	})
	const [target, setTarget] = useState<AdminUser | null>(null)
	const [removal, setRemoval] = useState<AdminUser | null>(null)
	const load = useAdminData(filters)
	return (
		<section className="mm-content mm-admin-page">
			<header className="mm-admin-heading">
				<div>
					<span className="mm-kicker">MINEMORIES / {t('ADMINISTRATION')}</span>
					<h1>{t('The bigger picture.')}</h1>
					<p>{t('The service, its accounts and its captures, in one place.')}</p>
					<Link to="/account">← {t('My account')}</Link>
				</div>
				<div className="mm-admin-controls">
					<label>
						{t('Period')}
						<span className="mc-select">
							<select
								aria-label={t('Period')}
								className="mc-select__control"
								value={filters.hours}
								onChange={event =>
									setFilters(previous => ({ ...previous, hours: Number(event.target.value) as 24 | 168 | 720 }))
								}
							>
								<option value={24}>{t('24 hours')}</option>
								<option value={168}>{t('7 days')}</option>
								<option value={720}>{t('30 days')}</option>
							</select>
						</span>
					</label>
					<button
						type="button"
						className={`mm-admin-primary ${buttonLime}`}
						onClick={load.reload}
						disabled={load.kind === 'loading'}
					>
						{t('Refresh')}
					</button>
				</div>
			</header>
			{load.kind === 'loading' && (
				<p role="status" className="mm-admin-note">
					{t('Loading the dashboard…')}
				</p>
			)}
			{load.kind === 'denied' && (
				<section role="alert" className="mm-admin-card">
					<h2>{t('Administrator access required')}</h2>
					<p>{t('Your account does not have these permissions.')}</p>
				</section>
			)}
			{load.kind === 'error' && (
				<p role="alert" className="mm-admin-error">
					{t('Could not load the dashboard. Try Refresh again.')}
				</p>
			)}
			{load.kind === 'ready' && (
				<>
					<Totals data={load.data.summary} />
					<AdminCharts summary={load.data.summary} />
					<AdminInsights insights={load.data.insights} />
					<Directory
						directory={load.data.directory}
						admins={load.data.summary.totals.admins}
						filters={filters}
						onSearch={(query, role, sort) => setFilters(previous => ({ ...previous, query, role, sort, page: 1 }))}
						onPage={page => setFilters(previous => ({ ...previous, page }))}
						onSelect={setTarget}
						onDelete={setRemoval}
					/>
					<div className="mm-admin-lower">
						<Operations data={load.data.summary.totals} />
						<Audit rows={load.data.audit} />
					</div>
				</>
			)}
			{removal && (
				<AdminRoleDialog
					mode="delete"
					target={removal}
					onClose={() => setRemoval(null)}
					onSuccess={() => {
						setRemoval(null)
						load.reload()
					}}
				/>
			)}
			{target && (
				<AdminRoleDialog
					target={target}
					onClose={() => setTarget(null)}
					onSuccess={() => {
						setTarget(null)
						load.reload()
					}}
				/>
			)}
		</section>
	)
}
