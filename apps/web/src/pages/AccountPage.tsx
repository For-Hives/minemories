import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { authClient } from '../auth-client'
import { AdminAccessLink } from '../components/AdminAccessLink'
import { SocialSignIn } from '../components/SocialSignIn'
import { useI18n } from '../i18n/I18n'
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
type Translator = ReturnType<typeof useI18n>['t']
function accountError(cause: unknown, t: Translator): string {
	const code = errorCode(cause)
	if (code === 'CURRENT_PASSWORD_INVALID') return t('The current password is incorrect.')
	if (code === 'EMAIL_UNAVAILABLE') return t('This email address cannot be used.')
	return t('Could not update your account. Check your connection and try again; sign in if your session expired.')
}
export function AccountPage() {
	const { session, refreshSession } = useAppContext()
	const { t } = useI18n()
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
			if (alive.current) setSuccess(t('Display name saved.'))
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
			setError(t('The new passwords do not match.'))
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
			setError(accountError(cause, t))
		} finally {
			busy.current = false
			if (alive.current) setPending(null)
		}
	}
	return (
		<section className="mm-content mm-account-page">
			<header className="mm-account-heading">
				<span className="mm-kicker">MINEMORIES / {t('MY ACCOUNT')}</span>
				<h1>{t('Your space, your access.')}</h1>
				<p>
					{session?.user.name} · {session?.user.email}
				</p>
				<Link to="/gallery">← {t('Back to my gallery')}</Link>
			</header>
			<p className="mm-account-note">
				{hasPassword
					? t(
							'Confirm email and password changes with your current password. Every device will be signed out; sign in with your updated credentials. Your memories and paired devices stay linked to the same account.'
						)
					: t('Manage your email and password with your sign-in provider.')}
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
					<h2>{t('Sign-in methods')}</h2>
					<p>{t('Link a provider using the same email address to access this account on your next sign-in.')}</p>
					{linkedProviders.map(provider => (
						<p key={provider}>{provider === 'credential' ? t('Email and password') : provider} ✓</p>
					))}
					<SocialSignIn destination="/account" link linkedProviders={linkedProviders} />
				</section>
				<form className="mm-account-card" aria-labelledby="name-heading" onSubmit={event => void submit('name', event)}>
					<h2 id="name-heading">{t('Profile')}</h2>
					<label>
						{t('Display name')}
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
						{pending === 'name' ? t('Saving…') : t('Save display name')}
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
							<h2 id="email-heading">{t('Email address')}</h2>
							<p>{t('Choose the address for your next sign-in.')}</p>
							<label>
								{t('New email address')}
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
								{t('Current password')}
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
								{pending === 'email' ? t('Saving…') : t('Change my email')}
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
							<h2 id="password-heading">{t('Password')}</h2>
							<p>{t('Use at least 12 characters and a unique password.')}</p>
							<label>
								{t('Current password')}
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
								{t('New password')}
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
								{t('Confirm new password')}
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
								{pending === 'password' ? t('Saving…') : t('Change my password')}
							</button>
						</form>
					</>
				)}
			</div>
		</section>
	)
}
