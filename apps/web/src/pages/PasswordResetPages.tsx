import { type ReactNode, type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { authClient } from '../auth-client'
import { PasswordField } from '../components/PasswordField'
import { errorMessageKey } from '../i18n/error-messages'
import { useI18n } from '../i18n/I18n'
import { localizedUrl } from '../lib/locale-path'
import { AuthAtmosphere } from './AuthPage'

const inputField = 'auth-input mc-field'

function ResetShell({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
	const { t } = useI18n()
	return (
		<section className="auth-entry">
			<div className="auth-workspace">
				<div className="auth-form-wrap">
					<header className="auth-heading">
						<h1>{t(title)}</h1>
						<p>{t(lead)}</p>
					</header>
					{children}
					<p className="auth-private">
						<Link className="auth-forgot" to="/login">
							← {t('Back to sign-in')}
						</Link>
					</p>
				</div>
			</div>
			<AuthAtmosphere />
		</section>
	)
}

/** One request at a time; a Better Auth `{ error }` or a network failure becomes a message key for ErrorLine. */
function useRequest() {
	const alive = useRef(true)
	useEffect(() => {
		alive.current = true
		return () => {
			alive.current = false
		}
	}, [])
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	async function run(request: () => Promise<{ error?: unknown }>, done: () => void) {
		if (busy) return
		setBusy(true)
		setError('')
		try {
			const result = await request()
			if (result.error) throw result.error
			if (alive.current) done()
		} catch (cause) {
			if (alive.current) setError(errorMessageKey(cause, 'Could not connect right now.'))
		} finally {
			if (alive.current) setBusy(false)
		}
	}
	return { busy, error, setError, run }
}

function ErrorLine({ error }: { error: string }) {
	const { t } = useI18n()
	const ref = useRef<HTMLParagraphElement>(null)
	useEffect(() => {
		if (error) ref.current?.focus()
	}, [error])
	if (!error) return null
	return (
		<p ref={ref} tabIndex={-1} className="auth-error" role="alert">
			{t(error)}
		</p>
	)
}

/** /login/forgot: one field (email or Minecraft name), then the same answer whether an account exists or not. */
export function ForgotPasswordPage() {
	const { t, locale } = useI18n()
	const location = useLocation()
	const { busy, error, run } = useRequest()
	const [identifier, setIdentifier] = useState((location.state as { identifier?: string } | null)?.identifier ?? '')
	const [sent, setSent] = useState(false)

	function submit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		void run(
			() =>
				authClient.requestPasswordReset({
					// The API swaps a Minecraft name for its account's email (apps/api/src/sign-in-name.ts).
					email: identifier.trim(),
					redirectTo: localizedUrl('/login/reset', window.location.origin, locale),
				}),
			() => setSent(true)
		)
	}

	if (sent)
		return (
			<ResetShell title="Check your inbox" lead="If this account exists, we sent you a link.">
				<p role="status" className="auth-field-hint">
					{t('It works for one hour. Nothing came? Check your spam.')}
				</p>
			</ResetShell>
		)
	return (
		<ResetShell title="Forgot your password?" lead="Type your email or Minecraft name. We’ll send you a link.">
			<form className="auth-form" onSubmit={submit} aria-busy={busy}>
				<label className="auth-label">
					{t('Email or Minecraft name')}
					<input
						name="identifier"
						autoCapitalize="none"
						spellCheck={false}
						autoComplete="username"
						required
						maxLength={254}
						placeholder={t('you@example.com or Steve')}
						className={inputField}
						value={identifier}
						onChange={event => setIdentifier(event.target.value)}
					/>
				</label>
				<ErrorLine error={error} />
				<button className="auth-submit mc-btn mc-btn--primary mc-btn--block" type="submit" disabled={busy}>
					{busy && <span className="auth-spinner" aria-hidden="true" />}
					{busy ? t('One moment…') : t('Send me a link')}
				</button>
			</form>
		</ResetShell>
	)
}

/** /login/reset?token=…: where the email's link lands (through the API, which checks the token first). */
export function ResetPasswordPage() {
	const { t } = useI18n()
	const location = useLocation()
	const navigate = useNavigate()
	const { busy, error, setError, run } = useRequest()
	const query = new URLSearchParams(location.search)
	const token = query.get('token') ?? ''

	if (!token || query.get('error'))
		return (
			<ResetShell title="This link no longer works" lead="It was already used, or it is more than one hour old.">
				<Link className="auth-submit mc-btn mc-btn--primary mc-btn--block" to="/login/forgot">
					{t('Ask for a new link')}
				</Link>
			</ResetShell>
		)

	function submit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		const data = new FormData(event.currentTarget)
		const newPassword = String(data.get('password') ?? '')
		if (newPassword !== String(data.get('confirmation') ?? '')) {
			setError('The new passwords do not match.')
			return
		}
		void run(
			() => authClient.resetPassword({ newPassword, token }),
			() => navigate('/login?updated=password', { replace: true })
		)
	}

	return (
		<ResetShell title="Choose a new password" lead="You’ll be signed out everywhere, then you sign in with it.">
			<form className="auth-form" onSubmit={submit} aria-busy={busy}>
				<PasswordField creating className={inputField} label="New password" />
				<label className="auth-label">
					{t('Confirm new password')}
					<input
						name="confirmation"
						type="password"
						autoComplete="new-password"
						minLength={12}
						required
						className={inputField}
					/>
				</label>
				<ErrorLine error={error} />
				<button className="auth-submit mc-btn mc-btn--primary mc-btn--block" type="submit" disabled={busy}>
					{busy && <span className="auth-spinner" aria-hidden="true" />}
					{busy ? t('One moment…') : t('Save my new password')}
				</button>
			</form>
		</ResetShell>
	)
}
