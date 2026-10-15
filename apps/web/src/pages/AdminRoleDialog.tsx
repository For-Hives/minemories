import type { AdminUser } from '@minemories/api-contract'
import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'

function roleError(cause: unknown, copy: ReturnType<typeof useLocalizedCopy>['copy']): string {
	const message = cause instanceof Error ? cause.message : ''
	if (message === 'LAST_ADMIN')
		return copy('Le dernier administrateur doit conserver son rôle.', 'The last administrator must keep their role.')
	return copy(
		'Action refusée. Vérifie ton mot de passe et tes droits, puis réessaie.',
		'Action denied. Check your password and permissions, then try again.'
	)
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
	const { copy } = useLocalizedCopy(),
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
			setError(roleError(cause, copy))
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
				<span className="mm-kicker">{copy('GESTION DES ACCÈS', 'ACCESS MANAGEMENT')}</span>
				<h2 id="role-dialog-title">
					{role === 'admin'
						? copy('Promouvoir ce compte ?', 'Promote this account?')
						: copy('Retirer le rôle administrateur ?', 'Remove administrator access?')}
				</h2>
				<p>
					<strong>{target.name}</strong>
					<br />
					{target.email}
				</p>
				<p>
					{role === 'admin'
						? copy(
								'Ce compte pourra consulter les statistiques et gérer les administrateurs.',
								'This account will be able to view statistics and manage administrators.'
							)
						: copy(
								'Ce compte conserve ses souvenirs et perd l’accès à ce panneau.',
								'This account keeps its memories and loses access to this panel.'
							)}
				</p>
				<label>
					{copy('Ton mot de passe actuel', 'Your current password')}
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
						{copy('Annuler', 'Cancel')}
					</button>
					<button type="submit" className="mm-admin-primary" disabled={busy}>
						{busy ? copy('Enregistrement…', 'Saving…') : copy('Confirmer le changement', 'Confirm change')}
					</button>
				</div>
			</form>
		</dialog>
	)
}
