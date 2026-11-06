import { Link } from 'react-router'
import { useI18n } from '../i18n/I18n'
import { hasAnyAdminAccess, useAdminAccess } from '../pages/admin-access'
import { buttonDark } from './ui'

/** The account page entry: shown to administrators, moderators and diagnostics operators, once the server has said so. */
export function AdminAccessLink() {
	const { t } = useI18n(),
		access = useAdminAccess()
	return hasAnyAdminAccess(access) ? (
		<Link className={`mm-admin-entry ${buttonDark}`} to="/admin">
			{t('Open administration dashboard')} →
		</Link>
	) : null
}
