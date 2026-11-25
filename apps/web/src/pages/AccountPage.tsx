import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { authClient } from '../auth-client'
import { AdminAccessLink } from '../components/AdminAccessLink'
import { SocialSignIn } from '../components/SocialSignIn'
import { buttonLime } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { avatarUrl } from '../lib/avatar'
import { AccountProfile } from './AccountProfile'
import { AvatarDialog } from './AvatarDialog'
import { credentialChangeComplete } from './account-navigation'
import './account.css'

type Kind = 'email' | 'password' | 'name' | 'avatar'
function errorCode(error: unknown): string {
	return error !== null && typeof error === 'object' && 'message' in error ? String(error.message) : ''
}
/**
 * One name per account. With a password it is also the sign-in name (Better Auth's username plugin, see
 * apps/api/src/sign-in-name.ts): one update writes the shown name, the lowercased `username` sign-in compares and
 * `displayUsername` with the capitals typed. Better Auth answers with `{ error }`: its code becomes the message
 * accountError reads. Accounts without a password sign in at their provider and keep a free display name.
 */
async function changeName(name: string, signsInWithName: boolean) {
	if (!signsInWithName) {
		await apiClient.account.changeName({ name })
		return
	}
	const result = await authClient.updateUser({ name, username: name, displayUsername: name })
	if (result.error) throw new Error(result.error.code ?? 'UPDATE_FAILED')
}
function requestChange(kind: Exclude<Kind, 'avatar'>, data: FormData, hasPassword: boolean) {
	if (kind === 'name') return changeName(String(data.get('name') ?? '').trim(), hasPassword)
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
	if (code === 'USERNAME_IS_ALREADY_TAKEN') return t('Another account already signs in with this name.')
	if (code === 'INVALID_USERNAME' || code === 'USERNAME_TOO_SHORT' || code === 'USERNAME_TOO_LONG')
		return t('A Minecraft name has 3 to 16 letters, numbers or _.')
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
	const [choosingAvatar, setChoosingAvatar] = useState(false)
	const [editingName, setEditingName] = useState(false)
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
	async function complete(kind: Exclude<Kind, 'avatar'>, form: HTMLFormElement) {
		if (!alive.current) return
		if (kind === 'name') {
			await refreshSession()
			if (!alive.current) return
			setEditingName(false)
			setSuccess(t('Display name saved.'))
			return
		}
		form.reset()
		if (alive.current) credentialChangeComplete(kind)
	}
	async function submit(kind: Exclude<Kind, 'avatar'>, event: SyntheticEvent<HTMLFormElement>) {
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
			await requestChange(kind, data, hasPassword)
			await complete(kind, form)
		} catch (cause) {
			if (!alive.current) return
			setError(accountError(cause, t))
		} finally {
			busy.current = false
			if (alive.current) setPending(null)
		}
	}
	/** Saves a head (`username`) or removes the avatar (`null`); rejects on failure so the dialog stays open. */
	async function changeAvatar(username: string | null) {
		if (busy.current) throw new Error('BUSY')
		busy.current = true
		setPending('avatar')
		setError('')
		setSuccess('')
		try {
			await apiClient.account.setMinecraftHead({ username })
			await refreshSession()
			if (alive.current) setSuccess(username === null ? t('Avatar removed.') : t('Avatar saved.'))
		} catch (cause) {
			if (alive.current) setError(accountError(cause, t))
			throw cause
		} finally {
			busy.current = false
			if (alive.current) setPending(null)
		}
	}
	function closeAvatar() {
		setChoosingAvatar(false)
		setError('')
	}
	const avatar = session ? avatarUrl(session.user) : null
	const name = session?.user.name ?? ''
	return (
		<section className="mm-content mm-account-page">
			<AccountProfile
				name={name}
				email={session?.user.email ?? ''}
				avatar={avatar}
				editingName={editingName}
				signsInWithName={hasPassword}
				pending={pending !== null}
				pendingName={pending === 'name'}
				onAvatar={() => setChoosingAvatar(true)}
				onEditName={() => {
					setSuccess('')
					setEditingName(true)
				}}
				onCancelName={() => {
					setError('')
					setEditingName(false)
				}}
				onSaveName={event => void submit('name', event)}
			/>
			<p className="mm-account-note">
				{hasPassword
					? t(
							'Changing your email or password asks for your current password. You’ll be signed out everywhere and sign in again. Your memories and connected games stay on your account.'
						)
					: t('Manage your email and password with your sign-in provider.')}
			</p>
			{error && !choosingAvatar && (
				<p className="mm-account-error" role="alert">
					{error}
				</p>
			)}
			{success && <p role="status">{success}</p>}
			<AdminAccessLink />
			<div className="mm-account-grid">
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
									className="mc-field"
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
									className="mc-field"
									name="currentPassword"
									type="password"
									autoComplete="current-password"
									required
									maxLength={128}
									disabled={pending !== null}
								/>
							</label>
							<button className={buttonLime} type="submit" disabled={pending !== null}>
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
									className="mc-field"
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
									className="mc-field"
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
									className="mc-field"
									name="confirmation"
									type="password"
									autoComplete="new-password"
									required
									minLength={12}
									maxLength={128}
									disabled={pending !== null}
								/>
							</label>
							<button className={buttonLime} type="submit" disabled={pending !== null}>
								{pending === 'password' ? t('Saving…') : t('Change my password')}
							</button>
						</form>
					</>
				)}
				<section className="mm-account-card mm-account-card--wide">
					<h2>{t('Sign-in methods')}</h2>
					<p>{t('Link a provider using the same email address to access this account on your next sign-in.')}</p>
					{linkedProviders.map(provider => (
						<p key={provider}>{provider === 'credential' ? t('Email and password') : provider} ✓</p>
					))}
					<SocialSignIn destination="/account" link linkedProviders={linkedProviders} />
				</section>
			</div>
			{choosingAvatar && (
				<AvatarDialog
					current={avatar}
					initial={name.slice(0, 1).toUpperCase()}
					busy={pending === 'avatar'}
					error={error}
					onSave={username => changeAvatar(username)}
					onRemove={() => changeAvatar(null)}
					onClose={closeAvatar}
				/>
			)}
		</section>
	)
}
