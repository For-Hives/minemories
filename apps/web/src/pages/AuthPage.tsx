import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAppContext } from '../app-context'
import { authClient } from '../auth-client'
import { HumanCheck } from '../components/HumanCheck'
import { LoadingSkeleton } from '../components/Loading'
import { MemoryScene } from '../components/MemoryScene'
import { PasswordField } from '../components/PasswordField'
import { SocialSignIn } from '../components/SocialSignIn'
import { fileInputHidden } from '../components/ui'
import { errorMessageKey } from '../i18n/error-messages'
import { useI18n } from '../i18n/I18n'
import { rememberAuthProvider } from '../observability/Insight'

const inputField = 'auth-input mc-field'

function submitText(creating: boolean, busy: boolean) {
	if (busy) return 'One moment…'
	return creating ? 'Create my account' : 'Sign in'
}

const missingHumanCheck = 'Complete the human check, then try again.'

/** A Minecraft Java name, the sign-in name of apps/api/src/sign-in-name.ts. */
const signInNamePattern = /^\w{3,16}$/

function signUp(form: FormData, identifier: string, password: string, humanCheck: string) {
	const name = String(form.get('name') ?? '').trim()
	return authClient.signUp.email({
		email: identifier,
		password,
		name,
		// A valid Minecraft name is also the sign-in name; any other display name signs in with the email only.
		...(signInNamePattern.test(name) ? { username: name } : {}),
		// The API refuses an email sign-up without a Turnstile token (apps/api/src/auth-protection.ts).
		fetchOptions: { headers: { 'x-captcha-response': humanCheck } },
	})
}

function authenticate(form: FormData, creating: boolean, humanCheck: string) {
	const identifier = String(form.get('email') ?? '').trim()
	const password = String(form.get('password') ?? '')
	if (creating) return signUp(form, identifier, password, humanCheck)
	return identifier.includes('@')
		? authClient.signIn.email({ email: identifier, password })
		: authClient.signIn.username({ username: identifier, password })
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
	const { t } = useI18n()

	const { session, isPending, refreshSession } = useAppContext()
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const [humanCheck, setHumanCheck] = useState('')
	const [humanCheckRound, setHumanCheckRound] = useState(0)
	const errorRef = useRef<HTMLParagraphElement>(null)
	const active = useRef(true)
	useEffect(() => {
		active.current = true
		return () => {
			active.current = false
		}
	}, [])
	useEffect(() => {
		if (error) errorRef.current?.focus()
	}, [error])
	const navigate = useNavigate()
	const location = useLocation()
	const creating = mode === 'register'
	const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '')
	const from = (location.state as { from?: string } | null)?.from ?? '/gallery'

	if (isPending) return <LoadingSkeleton label="One moment…" />
	if (session) return <Navigate to={from} replace />

	async function submit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		if (busy) return
		if (creating && !humanCheck) {
			setError(missingHumanCheck)
			return
		}
		setBusy(true)
		setError('')
		rememberAuthProvider('email')
		const form = new FormData(event.currentTarget)
		try {
			const result = await authenticate(form, creating, humanCheck)
			if (!active.current) return
			if (result.error) throw result.error
			await refreshSession()
			if (active.current) navigate(from, { replace: true })
		} catch (cause) {
			setError(errorMessageKey(cause, 'Could not connect right now.'))
		} finally {
			setBusy(false)
			// A Turnstile token is single use: the next sign-up attempt needs a fresh one (no widget on sign-in).
			setHumanCheckRound(round => round + 1)
		}
	}

	return (
		<section className="auth-entry">
			<div className="auth-workspace">
				<div className="auth-form-wrap">
					<nav className="auth-modes mc-tabs" aria-label={t('Access your space')}>
						<Link className="mc-tab" to="/login" state={{ from, email }} aria-current={!creating ? 'page' : undefined}>
							{t('Sign in')}
						</Link>
						<Link
							className="mc-tab"
							to="/register"
							state={{ from, email }}
							aria-current={creating ? 'page' : undefined}
						>
							{t('Create an account')}
						</Link>
					</nav>
					<header className="auth-heading">
						<span className="auth-eyebrow">{t('YOUR GALLERY')}</span>
						<h1>{creating ? t('Your gallery starts here') : t('Good to see you again')}</h1>
						<p>
							{creating
								? t('Your memories land here once the game is connected. You choose who sees them.')
								: t('Your memories are right where you left them.')}
						</p>
					</header>
					<SocialSignIn destination={from} />
					{!creating && <CredentialsNotice />}
					<form className="auth-form" onSubmit={submit} aria-busy={busy}>
						{creating && <MinecraftNameField />}
						<IdentifierField creating={creating} value={email} onChange={setEmail} />
						<PasswordField
							key={mode}
							creating={creating}
							className={inputField}
							hint={
								creating ? undefined : (
									<Link className="auth-forgot" to="/login/forgot" state={{ identifier: email }}>
										{t('Forgot your password?')}
									</Link>
								)
							}
						/>
						{creating && <HumanCheck onToken={setHumanCheck} resetKey={humanCheckRound} />}
						{error && (
							<p ref={errorRef} tabIndex={-1} className="auth-error" role="alert">
								{t(error)}
							</p>
						)}
						<button className="auth-submit mc-btn mc-btn--primary mc-btn--block" type="submit" disabled={busy}>
							{busy && <span className="auth-spinner" aria-hidden="true" />}
							{t(submitText(creating, busy))}
							<span aria-hidden="true">↗</span>
						</button>
						<p className="auth-private">
							<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" aria-hidden="true">
								<rect x="4" y="8" width="12" height="9" rx="2" />
								<path d="M7 8V5a3 3 0 0 1 6 0v3" />
							</svg>
							{t('Your memories are private by default.')}
						</p>
					</form>
					<GuestEntry />
				</div>
			</div>
			<AuthAtmosphere />
		</section>
	)
}

function GuestEntry() {
	const { t } = useI18n()
	const { setViewerFile } = useAppContext()
	const navigate = useNavigate()
	return (
		<aside className="auth-guest" aria-label={t('Visit without an account')}>
			<div className="auth-guest-title">
				<span aria-hidden="true">↗</span>
				<h2>
					<Link className="auth-guest-link" to="/explore">
						{t('Just visiting?')}
					</Link>
				</h2>
				<span>{t('NO ACCOUNT')}</span>
			</div>
			{import.meta.env.DEV ? (
				<>
					<p>{t('Open a .glb file from your computer. It isn’t sent anywhere.')}</p>
					<label className="auth-file">
						{t('Open a file')}
						<span aria-hidden="true">＋</span>
						<input
							type="file"
							className={fileInputHidden}
							accept=".glb,model/gltf-binary"
							aria-label={t('Open a file')}
							onChange={event => {
								const file = event.currentTarget.files?.[0]
								if (file) {
									setViewerFile(file)
									navigate('/viewer')
								}
								event.currentTarget.value = ''
							}}
						/>
					</label>
				</>
			) : (
				<p>{t('Explore memories shared by the community, without creating an account.')}</p>
			)}
		</aside>
	)
}

export function AuthAtmosphere() {
	const { t } = useI18n()
	return (
		<aside className="auth-atmosphere" aria-label={t('The spirit of Minemories')}>
			<div className="auth-art-sky" aria-hidden="true" />
			<div className="auth-art-label">
				<span>MINEMORIES</span>
				<span>{t('IN 3D, IN YOUR BROWSER')}</span>
			</div>
			<div className="auth-art-copy">
				<p>{t('Your house, your village, your group’s base.')}</p>
				<h2>
					{t('Go back')}
					<br />
					{t('whenever')}
					<br />
					<em>{t('you want.')}</em>
				</h2>
			</div>
			<div className="auth-art-world">
				<MemoryScene theme="village" label={t('Illustration of a village on an island')} />
			</div>
			<div className="auth-art-caption">
				<span>01 / {t('THE MEMORY')}</span>
				<p>{t('The server closes. Your base stays.')}</p>
				<span>{t('Illustration')} · Minemories</span>
			</div>
		</aside>
	)
}

function CredentialsNotice() {
	const { t } = useI18n(),
		location = useLocation()
	const updated = new URLSearchParams(location.search).get('updated')
	if (updated !== 'email' && updated !== 'password') return null
	return (
		<p role="status" className="auth-notice">
			{t('Credentials updated. Sign in again to continue.')}
		</p>
	)
}

function MinecraftNameField() {
	const { t } = useI18n()
	return (
		<>
			<label className="auth-label">
				{t('Minecraft name')}
				<input
					name="name"
					autoComplete="nickname"
					autoCapitalize="none"
					spellCheck={false}
					required
					maxLength={80}
					placeholder="Steve"
					aria-describedby="auth-name-hint"
					className={inputField}
				/>
			</label>
			<p id="auth-name-hint" className="auth-field-hint">
				{t('You can sign in with it too.')}
			</p>
		</>
	)
}

/** Sign-up asks for an email; sign-in takes the email or the Minecraft name in the same field. */
function IdentifierField({
	creating,
	value,
	onChange,
}: {
	creating: boolean
	value: string
	onChange: (value: string) => void
}) {
	const { t } = useI18n()
	const field = creating
		? { label: 'Email address', type: 'email', autoComplete: 'email', placeholder: 'you@example.com' }
		: {
				label: 'Email or Minecraft name',
				type: 'text',
				autoComplete: 'username',
				placeholder: 'you@example.com or Steve',
			}
	return (
		<label className="auth-label">
			{t(field.label)}
			<input
				name="email"
				type={field.type}
				inputMode={creating ? 'email' : 'text'}
				autoCapitalize="none"
				spellCheck={false}
				autoComplete={field.autoComplete}
				required
				placeholder={t(field.placeholder)}
				className={inputField}
				value={value}
				onChange={event => onChange(event.target.value)}
			/>
		</label>
	)
}
