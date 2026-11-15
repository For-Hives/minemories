import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { apiClient } from '../../api-client'
import { useI18n } from '../../i18n/I18n'
import { matchEntries, neighbour } from '../../lib/admin-insight'
import type { AdminAccess } from '../admin-access'

type Entry = { id: string; label: string; hint: string; to: string }

/** Ctrl+K (or Cmd+K): jump to a page, or to an account found by name or e-mail. */
export function ConsolePalette({ access, open, onClose }: { access: AdminAccess; open: boolean; onClose(): void }) {
	const { t } = useI18n()
	const navigate = useNavigate()
	const dialog = useRef<HTMLDialogElement>(null)
	const [text, setText] = useState('')
	const [accounts, setAccounts] = useState<Entry[]>([])
	const [active, setActive] = useState<string | null>(null)
	useEffect(() => {
		const element = dialog.current
		if (!element) return
		if (open && !element.open) element.showModal()
		if (!open && element.open) element.close()
		if (open) setText('')
	}, [open])
	useEffect(() => {
		if (!(open && access.admin && text.trim().length >= 2)) {
			setAccounts([])
			return
		}
		const controller = new AbortController()
		const timer = setTimeout(() => {
			apiClient.admin
				.users({ query: text.trim(), role: 'all', page: 1 }, { signal: controller.signal })
				.then(result =>
					setAccounts(
						result.users.slice(0, 6).map(user => ({
							id: `user-${user.id}`,
							label: user.name,
							hint: user.email,
							to: `/admin/users?user=${encodeURIComponent(user.id)}&q=${encodeURIComponent(user.name)}`,
						}))
					)
				)
				.catch(() => setAccounts([]))
		}, 200)
		return () => {
			clearTimeout(timer)
			controller.abort()
		}
	}, [open, access.admin, text])
	const pages: Entry[] = [
		{ id: 'pulse', label: t('Pulse'), hint: '/admin', to: '/admin', ok: true },
		{ id: 'growth', label: t('Growth'), hint: '/admin/growth', to: '/admin/growth', ok: access.admin },
		{ id: 'accounts', label: t('Accounts'), hint: '/admin/users', to: '/admin/users', ok: access.admin },
		{ id: 'worlds', label: t('Worlds'), hint: '/admin/worlds', to: '/admin/worlds', ok: access.admin },
		{
			id: 'moderation',
			label: t('Moderation'),
			hint: '/admin/moderation',
			to: '/admin/moderation',
			ok: access.moderator,
		},
		{ id: 'health', label: t('Health'), hint: '/admin/diagnostics', to: '/admin/diagnostics', ok: access.operator },
		{ id: 'platform', label: t('Platform'), hint: '/admin/platform', to: '/admin/platform', ok: access.admin },
	]
		.filter(page => page.ok)
		.map(({ ok: _ok, ...page }) => page)
	const entries = [...matchEntries(pages, text), ...accounts]
	const current = entries.find(entry => entry.id === active) ?? entries[0]
	function go(entry: Entry | undefined) {
		if (!entry) return
		onClose()
		navigate(entry.to)
	}
	function key(event: React.KeyboardEvent) {
		if (event.key === 'Enter') return go(current)
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
		event.preventDefault()
		const next = neighbour(entries, current?.id ?? null, event.key === 'ArrowDown' ? 1 : -1)
		if (next) setActive(next.id)
	}
	return (
		<dialog ref={dialog} className="mm-con-palette" aria-label={t('Jump to…')} onClose={onClose} onKeyDown={key}>
			<input
				value={text}
				onChange={event => setText(event.target.value)}
				placeholder={t('Search pages and accounts')}
				aria-label={t('Search pages and accounts')}
			/>
			{entries.length === 0 ? (
				<p className="mm-con-note">{t('No match.')}</p>
			) : (
				<ul>
					{entries.map(entry => (
						<li key={entry.id}>
							<button type="button" aria-current={entry.id === current?.id} onClick={() => go(entry)}>
								<strong>{entry.label}</strong>
								<small>{entry.hint}</small>
							</button>
						</li>
					))}
				</ul>
			)}
		</dialog>
	)
}
