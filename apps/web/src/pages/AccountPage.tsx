import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { AdminAccessLink } from '../components/AdminAccessLink'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'
import { credentialChangeComplete } from './account-navigation'
import './account.css'

type Kind = 'email' | 'password'
function errorCode(error: unknown): string {
	return error !== null && typeof error === 'object' && 'message' in error ? String(error.message) : ''
}
function requestChange(kind: Kind, data: FormData) {
	const currentPassword = String(data.get('currentPassword') ?? '')
	if (kind === 'email')
		return apiClient.account.changeEmail({ email: String(data.get('email') ?? '').trim(), currentPassword })
	return apiClient.account.changePassword({ currentPassword, newPassword: String(data.get('newPassword') ?? '') })
}
function passwordsMatch(kind: Kind, data: FormData): boolean {
	return kind !== 'password' || data.get('newPassword') === data.get('confirmation')
}
type Copy = ReturnType<typeof useLocalizedCopy>['copy']
function accountError(cause: unknown, copy: Copy): string {
	const code = errorCode(cause)
	if (code === 'CURRENT_PASSWORD_INVALID')
		return copy('Le mot de passe actuel est incorrect.', 'The current password is incorrect.')
	if (code === 'EMAIL_UNAVAILABLE')
		return copy('Cette adresse e-mail ne peut pas être utilisée.', 'This email address cannot be used.')
	return copy(
		'Modification impossible. Vérifie ta connexion et réessaie ; reconnecte-toi si ta session a expiré.',
		'Could not update your account. Check your connection and try again; sign in if your session expired.'
	)
}
export function AccountPage() {
	const { session } = useAppContext()
	const { copy } = useLocalizedCopy()
	const [pending, setPending] = useState<Kind | null>(null)
	const [error, setError] = useState('')
	const busy = useRef(false),
		alive = useRef(true)
	useEffect(() => {
		alive.current = true
		return () => {
			alive.current = false
		}
	}, [])
	async function submit(kind: Kind, event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		if (busy.current) return
		const form = event.currentTarget,
			data = new FormData(form)
		if (!passwordsMatch(kind, data)) {
			setError(copy('Les nouveaux mots de passe ne correspondent pas.', 'The new passwords do not match.'))
			return
		}
		busy.current = true
		setPending(kind)
		setError('')
		try {
			await requestChange(kind, data)
			form.reset()
			if (alive.current) credentialChangeComplete(kind)
		} catch (cause) {
			if (!alive.current) return
			setError(accountError(cause, copy))
		} finally {
			busy.current = false
			if (alive.current) setPending(null)
		}
	}
	return (
		<section className="mm-content mm-account-page">
			<header className="mm-account-heading">
				<span className="mm-kicker">MINEMORIES / {copy('MON COMPTE', 'MY ACCOUNT')}</span>
				<h1>{copy('Ton espace, tes accès.', 'Your space, your access.')}</h1>
				<p>
					{session?.user.name} · {session?.user.email}
				</p>
				<Link to="/gallery">← {copy('Retour à ma galerie', 'Back to my gallery')}</Link>
			</header>
			<p className="mm-account-note">
				{copy(
					'Confirme chaque modification avec ton mot de passe actuel. Tous tes appareils seront déconnectés ; reconnecte-toi avec tes nouveaux identifiants. Tes souvenirs et tes appareils associés restent liés au même compte.',
					'Confirm each change with your current password. Every device will be signed out; sign in with your updated credentials. Your memories and paired devices stay linked to the same account.'
				)}
			</p>
			{error && (
				<p className="mm-account-error" role="alert">
					{error}
				</p>
			)}
			<AdminAccessLink />
			<div className="mm-account-grid">
				<form
					className="mm-account-card"
					aria-labelledby="email-heading"
					onSubmit={event => void submit('email', event)}
				>
					<span aria-hidden="true" className="mm-account-symbol">
						@
					</span>
					<h2 id="email-heading">{copy('Adresse e-mail', 'Email address')}</h2>
					<p>
						{copy(
							'Choisis l’adresse utilisée pour ta prochaine connexion.',
							'Choose the address for your next sign-in.'
						)}
					</p>
					<label>
						{copy('Nouvelle adresse e-mail', 'New email address')}
						<input
							name="email"
							type="email"
							autoComplete="email"
							required
							maxLength={254}
							disabled={pending !== null}
						/>
					</label>
					<label>
						{copy('Mot de passe actuel', 'Current password')}
						<input
							name="currentPassword"
							type="password"
							autoComplete="current-password"
							required
							maxLength={128}
							disabled={pending !== null}
						/>
					</label>
					<button className="mm-button" type="submit" disabled={pending !== null}>
						{pending === 'email' ? copy('Enregistrement…', 'Saving…') : copy('Modifier mon e-mail', 'Change my email')}
					</button>
				</form>
				<form
					className="mm-account-card"
					aria-labelledby="password-heading"
					onSubmit={event => void submit('password', event)}
				>
					<span aria-hidden="true" className="mm-account-symbol">
						✳
					</span>
					<h2 id="password-heading">{copy('Mot de passe', 'Password')}</h2>
					<p>
						{copy(
							'Utilise au moins 12 caractères et un mot de passe unique.',
							'Use at least 12 characters and a unique password.'
						)}
					</p>
					<label>
						{copy('Mot de passe actuel', 'Current password')}
						<input
							name="currentPassword"
							type="password"
							autoComplete="current-password"
							required
							maxLength={128}
							disabled={pending !== null}
						/>
					</label>
					<label>
						{copy('Nouveau mot de passe', 'New password')}
						<input
							name="newPassword"
							type="password"
							autoComplete="new-password"
							required
							minLength={12}
							maxLength={128}
							disabled={pending !== null}
						/>
					</label>
					<label>
						{copy('Confirmer le nouveau mot de passe', 'Confirm new password')}
						<input
							name="confirmation"
							type="password"
							autoComplete="new-password"
							required
							minLength={12}
							maxLength={128}
							disabled={pending !== null}
						/>
					</label>
					<button className="mm-button" type="submit" disabled={pending !== null}>
						{pending === 'password'
							? copy('Enregistrement…', 'Saving…')
							: copy('Modifier mon mot de passe', 'Change my password')}
					</button>
				</form>
			</div>
		</section>
	)
}
