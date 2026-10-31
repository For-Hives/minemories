import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAppContext } from '../app-context'
import { authClient } from '../auth-client'
import { LoadingSkeleton } from '../components/Loading'
import { MemoryScene } from '../components/MemoryScene'
import { PasswordField } from '../components/PasswordField'
import { SocialSignIn } from '../components/SocialSignIn'
import { fileInputHidden } from '../components/ui'
import { errorMessageKey } from '../i18n/error-messages'
import { useI18n } from '../i18n/I18n'

const inputField = 'auth-input'

function submitText(creating: boolean, busy: boolean) {
	if (busy) return 'One moment…'
	return creating ? 'Create my space' : 'Sign in'
}

function authenticate(form: FormData, creating: boolean) {
	const email = String(form.get('email') ?? '').trim()
	const password = String(form.get('password') ?? '')
	return creating
		? authClient.signUp.email({ email, password, name: String(form.get('name') ?? '').trim() })
		: authClient.signIn.email({ email, password })
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
	const { t } = useI18n()

	const { session, isPending, refreshSession } = useAppContext()
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
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
		setBusy(true)
		setError('')
		const form = new FormData(event.currentTarget)
		try {
			const result = await authenticate(form, creating)
			if (!active.current) return
			if (result.error) throw result.error
			await refreshSession()
			if (active.current) navigate(from, { replace: true })
		} catch (cause) {
			setError(errorMessageKey(cause, 'Could not connect right now.'))
		} finally {
			setBusy(false)
		}
	}

	return (
		<section className="auth-entry">
			<div className="auth-workspace">
				<div className="auth-form-wrap">
					<nav className="auth-modes" aria-label={t('Access your space')}>
						<Link to="/login" state={{ from, email }} aria-current={!creating ? 'page' : undefined}>
							{t('Sign in')}
						</Link>
						<Link to="/register" state={{ from, email }} aria-current={creating ? 'page' : undefined}>
							{t('Create a space')}
						</Link>
					</nav>
					<header className="auth-heading">
						<span className="auth-eyebrow">{t('YOUR WORLDS ARE WAITING')}</span>
						<h1>{creating ? t('Your album starts here.') : t('Welcome home.')}</h1>
						<p>
							{creating
								? t('A space to keep your captures and choose who to share them with.')
								: t('Find your captures, your builds and the moments that matter.')}
						</p>
					</header>
					<SocialSignIn destination={from} />
					{!creating && <CredentialsNotice />}
					<form className="auth-form" onSubmit={submit} aria-busy={busy}>
						{creating && (
							<label className="auth-label">
								{t('Display name')}
								<input
									name="name"
									autoComplete="nickname"
									required
									maxLength={80}
									placeholder={t('Your Minecraft name, for example')}
									className={inputField}
								/>
							</label>
						)}
						<label className="auth-label">
							{t('Email address')}
							<input
								name="email"
								type="email"
								inputMode="email"
								autoCapitalize="none"
								spellCheck={false}
								autoComplete="email"
								required
								placeholder={t('you@example.com')}
								className={inputField}
								value={email}
								onChange={event => setEmail(event.target.value)}
							/>
						</label>
						<PasswordField key={mode} creating={creating} className={inputField} />
						{error && (
							<p ref={errorRef} tabIndex={-1} className="auth-error" role="alert">
								{t(error)}
							</p>
						)}
						<button className="auth-submit" type="submit" disabled={busy}>
							{busy && <span className="auth-spinner" aria-hidden="true" />}
							{t(submitText(creating, busy))}
							<span aria-hidden="true">↗</span>
						</button>
						<p className="auth-private">
							<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" aria-hidden="true">
								<rect x="4" y="8" width="12" height="9" rx="2" />
								<path d="M7 8V5a3 3 0 0 1 6 0v3" />
							</svg>
							{t('Your captures are private by default.')}
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
				<h2>{t('Just visiting?')}</h2>
				<span>{t('NO ACCOUNT')}</span>
			</div>
			{import.meta.env.DEV ? (
				<>
					<p>{t('Open a capture on your device. The file stays local.')}</p>
					<label className="auth-file">
						{t('Open my capture')}
						<span aria-hidden="true">＋</span>
						<input
							type="file"
							className={fileInputHidden}
							accept=".glb,model/gltf-binary"
							aria-label={t('Open my capture')}
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

function AuthAtmosphere() {
	const { t } = useI18n()
	return (
		<aside className="auth-atmosphere" aria-label={t('The spirit of Minemories')}>
			<div className="auth-art-sky" aria-hidden="true">
				<span className="auth-art-sun" />
				<i />
				<i />
			</div>
			<div className="auth-art-label">
				<span>MINEMORIES</span>
				<span>{t('THE PLACES REMAIN.')}</span>
			</div>
			<div className="auth-art-copy">
				<p>{t('A home. A server. An era.')}</p>
				<h2>
					{t('We all have')}
					<br />
					{t('somewhere')}
					<br />
					<em>{t('to return to.')}</em>
				</h2>
			</div>
			<div className="auth-art-world">
				<MemoryScene theme="village" label={t('Illustration of a village on an island')} />
			</div>
			<div className="auth-art-caption">
				<span>01 / {t('THE MEMORY')}</span>
				<p>{t('The game ends. The story continues.')}</p>
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
