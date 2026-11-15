import { type ReactNode, useEffect, useMemo, useState, ViewTransition } from 'react'
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router'
import { useI18n } from '../i18n/I18n'
import { ConsolePalette } from '../pages/admin/ConsolePalette'
import { ConsoleContext, parsePeriod, periodHours, useConsoleData } from '../pages/admin/console'
import { type AdminAccess, hasAnyAdminAccess, useAdminAccess } from '../pages/admin-access'
import '../pages/admin-console.css'

type Capability = 'admin' | 'moderator' | 'operator'
/** Every administration page, in display order, with the capability that unlocks it (`null`: any of them). */
const adminSections: ReadonlyArray<{ path: string; end: boolean; capability: Capability | null }> = [
	{ path: '/admin', end: true, capability: null },
	{ path: '/admin/growth', end: false, capability: 'admin' },
	{ path: '/admin/users', end: false, capability: 'admin' },
	{ path: '/admin/worlds', end: false, capability: 'admin' },
	{ path: '/admin/moderation', end: false, capability: 'moderator' },
	{ path: '/admin/diagnostics', end: false, capability: 'operator' },
	{ path: '/admin/platform', end: false, capability: 'admin' },
]

type Badge = { count: number; tone: 'warn' | 'bad' } | null

export function AdminRail({ access, badges }: { access: AdminAccess; badges: Record<string, Badge> }) {
	const { t } = useI18n()
	if (!hasAnyAdminAccess(access)) return null
	const labels: Record<string, string> = {
		'/admin': t('Pulse'),
		'/admin/growth': t('Growth'),
		'/admin/users': t('Accounts'),
		'/admin/worlds': t('Worlds'),
		'/admin/moderation': t('Moderation'),
		'/admin/diagnostics': t('Health'),
		'/admin/platform': t('Platform'),
	}
	return (
		<nav className="mm-con-rail" aria-label={t('Administration sections')}>
			{adminSections
				.filter(section => section.capability === null || access[section.capability])
				.map(section => {
					const badge = badges[section.path]
					return (
						<NavLink key={section.path} to={section.path} end={section.end}>
							{labels[section.path]}
							{badge && badge.count > 0 && (
								<span className={`mm-con-count is-${badge.tone}`}>{badge.count.toLocaleString()}</span>
							)}
						</NavLink>
					)
				})}
		</nav>
	)
}

/** Shared frame of the administration routes: the rail, and the page beside it, which fades in on every navigation. */
export function AdminLayout() {
	const { t } = useI18n()
	const access = useAdminAccess()
	const { pathname } = useLocation()
	const [params, setParams] = useSearchParams()
	const { data, reload } = useConsoleData(access)
	const [paletteOpen, setPaletteOpen] = useState(false)
	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (!((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) return
			event.preventDefault()
			setPaletteOpen(true)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])
	const period = parsePeriod(params.get('period'))
	const compare = params.get('compare') !== '0'
	const value = useMemo(() => {
		const update = (key: string, next: string | null) =>
			setParams(
				previous => {
					const copy = new URLSearchParams(previous)
					if (next === null) copy.delete(key)
					else copy.set(key, next)
					return copy
				},
				{ replace: true }
			)
		return {
			access,
			period,
			hours: periodHours[period],
			setPeriod: (next: typeof period) => update('period', next === '30d' ? null : next),
			compare,
			setCompare: (next: boolean) => update('compare', next ? null : '0'),
			data,
			reload,
			openPalette: () => setPaletteOpen(true),
		}
	}, [access, period, compare, data, reload, setParams])
	const badges: Record<string, Badge> = {
		'/admin/moderation': data.queue ? { count: data.queue.pending + data.queue.reported, tone: 'warn' } : null,
		'/admin/diagnostics': data.openIssues ? { count: data.openIssues.count, tone: 'bad' } : null,
	}
	let page: ReactNode = <Outlet />
	if (access.ready && !hasAnyAdminAccess(access))
		page = (
			<section role="alert" className="mm-con-card">
				<h1>{t('Administrator access required')}</h1>
				<p className="mm-con-note">{t('Your account does not have these permissions.')}</p>
			</section>
		)
	return (
		<ConsoleContext.Provider value={value}>
			<div className="mm-con">
				{hasAnyAdminAccess(access) && (
					<ConsolePalette access={access} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
				)}
				<AdminRail access={access} badges={badges} />
				{!access.ready ? (
					<p role="status" className="mm-con-sub">
						{t('Loading the dashboard…')}
					</p>
				) : (
					<ViewTransition key={pathname} default="none" enter="mm-con-enter" exit="mm-con-exit">
						<div className="mm-con-main">{page}</div>
					</ViewTransition>
				)}
			</div>
		</ConsoleContext.Provider>
	)
}
