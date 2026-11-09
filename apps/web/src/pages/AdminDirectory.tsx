import type { AdminUser, AdminUserSort } from '@minemories/api-contract'
import type { SyntheticEvent } from 'react'
import { buttonDark } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { formatBytes, formatExactBytes, quotaLevel, quotaPercent } from '../lib/bytes'
import type { AdminDataset } from './admin-data'

export type RoleFilter = 'all' | 'user' | 'admin'
type Translate = ReturnType<typeof useI18n>['t']

function Overview({ directory }: { directory: AdminDataset['directory'] }) {
	const { t, locale } = useI18n()
	const rows = [
		[t('Current accounts'), directory.overview.accounts.toLocaleString(locale)],
		[t('Total storage used'), formatBytes(directory.overview.usedBytes, locale)],
		[t('Accounts near their quota'), directory.overview.nearQuotaAccounts.toLocaleString(locale)],
	]
	return (
		<>
			<dl className="mm-admin-overview">
				{rows.map(([label, value]) => (
					<div key={label}>
						<dt>{label}</dt>
						<dd>{value}</dd>
					</div>
				))}
			</dl>
			<p className="mm-admin-note">
				{t('Quota per account: {quota}', { quota: formatBytes(directory.quotaBytes, locale) })}
			</p>
		</>
	)
}
function levelLabel(level: ReturnType<typeof quotaLevel>, t: Translate): string | null {
	if (level === 'full') return t('Quota reached')
	return level === 'near' ? t('Near quota') : null
}

/** Quota use of one account: a labelled bar plus the same facts in text, so colour is never the only signal. */
function StorageMeter({ user, quotaBytes }: { user: AdminUser; quotaBytes: number }) {
	const { t, locale } = useI18n()
	const percent = quotaPercent(user.usedBytes, quotaBytes),
		level = quotaLevel(percent),
		used = formatBytes(user.usedBytes, locale),
		quota = formatBytes(quotaBytes, locale),
		label = levelLabel(level, t)
	const text = t('{used} of {quota} used ({percent}%)', { used, quota, percent })
	return (
		<div className={`mm-admin-storage is-${level}`}>
			<div
				className="mm-admin-meter"
				role="progressbar"
				aria-label={t('Storage of {name}', { name: user.name })}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={percent}
				aria-valuetext={`${text} - ${formatExactBytes(user.usedBytes, locale)}`}
			>
				<span style={{ width: `${percent}%` }} />
			</div>
			<strong>
				{used} / {quota}
			</strong>
			<small>
				{percent}% · {formatExactBytes(user.usedBytes, locale)}
			</small>
			{label && <em className="mm-admin-quota-flag">{label}</em>}
			{(user.reservedBytes > 0 || user.pendingDeletionBytes > 0) && (
				<small>
					{t('{reserved} reserved for uploads, {pending} awaiting deletion', {
						reserved: formatBytes(user.reservedBytes, locale),
						pending: formatBytes(user.pendingDeletionBytes, locale),
					})}
				</small>
			)}
		</div>
	)
}
function Search({
	filters,
	onSearch,
}: {
	filters: { query: string; role: RoleFilter; sort: AdminUserSort }
	onSearch(query: string, role: RoleFilter, sort: AdminUserSort): void
}) {
	const { t } = useI18n()
	function search(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		const data = new FormData(event.currentTarget)
		onSearch(
			String(data.get('query') ?? ''),
			String(data.get('role')) as RoleFilter,
			String(data.get('sort')) as AdminUserSort
		)
	}
	return (
		<form className="mm-admin-search" onSubmit={search}>
			<label>
				{t('Find an account')}
				<input name="query" defaultValue={filters.query} placeholder={t('Name, email or ID')} maxLength={100} />
			</label>
			<label>
				{t('Role')}
				<span className="mc-select">
					<select name="role" defaultValue={filters.role} className="mc-select__control">
						<option value="all">{t('filters.allStates')}</option>
						<option value="admin">{t('Administrators')}</option>
						<option value="user">{t('Users')}</option>
					</select>
				</span>
			</label>
			<label>
				{t('Sort by')}
				<span className="mc-select">
					<select name="sort" defaultValue={filters.sort} className="mc-select__control">
						<option value="registered_desc">{t('Newest first')}</option>
						<option value="registered_asc">{t('Oldest first')}</option>
						<option value="storage_desc">{t('Most storage used')}</option>
						<option value="storage_asc">{t('Least storage used')}</option>
					</select>
				</span>
			</label>
			<button type="submit" className={`mm-admin-secondary ${buttonDark}`}>
				{t('Search')}
			</button>
		</form>
	)
}
export function Directory({
	directory,
	admins,
	filters,
	onSearch,
	onPage,
	onSelect,
	onDelete,
}: {
	directory: AdminDataset['directory']
	admins: number
	filters: { query: string; role: RoleFilter; page: number; sort: AdminUserSort }
	onSearch(query: string, role: RoleFilter, sort: AdminUserSort): void
	onPage(page: number): void
	onSelect(user: AdminUser): void
	onDelete(user: AdminUser): void
}) {
	const { t, locale } = useI18n()
	return (
		<section className="mm-admin-card mm-admin-directory">
			<div className="mm-admin-card-title">
				<h2>{t('Users and access')}</h2>
				<span>
					{directory.total.toLocaleString(locale)} {t('accounts')}
				</span>
			</div>
			<Overview directory={directory} />
			<Search filters={filters} onSearch={onSearch} />
			<div className="mm-admin-table-wrap">
				<table className="mm-admin-users">
					<thead>
						<tr>
							<th>{t('Account')}</th>
							<th>{t('Role')}</th>
							<th>{t('Registered')}</th>
							<th>{t('Captures')}</th>
							<th>{t('Storage')}</th>
							<th>{t('Actions')}</th>
						</tr>
					</thead>
					<tbody>
						{directory.users.map(user => (
							<tr key={user.id}>
								<td className="mm-admin-account">
									<strong>{user.name}</strong>
									<small>{user.email}</small>
								</td>
								<td data-label={t('Role')}>
									<span className={`mm-admin-role ${user.role === 'admin' ? 'is-admin' : ''}`}>
										{user.role === 'admin' ? t('Admin') : t('User')}
									</span>
								</td>
								<td data-label={t('Registered')}>{new Date(user.createdAt).toLocaleDateString(locale)}</td>
								<td data-label={t('Captures')}>{user.captures.toLocaleString(locale)}</td>
								<td data-label={t('Storage')}>
									<StorageMeter user={user} quotaBytes={directory.quotaBytes} />
								</td>
								<td className="mm-admin-actions">
									<button
										type="button"
										className={`mm-admin-secondary ${buttonDark}`}
										aria-label={`${user.role === 'admin' ? t('Remove admin role') : t('Promote to admin')} (${user.name})`}
										disabled={user.role === 'admin' && admins <= 1}
										onClick={() => onSelect(user)}
									>
										{user.role === 'admin' ? t('Remove admin role') : t('Promote to admin')}
									</button>
									{user.role !== 'admin' && (
										<button
											type="button"
											className={`mm-admin-secondary mm-admin-danger ${buttonDark}`}
											aria-label={`${t('Delete the account')} (${user.name})`}
											onClick={() => onDelete(user)}
										>
											{t('Delete the account')}
										</button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{directory.users.length === 0 && <p className="mm-admin-note">{t('No accounts match this search.')}</p>}
			<div className="mm-admin-pagination">
				<button
					type="button"
					className={`mm-admin-secondary ${buttonDark}`}
					disabled={filters.page === 1}
					onClick={() => onPage(filters.page - 1)}
				>
					{t('Previous')}
				</button>
				<span>
					{t('Page')} {filters.page} / {Math.max(1, Math.ceil(directory.total / directory.pageSize))}
				</span>
				<button
					type="button"
					className={`mm-admin-secondary ${buttonDark}`}
					disabled={filters.page * directory.pageSize >= directory.total}
					onClick={() => onPage(filters.page + 1)}
				>
					{t('Next')}
				</button>
			</div>
			<p className="mm-admin-note">
				{t(
					'Every role change requires your password and is audited. The last administrator cannot be demoted. Private files remain protected by their owner.'
				)}
			</p>
		</section>
	)
}
