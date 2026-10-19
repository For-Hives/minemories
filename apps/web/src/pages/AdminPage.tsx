import type { AdminSummary, AdminUser } from '@minemories/api-contract'
import { type SyntheticEvent, useState } from 'react'
import { Link } from 'react-router'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'
import { AdminCharts, gigabytes } from './AdminCharts'
import { AdminRoleDialog } from './AdminRoleDialog'
import { type AdminDataset, useAdminData } from './admin-data'
import './admin.css'

type RoleFilter = 'all' | 'user' | 'admin'
function Totals({ data }: { data: AdminSummary }) {
	const { copy, locale } = useLocalizedCopy()
	const cards = [
		{
			label: copy('Comptes actuels', 'Current accounts'),
			value: data.totals.users.toLocaleString(locale),
			note: copy('sur le service', 'on the service'),
		},
		{
			label: copy('Captures finalisées', 'Completed captures'),
			value: data.period.uploads.toLocaleString(locale),
			note: copy('sur la période', 'during the period'),
		},
		{
			label: copy('Volume finalisé', 'Completed volume'),
			value: `${gigabytes(data.period.uploadedBytes, locale)} ${copy('Go', 'GB')}`,
			note: copy('sur la période', 'during the period'),
		},
		{
			label: copy('Stockage logique', 'Logical storage'),
			value: `${gigabytes(data.totals.storedBytes, locale)} ${copy('Go', 'GB')}`,
			note: copy('captures et corbeille', 'captures and trash'),
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
	const { copy, locale } = useLocalizedCopy()
	const rows = [
		[copy('Administrateurs', 'Administrators'), data.admins.toLocaleString(locale)],
		[copy('Sessions valides', 'Valid sessions'), data.sessions.toLocaleString(locale)],
		[copy('Appareils associés', 'Paired devices'), data.devices.toLocaleString(locale)],
		[copy('Publications approuvées', 'Approved publications'), data.publicCaptures.toLocaleString(locale)],
		[copy('Corbeille', 'Trash'), `${gigabytes(data.trashBytes, locale)} ${copy('Go', 'GB')}`],
		[
			copy('Effacement en attente', 'Pending deletion'),
			`${gigabytes(data.pendingDeletionBytes, locale)} ${copy('Go', 'GB')}`,
		],
		[copy('Uploads réservés', 'Reserved uploads'), `${gigabytes(data.reservedBytes, locale)} ${copy('Go', 'GB')}`],
		[copy('Objets archivés', 'Archived objects'), data.coldObjects.toLocaleString(locale)],
		[copy('Objets en restauration', 'Objects restoring'), data.restoringObjects.toLocaleString(locale)],
	]
	return (
		<section className="mm-admin-card">
			<h2>{copy('État du service', 'Service overview')}</h2>
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
function Directory({
	directory,
	admins,
	filters,
	onSearch,
	onPage,
	onSelect,
}: {
	directory: AdminDataset['directory']
	admins: number
	filters: { query: string; role: RoleFilter; page: number }
	onSearch(query: string, role: RoleFilter): void
	onPage(page: number): void
	onSelect(user: AdminUser): void
}) {
	const { copy, locale } = useLocalizedCopy()
	function search(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		const data = new FormData(event.currentTarget)
		onSearch(String(data.get('query') ?? ''), String(data.get('role')) as RoleFilter)
	}
	return (
		<section className="mm-admin-card mm-admin-directory">
			<div className="mm-admin-card-title">
				<h2>{copy('Utilisateurs et accès', 'Users and access')}</h2>
				<span>
					{directory.total.toLocaleString(locale)} {copy('comptes', 'accounts')}
				</span>
			</div>
			<form className="mm-admin-search" onSubmit={search}>
				<label>
					{copy('Rechercher un compte', 'Find an account')}
					<input
						name="query"
						defaultValue={filters.query}
						placeholder={copy('Nom, e-mail ou identifiant', 'Name, email or ID')}
						maxLength={100}
					/>
				</label>
				<label>
					{copy('Rôle', 'Role')}
					<select name="role" defaultValue={filters.role}>
						<option value="all">{copy('Tous', 'All')}</option>
						<option value="admin">{copy('Administrateurs', 'Administrators')}</option>
						<option value="user">{copy('Utilisateurs', 'Users')}</option>
					</select>
				</label>
				<button type="submit" className="mm-admin-secondary">
					{copy('Rechercher', 'Search')}
				</button>
			</form>
			<div className="mm-admin-table-wrap">
				<table>
					<thead>
						<tr>
							<th>{copy('Compte', 'Account')}</th>
							<th>{copy('Rôle', 'Role')}</th>
							<th>{copy('Inscription', 'Registered')}</th>
							<th>{copy('Captures', 'Captures')}</th>
							<th>{copy('Stockage', 'Storage')}</th>
							<th>{copy('Actions', 'Actions')}</th>
						</tr>
					</thead>
					<tbody>
						{directory.users.map(user => (
							<tr key={user.id}>
								<td>
									<strong>{user.name}</strong>
									<small>{user.email}</small>
								</td>
								<td>
									<span className={`mm-admin-role ${user.role === 'admin' ? 'is-admin' : ''}`}>
										{user.role === 'admin' ? copy('Admin', 'Admin') : copy('Utilisateur', 'User')}
									</span>
								</td>
								<td>{new Date(user.createdAt).toLocaleDateString(locale)}</td>
								<td>{user.captures.toLocaleString(locale)}</td>
								<td>
									{gigabytes(user.storedBytes, locale)} {copy('Go', 'GB')}
								</td>
								<td>
									<button
										type="button"
										className="mm-admin-secondary"
										disabled={user.role === 'admin' && admins <= 1}
										onClick={() => onSelect(user)}
									>
										{user.role === 'admin'
											? copy('Retirer le rôle admin', 'Remove admin role')
											: copy('Promouvoir admin', 'Promote to admin')}
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{directory.users.length === 0 && (
				<p className="mm-admin-note">
					{copy('Aucun compte ne correspond à cette recherche.', 'No accounts match this search.')}
				</p>
			)}
			<div className="mm-admin-pagination">
				<button
					type="button"
					className="mm-admin-secondary"
					disabled={filters.page === 1}
					onClick={() => onPage(filters.page - 1)}
				>
					{copy('Précédent', 'Previous')}
				</button>
				<span>
					{copy('Page', 'Page')} {filters.page} / {Math.max(1, Math.ceil(directory.total / directory.pageSize))}
				</span>
				<button
					type="button"
					className="mm-admin-secondary"
					disabled={filters.page * directory.pageSize >= directory.total}
					onClick={() => onPage(filters.page + 1)}
				>
					{copy('Suivant', 'Next')}
				</button>
			</div>
			<p className="mm-admin-note">
				{copy(
					'Chaque changement de rôle exige ton mot de passe et laisse une trace. Le dernier administrateur ne peut pas être rétrogradé. Les fichiers privés restent protégés par leur propriétaire.',
					'Every role change requires your password and is audited. The last administrator cannot be demoted. Private files remain protected by their owner.'
				)}
			</p>
		</section>
	)
}
function Audit({ rows }: { rows: AdminDataset['audit'] }) {
	const { copy, locale } = useLocalizedCopy()
	return (
		<section className="mm-admin-card">
			<h2>{copy('Journal des accès', 'Access audit')}</h2>
			<p>{copy('Les 50 derniers changements de rôle.', 'The latest 50 role changes.')}</p>
			{rows.length === 0 ? (
				<p>{copy('Aucun changement enregistré.', 'No changes recorded.')}</p>
			) : (
				<ol className="mm-admin-audit">
					{rows.map(row => (
						<li key={row.id}>
							<span className="mm-admin-audit-dot" />
							<div>
								<strong>{row.targetName ?? copy('Compte supprimé', 'Deleted account')}</strong>
								<p>
									{row.role === 'admin'
										? copy('Accès administrateur accordé', 'Administrator access granted')
										: copy('Accès administrateur retiré', 'Administrator access removed')}{' '}
									· {row.actorName ?? copy('Console serveur', 'Server console')}
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
	const { copy } = useLocalizedCopy()
	const [filters, setFilters] = useState({ hours: 24 as 24 | 168 | 720, query: '', role: 'all' as RoleFilter, page: 1 })
	const [target, setTarget] = useState<AdminUser | null>(null)
	const load = useAdminData(filters)
	return (
		<section className="mm-content mm-admin-page">
			<header className="mm-admin-heading">
				<div>
					<span className="mm-kicker">MINEMORIES / {copy('ADMINISTRATION', 'ADMINISTRATION')}</span>
					<h1>{copy('La vue d’ensemble.', 'The bigger picture.')}</h1>
					<p>
						{copy(
							'Le service, ses comptes et ses captures, au même endroit.',
							'The service, its accounts and its captures, in one place.'
						)}
					</p>
					<Link to="/account">← {copy('Mon compte', 'My account')}</Link>
				</div>
				<div className="mm-admin-controls">
					<label>
						{copy('Période', 'Period')}
						<select
							aria-label={copy('Période', 'Period')}
							value={filters.hours}
							onChange={event =>
								setFilters(previous => ({ ...previous, hours: Number(event.target.value) as 24 | 168 | 720 }))
							}
						>
							<option value={24}>{copy('24 heures', '24 hours')}</option>
							<option value={168}>{copy('7 jours', '7 days')}</option>
							<option value={720}>{copy('30 jours', '30 days')}</option>
						</select>
					</label>
					<button type="button" className="mm-admin-primary" onClick={load.reload} disabled={load.kind === 'loading'}>
						{copy('Actualiser', 'Refresh')}
					</button>
				</div>
			</header>
			{load.kind === 'loading' && (
				<p role="status" className="mm-admin-note">
					{copy('Chargement du tableau de bord…', 'Loading the dashboard…')}
				</p>
			)}
			{load.kind === 'denied' && (
				<section role="alert" className="mm-admin-card">
					<h2>{copy('Accès réservé aux administrateurs', 'Administrator access required')}</h2>
					<p>{copy('Ton compte ne dispose pas de ces droits.', 'Your account does not have these permissions.')}</p>
				</section>
			)}
			{load.kind === 'error' && (
				<p role="alert" className="mm-admin-error">
					{copy(
						'Impossible de charger le tableau de bord. Réessaie avec Actualiser.',
						'Could not load the dashboard. Try Refresh again.'
					)}
				</p>
			)}
			{load.kind === 'ready' && (
				<>
					<Totals data={load.data.summary} />
					<AdminCharts summary={load.data.summary} />
					<Directory
						directory={load.data.directory}
						admins={load.data.summary.totals.admins}
						filters={filters}
						onSearch={(query, role) => setFilters(previous => ({ ...previous, query, role, page: 1 }))}
						onPage={page => setFilters(previous => ({ ...previous, page }))}
						onSelect={setTarget}
					/>
					<div className="mm-admin-lower">
						<Operations data={load.data.summary.totals} />
						<Audit rows={load.data.audit} />
					</div>
				</>
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
