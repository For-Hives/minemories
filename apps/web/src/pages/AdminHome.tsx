import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { useAdminOutletAccess } from '../components/AdminLayout'
import { useI18n } from '../i18n/I18n'
import { hasAnyAdminAccess } from './admin-access'
import './admin.css'
import './admin-hub.css'

type Queue = { pending: number; reported: number }

/** `/admin`: one card per section the account may open; the moderation card also counts what is waiting. */
export function AdminHome() {
	const { t, locale } = useI18n(),
		access = useAdminOutletAccess(),
		[queue, setQueue] = useState<Queue | null>(null),
		moderator = access.moderator
	useEffect(() => {
		let live = true
		setQueue(null)
		if (moderator)
			void apiClient.discovery
				.queueSummary()
				.then(summary => {
					if (live) setQueue(summary)
				})
				.catch(() => undefined)
		return () => {
			live = false
		}
	}, [moderator])
	const cards = [
		{
			to: '/admin/users',
			allowed: access.admin,
			title: t('Accounts and roles'),
			text: t('Service figures, accounts, storage and administrator roles.'),
			note: null,
		},
		{
			to: '/admin/moderation',
			allowed: access.moderator,
			title: t('Moderation'),
			text: t('Approve or reject submitted publications and review reports.'),
			note: queue
				? [
						t('{count} waiting for review', { count: queue.pending.toLocaleString(locale) }),
						t('{count} reported', { count: queue.reported.toLocaleString(locale) }),
					].join(' · ')
				: null,
		},
		{
			to: '/admin/diagnostics',
			allowed: access.operator,
			title: t('Diagnostics'),
			text: t('Failed exports, interrupted uploads and crashes reported by the mod with consent.'),
			note: null,
		},
	].filter(card => card.allowed)
	return (
		<section className="mm-content mm-admin-page">
			<header className="mm-admin-heading">
				<div>
					<span className="mm-kicker">MINEMORIES / {t('ADMINISTRATION')}</span>
					<h1>{t('Administration')}</h1>
					<p>{t('Everything that keeps the service running, one section at a time.')}</p>
					<Link to="/account">← {t('My account')}</Link>
				</div>
			</header>
			{!access.ready && (
				<p role="status" className="mm-admin-note">
					{t('Loading the dashboard…')}
				</p>
			)}
			{access.ready && !hasAnyAdminAccess(access) && (
				<section role="alert" className="mm-admin-card">
					<h2>{t('Administrator access required')}</h2>
					<p>{t('Your account does not have these permissions.')}</p>
				</section>
			)}
			{cards.length > 0 && (
				<ul className="mm-admin-hub-cards">
					{cards.map(card => (
						<li className="mm-admin-hub-card" key={card.to}>
							<h2>
								<Link to={card.to}>{card.title}</Link>
							</h2>
							<p>{card.text}</p>
							{card.note && <strong>{card.note}</strong>}
						</li>
					))}
				</ul>
			)}
		</section>
	)
}
