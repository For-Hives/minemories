import type { AdminUser, AdminUserSort } from '@minemories/api-contract'
import { AnimatePresence, motion } from 'motion/react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { apiClient } from '../../api-client'
import { buttonDark } from '../../components/ui'
import { useI18n } from '../../i18n/I18n'
import { neighbour } from '../../lib/admin-insight'
import { formatBytes, formatExactBytes, quotaLevel, quotaPercent } from '../../lib/bytes'
import { AdminRoleDialog } from '../AdminRoleDialog'
import '../admin-dialog.css'
import { Group, Meter } from './AdminKit'
import { ConsoleHeader } from './ConsoleHeader'
import { useConsole } from './console'

type RoleFilter = 'all' | 'admin' | 'user'
const roleFilters: readonly RoleFilter[] = ['all', 'admin', 'user']
const sortChoices: readonly AdminUserSort[] = ['registered_desc', 'registered_asc', 'storage_desc', 'storage_asc']
type Directory = Awaited<ReturnType<typeof apiClient.admin.users>>

function useDirectory(query: string, role: RoleFilter, page: number, sort: AdminUserSort, revision: number) {
	const [directory, setDirectory] = useState<Directory | null>(null)
	const [failed, setFailed] = useState(false)
	useEffect(() => {
		const controller = new AbortController()
		setFailed(false)
		apiClient.admin
			.users({ query, role, page, sort }, { signal: controller.signal })
			.then(result => {
				if (!controller.signal.aborted) setDirectory(result)
			})
			.catch(() => {
				if (!controller.signal.aborted) setFailed(true)
			})
		return () => controller.abort()
	}, [query, role, page, sort, revision])
	return { directory, failed }
}

/** Search, role, sort, page and selection, read from (and written to) the address. */
function useAccountParams() {
	const [params, setParams] = useSearchParams()
	const set = (patch: Record<string, string | null>) =>
		setParams(
			previous => {
				const copy = new URLSearchParams(previous)
				for (const [key, value] of Object.entries(patch)) {
					if (value === null || value === '') copy.delete(key)
					else copy.set(key, value)
				}
				return copy
			},
			{ replace: true }
		)
	return {
		query: params.get('q') ?? '',
		role: roleFilters.find(value => value === params.get('role')) ?? 'all',
		sort: sortChoices.find(value => value === params.get('sort')) ?? 'registered_desc',
		page: Math.max(1, Number(params.get('page')) || 1),
		selectedId: params.get('user'),
		set,
	}
}

function AccountSheet({
	user,
	onClose,
	onRole,
	onDelete,
	canDemote,
}: {
	user: AdminUser
	onClose(): void
	onRole(): void
	onDelete(): void
	canDemote: boolean
}) {
	const { t, locale } = useI18n()
	const { data } = useConsole()
	const heading = useRef<HTMLHeadingElement>(null)
	useEffect(() => heading.current?.focus(), [])
	const activity = data.insights?.activity.users.find(row => row.id === user.id)
	const percent = quotaPercent(user.usedBytes, user.quotaBytes)
	const captures = Math.max(0, user.usedBytes - user.reservedBytes - user.pendingDeletionBytes)
	return (
		<motion.aside
			className="mm-con-sheet"
			aria-label={t('Account details')}
			initial={{ opacity: 0, x: 28 }}
			animate={{ opacity: 1, x: 0 }}
			exit={{ opacity: 0, x: 28 }}
			transition={{ type: 'spring', stiffness: 420, damping: 38 }}
		>
			<header>
				<div>
					<h2 ref={heading} tabIndex={-1}>
						{user.name}
					</h2>
					<p className="mm-con-hint">{user.email}</p>
					<div className="mm-con-chips" style={{ marginTop: 8 }}>
						<span className={`mm-con-tag ${user.emailVerified ? 'is-ok' : 'is-warn'}`}>
							{user.emailVerified ? t('Verified') : t('Not verified')}
						</span>
						<span className="mm-con-tag">{user.role === 'admin' ? t('Admin') : t('User')}</span>
						{activity && <span className="mm-con-tag">{t('Activity score {score}', { score: activity.score })}</span>}
					</div>
				</div>
				<button type="button" className="mm-con-chip" onClick={onClose}>
					{t('Close')}
				</button>
			</header>
			<div className="mm-con-sheet-body">
				<h3>{t('Storage')}</h3>
				<Meter
					label={t('Storage of {name}', { name: user.name })}
					total={user.quotaBytes}
					parts={[
						{
							label: t('Captures'),
							value: captures,
							tone: quotaLevel(percent) === 'ok' ? 'ember' : 'bad',
							text: formatBytes(captures, locale),
						},
						{
							label: t('Reserved uploads'),
							value: user.reservedBytes,
							tone: 'info',
							text: formatBytes(user.reservedBytes, locale),
						},
						{
							label: t('Pending deletion'),
							value: user.pendingDeletionBytes,
							tone: 'lore',
							text: formatBytes(user.pendingDeletionBytes, locale),
						},
					]}
				/>
				<p className="mm-con-note">
					{t('{used} of {quota} used ({percent}%)', {
						used: formatBytes(user.usedBytes, locale),
						quota: formatBytes(user.quotaBytes, locale),
						percent,
					})}{' '}
					· {formatExactBytes(user.usedBytes, locale)}
				</p>
				<h3>{t('Account')}</h3>
				<dl className="mm-con-kv">
					<dt>{t('Registered')}</dt>
					<dd>{new Date(user.createdAt).toLocaleDateString(locale)}</dd>
					<dt>{t('Captures')}</dt>
					<dd>{user.captures.toLocaleString(locale)}</dd>
					<dt>{t('Paired devices')}</dt>
					<dd>{user.devices.toLocaleString(locale)}</dd>
					{activity && (
						<>
							<dt>{t('Logins')}</dt>
							<dd>{activity.logins.toLocaleString(locale)}</dd>
							<dt>{t('Captures uploaded')}</dt>
							<dd>{activity.uploads.toLocaleString(locale)}</dd>
							{activity.lastActiveAt && (
								<>
									<dt>{t('Last active')}</dt>
									<dd>{new Date(activity.lastActiveAt).toLocaleDateString(locale)}</dd>
								</>
							)}
						</>
					)}
				</dl>
				<h3>{t('Sensitive actions')}</h3>
				<p className="mm-con-note">{t('Both ask for your password. Private files stay with their owner.')}</p>
				<div className="mm-con-chips">
					<button type="button" className={buttonDark} disabled={user.role === 'admin' && !canDemote} onClick={onRole}>
						{user.role === 'admin' ? t('Remove admin role') : t('Promote to admin')}
					</button>
					{user.role !== 'admin' && (
						<button type="button" className={buttonDark} onClick={onDelete}>
							{t('Delete the account')}
						</button>
					)}
				</div>
			</div>
		</motion.aside>
	)
}

/** `/admin/users`: the accounts as a list with a sheet beside it. The selection, search, role, sort and page live in the address. */
export function AdminAccounts() {
	const { t, locale } = useI18n()
	const { data, reload } = useConsole()
	const { query, role, sort, page, selectedId, set } = useAccountParams()
	const [revision, setRevision] = useState(0)
	const [text, setText] = useState(query)
	const [dialog, setDialog] = useState<{ mode: 'role' | 'delete'; user: AdminUser } | null>(null)
	const { directory, failed } = useDirectory(query, role, page, sort, revision + data.loads)
	useEffect(() => {
		if (text === query) return
		const timer = setTimeout(() => set({ q: text, page: null, user: null }), 300)
		return () => clearTimeout(timer)
	}, [text, query])
	const users = directory?.users ?? []
	const selected = users.find(user => user.id === selectedId) ?? null
	const admins = data.summary?.totals.admins ?? 0
	function move(event: KeyboardEvent) {
		if (event.key === 'Escape') return set({ user: null })
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
		event.preventDefault()
		const next = neighbour(users, selectedId, event.key === 'ArrowDown' ? 1 : -1)
		if (next) set({ user: next.id })
	}
	const roleLabels: Record<RoleFilter, string> = {
		all: t('filters.allStates'),
		admin: t('Administrators'),
		user: t('Users'),
	}
	const sorts: Array<[AdminUserSort, string]> = [
		['registered_desc', t('Newest first')],
		['storage_desc', t('Most storage used')],
		['registered_asc', t('Oldest first')],
		['storage_asc', t('Least storage used')],
	]
	const done = () => {
		setDialog(null)
		setRevision(value => value + 1)
		reload()
	}
	return (
		<>
			<ConsoleHeader title={t('Accounts')} lead={t('Find an account, see everything about it, act on it.')} />
			<div className="mm-con-split">
				<section className="mm-con-card is-list">
					<div className="mm-con-bar" style={{ marginBottom: 16 }}>
						<label className="mm-con-field" style={{ flex: '1 1 240px' }}>
							{t('Find an account')}
							<input
								value={text}
								onChange={event => setText(event.target.value)}
								placeholder={t('Name, email or ID')}
								maxLength={100}
							/>
						</label>
						<Group className="mm-con-seg" label={t('Sort by')}>
							{sorts.slice(0, 2).map(([value, label]) => (
								<button
									key={value}
									type="button"
									aria-pressed={sort === value}
									onClick={() => set({ sort: value === 'registered_desc' ? null : value, page: null })}
								>
									{label}
								</button>
							))}
						</Group>
					</div>
					<Group className="mm-con-chips" label={t('Role')} style={{ marginBottom: 16 }}>
						{roleFilters.map(value => (
							<button
								key={value}
								type="button"
								className="mm-con-chip"
								aria-pressed={role === value}
								onClick={() => set({ role: value === 'all' ? null : value, page: null })}
							>
								{roleLabels[value]}
								{value === 'all' && directory && ` ${directory.overview.accounts.toLocaleString(locale)}`}
								{value === 'admin' && ` ${admins.toLocaleString(locale)}`}
							</button>
						))}
						{directory && directory.overview.nearQuotaAccounts > 0 && (
							<button
								type="button"
								className="mm-con-chip"
								aria-pressed={sort === 'storage_desc'}
								onClick={() => set({ sort: 'storage_desc', page: null })}
							>
								{t('Accounts near their quota')} {directory.overview.nearQuotaAccounts}
							</button>
						)}
					</Group>
					{failed && <p role="alert">{t('Could not load the dashboard. Try Refresh again.')}</p>}
					{!(directory || failed) && <p role="status">{t('Loading the dashboard…')}</p>}
					{directory && (
						// biome-ignore lint/a11y/noStaticElementInteractions: arrow keys move the selection between the rows' buttons
						<div className="mm-con-table-wrap" onKeyDown={move}>
							<table className="mm-con-table">
								<thead>
									<tr>
										<th>{t('Account')}</th>
										<th>{t('Storage')}</th>
										<th className="is-num">{t('Captures')}</th>
										<th>{t('Registered')}</th>
									</tr>
								</thead>
								<tbody>
									{users.map(user => {
										const percent = quotaPercent(user.usedBytes, user.quotaBytes)
										const level = quotaLevel(percent)
										return (
											<tr key={user.id} aria-selected={user.id === selectedId}>
												<td>
													<button type="button" className="is-open" onClick={() => set({ user: user.id })}>
														<strong>
															{user.name} {user.role === 'admin' && <span className="mm-con-tag">{t('Admin')}</span>}
														</strong>
														<small>{user.email}</small>
													</button>
												</td>
												<td>
													<div className="mm-con-meter" role="presentation">
														<i
															className={level === 'ok' ? 'is-tone-ember' : 'is-tone-bad'}
															style={{ width: `${percent}%` }}
														/>
													</div>
													<small>
														{percent}% · {formatBytes(user.usedBytes, locale)}
														{level !== 'ok' && ` · ${level === 'full' ? t('Quota reached') : t('Near quota')}`}
													</small>
												</td>
												<td className="is-num">{user.captures.toLocaleString(locale)}</td>
												<td>{new Date(user.createdAt).toLocaleDateString(locale)}</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					)}
					{directory && users.length === 0 && <p className="mm-con-note">{t('No accounts match this search.')}</p>}
					{directory && (
						<div className="mm-con-bar" style={{ marginTop: 16 }}>
							<p className="mm-con-keys">
								<kbd>↑</kbd> <kbd>↓</kbd> {t('move')} · <kbd>Esc</kbd> {t('Close')}
							</p>
							<div className="mm-con-chips">
								<button
									type="button"
									className="mm-con-chip"
									disabled={page === 1}
									onClick={() => set({ page: page === 2 ? null : String(page - 1) })}
								>
									{t('Previous')}
								</button>
								<span className="mm-con-live">
									{t('Page')} {page} / {Math.max(1, Math.ceil(directory.total / directory.pageSize))}
								</span>
								<button
									type="button"
									className="mm-con-chip"
									disabled={page * directory.pageSize >= directory.total}
									onClick={() => set({ page: String(page + 1) })}
								>
									{t('Next')}
								</button>
							</div>
						</div>
					)}
				</section>
				<div className="is-sheet">
					<AnimatePresence mode="wait">
						{selected && (
							<AccountSheet
								key={selected.id}
								user={selected}
								canDemote={admins > 1}
								onClose={() => set({ user: null })}
								onRole={() => setDialog({ mode: 'role', user: selected })}
								onDelete={() => setDialog({ mode: 'delete', user: selected })}
							/>
						)}
					</AnimatePresence>
				</div>
			</div>
			{dialog && (
				<AdminRoleDialog
					{...(dialog.mode === 'delete' ? { mode: 'delete' as const } : {})}
					target={dialog.user}
					onClose={() => setDialog(null)}
					onSuccess={done}
				/>
			)}
		</>
	)
}
