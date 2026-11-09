import type { AdminUser } from '@minemories/api-contract'
import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { buttonDark, buttonLime } from '../components/ui'
import { useI18n } from '../i18n/I18n'

function roleError(cause: unknown, t: ReturnType<typeof useI18n>['t']): string {
	const message = cause instanceof Error ? cause.message : ''
	if (message === 'LAST_ADMIN') return t('The last administrator must keep their role.')
	if (message === 'SELF_DELETE') return t('You cannot delete your own account from here.')
	if (message === 'ADMIN_ACCOUNT') return t('Remove administrator access before deleting this account.')
	return t('Action denied. Check your password and permissions, then try again.')
}
export function AdminRoleDialog({
	target,
	mode = 'role',
	onClose,
	onSuccess,
}: {
	target: AdminUser
	/** `delete` permanently removes the account and its captures instead of changing its role. */
	mode?: 'role' | 'delete'
	onClose(): void
	onSuccess(): void
}) {
	const { t } = useI18n(),
		dialog = useRef<HTMLDialogElement>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(''),
		active = useRef(true)
	const role = target.role === 'admin' ? 'user' : 'admin'
	const confirmLabel = mode === 'delete' ? t('Delete the account') : t('Confirm change')
	useEffect(() => {
		active.current = true
		const element = dialog.current
		element?.showModal()
		return () => {
			active.current = false
			element?.close()
		}
	}, [])
	async function submit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		if (busy) return
		const form = event.currentTarget,
			currentPassword = String(new FormData(form).get('currentPassword') ?? '')
		setBusy(true)
		setError('')
		try {
			if (mode === 'delete') await apiClient.admin.deleteUser({ userId: target.id, currentPassword })
			else await apiClient.admin.setRole({ userId: target.id, role, currentPassword })
			form.reset()
			if (active.current) onSuccess()
		} catch (cause) {
			if (!active.current) return
			setError(roleError(cause, t))
		} finally {
			if (active.current) setBusy(false)
		}
	}
	return (
		<dialog
			ref={dialog}
			className="mm-admin-dialog"
			aria-labelledby="role-dialog-title"
			onCancel={event => {
				if (busy) event.preventDefault()
				else onClose()
			}}
		>
			<form onSubmit={event => void submit(event)}>
				<span className="mm-kicker">{mode === 'delete' ? t('ACCOUNT DELETION') : t('ACCESS MANAGEMENT')}</span>
				<h2 id="role-dialog-title">
					{mode === 'delete' && t('Delete this account?')}
					{mode === 'role' && (role === 'admin' ? t('Promote this account?') : t('Remove administrator access?'))}
				</h2>
				<p className="mm-admin-dialog-target">
					<small>{t('Account concerned')}</small>
					<strong>{target.name}</strong>
					<span>{target.email}</span>
				</p>
				<p>
					{mode === 'delete' &&
						t('The account, its captures, share links and devices are deleted for good. This cannot be undone.')}
					{mode === 'role' &&
						(role === 'admin'
							? t('This account will be able to view statistics and manage administrators.')
							: t('This account keeps its memories and loses access to this panel.'))}
				</p>
				<label>
					{t('Your current password')}
					<input
						name="currentPassword"
						type="password"
						autoComplete="current-password"
						required
						maxLength={128}
						disabled={busy}
					/>
				</label>
				{error && (
					<p role="alert" className="mm-admin-error">
						{error}
					</p>
				)}
				<div className="mm-admin-dialog-actions">
					<button type="button" className={`mm-admin-secondary ${buttonDark}`} onClick={onClose} disabled={busy}>
						{t('Cancel')}
					</button>
					<button type="submit" className={`mm-admin-primary ${buttonLime}`} disabled={busy}>
						{busy ? t('Saving…') : confirmLabel}
					</button>
				</div>
			</form>
		</dialog>
	)
}
