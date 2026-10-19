import type { AdminUser } from '@minemories/api-contract'
import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { useI18n } from '../i18n/I18n'

function roleError(cause: unknown, t: ReturnType<typeof useI18n>['t']): string {
	const message = cause instanceof Error ? cause.message : ''
	if (message === 'LAST_ADMIN') return t('The last administrator must keep their role.')
	return t('Action denied. Check your password and permissions, then try again.')
}
export function AdminRoleDialog({
	target,
	onClose,
	onSuccess,
}: {
	target: AdminUser
	onClose(): void
	onSuccess(): void
}) {
	const { t } = useI18n(),
		dialog = useRef<HTMLDialogElement>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(''),
		active = useRef(true)
	const role = target.role === 'admin' ? 'user' : 'admin'
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
			await apiClient.admin.setRole({ userId: target.id, role, currentPassword })
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
				<span className="mm-kicker">{t('ACCESS MANAGEMENT')}</span>
				<h2 id="role-dialog-title">
					{role === 'admin' ? t('Promote this account?') : t('Remove administrator access?')}
				</h2>
				<p>
					<strong>{target.name}</strong>
					<br />
					{target.email}
				</p>
				<p>
					{role === 'admin'
						? t('This account will be able to view statistics and manage administrators.')
						: t('This account keeps its memories and loses access to this panel.')}
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
					<button type="button" className="mm-admin-secondary" onClick={onClose} disabled={busy}>
						{t('Cancel')}
					</button>
					<button type="submit" className="mm-admin-primary" disabled={busy}>
						{busy ? t('Saving…') : t('Confirm change')}
					</button>
				</div>
			</form>
		</dialog>
	)
}
