import { NavLink, Outlet, useOutletContext } from 'react-router'
import { useI18n } from '../i18n/I18n'
import { type AdminAccess, hasAnyAdminAccess, useAdminAccess } from '../pages/admin-access'
import '../pages/admin-hub.css'

/** Every administration section, in display order, with the capability that unlocks it. */
const adminSections = [
	{ path: '/admin', end: true, capability: null },
	{ path: '/admin/users', end: false, capability: 'admin' },
	{ path: '/admin/moderation', end: false, capability: 'moderator' },
	{ path: '/admin/diagnostics', end: false, capability: 'operator' },
] as const

export function AdminNav({ access }: { access: AdminAccess }) {
	const { t } = useI18n()
	if (!hasAnyAdminAccess(access)) return null
	const labels = {
		'/admin': t('Overview'),
		'/admin/users': t('Accounts and roles'),
		'/admin/moderation': t('Moderation'),
		'/admin/diagnostics': t('Diagnostics'),
	}
	return (
		<nav className="mm-admin-nav" aria-label={t('Administration sections')}>
			<ul>
				{adminSections
					.filter(section => section.capability === null || access[section.capability])
					.map(section => (
						<li key={section.path}>
							<NavLink to={section.path} end={section.end}>
								{labels[section.path]}
							</NavLink>
						</li>
					))}
			</ul>
		</nav>
	)
}

/** Shared frame of the administration routes: the section bar (only for accounts with a capability) above the page. */
export function AdminLayout() {
	const access = useAdminAccess()
	return (
		<>
			<AdminNav access={access} />
			<Outlet context={access} />
		</>
	)
}
export const useAdminOutletAccess = () => useOutletContext<AdminAccess>()
