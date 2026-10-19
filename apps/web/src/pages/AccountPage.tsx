import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { authClient } from '../auth-client'
import { AdminAccessLink } from '../components/AdminAccessLink'
import { SocialSignIn } from '../components/SocialSignIn'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'
import { credentialChangeComplete } from './account-navigation'
import './account.css'

type Kind = 'email' | 'password' | 'name'
function errorCode(error: unknown): string {
	return error !== null && typeof error === 'object' && 'message' in error ? String(error.message) : ''
}
function requestChange(kind: Kind, data: FormData) {
	if (kind === 'name') return apiClient.account.changeName({ name: String(data.get('name') ?? '').trim() })
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
	const { session, refreshSession } = useAppContext()
	const { copy } = useLocalizedCopy()
	const [pending, setPending] = useState<Kind | null>(null)
	const [error, setError] = useState('')
	const [success, setSuccess] = useState('')
	const [hasPassword, setHasPassword] = useState(true)
	const [linkedProviders, setLinkedProviders] = useState<string[]>([])
	useEffect(() => {
		let live = true
		void authClient
			.listAccounts()
			.then(result => {
				if (live && result.data) {
					setHasPassword(result.data.some(account => account.providerId === 'credential'))
					setLinkedProviders(result.data.map(account => account.providerId))
				}
			})
			.catch(() => undefined)
		return () => {
			live = false
		}
	}, [])
	const busy = useRef(false),
		alive = useRef(true)
	useEffect(() => {
		alive.current = true
		return () => {
			alive.current = false
		}
	}, [])
	async function complete(kind: Kind, form: HTMLFormElement) {
		if (!alive.current) return
		if (kind === 'name') {
			await refreshSession()
			if (alive.current) setSuccess(copy('Pseudo enregistré.', 'Display name saved.'))
			return
		}
		form.reset()
		if (alive.current) credentialChangeComplete(kind)
	}
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
		setSuccess('')
		try {
			await requestChange(kind, data)
			await complete(kind, form)
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
				{hasPassword
					? copy(
							'Pour modifier ton e-mail ou ton mot de passe, confirme avec ton mot de passe actuel. Tous tes appareils seront déconnectés ; reconnecte-toi avec tes nouveaux identifiants. Tes souvenirs et tes appareils associés restent liés au même compte.',
							'Confirm email and password changes with your current password. Every device will be signed out; sign in with your updated credentials. Your memories and paired devices stay linked to the same account.'
						)
					: copy(
							'Ton e-mail et ton mot de passe se gèrent auprès de ton fournisseur de connexion.',
							'Manage your email and password with your sign-in provider.'
						)}
			</p>
			{error && (
				<p className="mm-account-error" role="alert">
					{error}
				</p>
			)}
			{success && <p role="status">{success}</p>}
			<AdminAccessLink />
			<div className="mm-account-grid">
				<section className="mm-account-card">
					<h2>{copy('Méthodes de connexion', 'Sign-in methods')}</h2>
					<p>
						{copy(
							'Associe un fournisseur utilisant la même adresse e-mail pour retrouver ce compte lors de tes prochaines connexions.',
							'Link a provider using the same email address to access this account on your next sign-in.'
						)}
					</p>
					{linkedProviders.map(provider => (
						<p key={provider}>
							{provider === 'credential' ? copy('E-mail et mot de passe', 'Email and password') : provider} ✓
						</p>
					))}
					<SocialSignIn destination="/account" link linkedProviders={linkedProviders} />
				</section>
				<form className="mm-account-card" aria-labelledby="name-heading" onSubmit={event => void submit('name', event)}>
					<h2 id="name-heading">{copy('Profil', 'Profile')}</h2>
					<label>
						{copy('Pseudo', 'Display name')}
						<input
							name="name"
							autoComplete="nickname"
							defaultValue={session?.user.name}
							required
							minLength={1}
							maxLength={80}
							disabled={pending !== null}
						/>
					</label>
					<button className="mm-button" type="submit" disabled={pending !== null}>
						{pending === 'name'
							? copy('Enregistrement…', 'Saving…')
							: copy('Enregistrer le pseudo', 'Save display name')}
					</button>
				</form>
				{hasPassword && (
					<>
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
								{pending === 'email'
									? copy('Enregistrement…', 'Saving…')
									: copy('Modifier mon e-mail', 'Change my email')}
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
					</>
				)}
			</div>
		</section>
	)
}
