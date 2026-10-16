import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAppContext } from '../app-context'
import { authClient } from '../auth-client'
import { LoadingSkeleton } from '../components/Loading'
import { MemoryScene } from '../components/MemoryScene'
import { PasswordField } from '../components/PasswordField'
import { fileInputHidden } from '../components/ui'
import { errorMessageKey } from '../i18n/error-messages'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'

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
	const { t, copy } = useLocalizedCopy()

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
					<nav className="auth-modes" aria-label={copy('Accès à ton espace', 'Access your space')}>
						<Link to="/login" state={{ from, email }} aria-current={!creating ? 'page' : undefined}>
							{t('Sign in')}
						</Link>
						<Link to="/register" state={{ from, email }} aria-current={creating ? 'page' : undefined}>
							{t('Create a space')}
						</Link>
					</nav>
					<header className="auth-heading">
						<span className="auth-eyebrow">{copy('TES MONDES T’ATTENDENT', 'YOUR WORLDS ARE WAITING')}</span>
						<h1>
							{creating
								? copy('Le début de ton album.', 'Your album starts here.')
								: copy('De retour chez toi.', 'Welcome home.')}
						</h1>
						<p>
							{creating
								? copy(
										'Un espace pour garder tes captures et choisir avec qui les partager.',
										'A space to keep your captures and choose who to share them with.'
									)
								: copy(
										'Retrouve tes captures, tes constructions et les moments qui comptent.',
										'Find your captures, your builds and the moments that matter.'
									)}
						</p>
					</header>
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
									placeholder={copy('Ton pseudo Minecraft, par exemple', 'Your Minecraft name, for example')}
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
							{copy('Tes captures sont privées par défaut.', 'Your captures are private by default.')}
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
	const { copy } = useLocalizedCopy()
	const { setViewerFile } = useAppContext()
	const navigate = useNavigate()
	return (
		<aside className="auth-guest" aria-label={copy('Visiter sans compte', 'Visit without an account')}>
			<div className="auth-guest-title">
				<span aria-hidden="true">↗</span>
				<h2>{copy('Juste de passage ?', 'Just visiting?')}</h2>
				<span>{copy('SANS COMPTE', 'NO ACCOUNT')}</span>
			</div>
			{import.meta.env.DEV ? (
				<>
					<p>
						{copy(
							'Ouvre une capture sur ton appareil. Le fichier reste local.',
							'Open a capture on your device. The file stays local.'
						)}
					</p>
					<label className="auth-file">
						{copy('Ouvrir ma capture', 'Open my capture')}
						<span aria-hidden="true">＋</span>
						<input
							type="file"
							className={fileInputHidden}
							accept=".glb,model/gltf-binary"
							aria-label={copy('Ouvrir ma capture', 'Open my capture')}
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
				<p>
					{copy(
						'Explore les souvenirs partagés par la communauté, sans créer de compte.',
						'Explore memories shared by the community, without creating an account.'
					)}
				</p>
			)}
			<Link className={import.meta.env.DEV ? 'auth-explore' : 'auth-file'} to="/explorer">
				{copy('Explorer la galerie publique', 'Explore the public gallery')} <span aria-hidden="true">→</span>
			</Link>
		</aside>
	)
}

function AuthAtmosphere() {
	const { copy } = useLocalizedCopy()
	return (
		<aside className="auth-atmosphere" aria-label={copy('L’esprit Minemories', 'The spirit of Minemories')}>
			<div className="auth-art-sky" aria-hidden="true">
				<span className="auth-art-sun" />
				<i />
				<i />
			</div>
			<div className="auth-art-label">
				<span>MINEMORIES</span>
				<span>{copy('LES LIEUX RESTENT.', 'THE PLACES REMAIN.')}</span>
			</div>
			<div className="auth-art-copy">
				<p>{copy('Une maison. Un serveur. Une époque.', 'A home. A server. An era.')}</p>
				<h2>
					{copy('On a tous', 'We all have')}
					<br />
					{copy('un endroit', 'somewhere')}
					<br />
					<em>{copy('à retrouver.', 'to return to.')}</em>
				</h2>
			</div>
			<div className="auth-art-world">
				<MemoryScene
					theme="village"
					label={copy('Illustration d’un village sur une île', 'Illustration of a village on an island')}
				/>
			</div>
			<div className="auth-art-caption">
				<span>01 / {copy('LE SOUVENIR', 'THE MEMORY')}</span>
				<p>{copy('La partie s’arrête. L’histoire continue.', 'The game ends. The story continues.')}</p>
				<span>{copy('Illustration', 'Illustration')} · Minemories</span>
			</div>
		</aside>
	)
}

function CredentialsNotice() {
	const { copy } = useLocalizedCopy(),
		location = useLocation()
	const updated = new URLSearchParams(location.search).get('updated')
	if (updated !== 'email' && updated !== 'password') return null
	return (
		<p role="status" className="auth-notice">
			{copy('Identifiants modifiés. Reconnecte-toi pour continuer.', 'Credentials updated. Sign in again to continue.')}
		</p>
	)
}
