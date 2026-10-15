import { type SyntheticEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAppContext } from '../app-context'
import { authClient } from '../auth-client'
import { LoadingSkeleton } from '../components/Loading'
import { Brand } from '../components/SiteLayout'
import { buttonDark, Eyebrow } from '../components/ui'
import { T, useI18n } from '../i18n/I18n'

const inputField =
	'h-[45px] w-full rounded-[5px] border border-[#354238] bg-[#1c2720] px-[13px] text-xs font-normal text-ink outline-0 placeholder:text-[#b4c1ad] focus:border-[#354238] focus:shadow-[0_0_0_3px_#8b9e6320]'

function submitText(creating: boolean, busy: boolean) {
	if (busy) return 'One moment…'
	return creating ? 'Create my space' : 'Sign in'
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
	const { t } = useI18n()

	const { session, isPending, refreshSession } = useAppContext()
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const navigate = useNavigate()
	const location = useLocation()
	const creating = mode === 'register'
	const from = (location.state as { from?: string } | null)?.from ?? '/gallery'

	if (isPending) return <LoadingSkeleton label="One moment…" />
	if (session) return <Navigate to="/gallery" replace />

	async function submit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		setBusy(true)
		setError('')
		const form = new FormData(event.currentTarget)
		const email = String(form.get('email') ?? '').trim()
		const password = String(form.get('password') ?? '')
		try {
			const result = creating
				? await authClient.signUp.email({
						email,
						password,
						name: String(form.get('name') ?? '').trim(),
					})
				: await authClient.signIn.email({ email, password })
			if (result.error) throw new Error(result.error.message)
			await refreshSession()
			navigate(from, { replace: true })
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Could not connect right now.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<section className="album-auth mx-auto my-[46px] mb-[58px] grid min-h-[660px] w-[min(100%-88px,1120px)] grid-cols-[0.92fr_1fr] overflow-hidden rounded-[9px] border border-[#354238] bg-paper-light shadow-[0_16px_45px_#373c2810] max-tablet:w-[min(100%-48px,760px)] max-phone:mx-auto max-phone:mb-7 max-phone:mt-[13px] max-phone:min-h-0 max-phone:w-[calc(100%-24px)] max-phone:grid-cols-1">
			<div className="relative flex flex-col overflow-hidden bg-[#293d2f] px-[39px] py-9 text-[#f2f2e7] max-phone:min-h-[205px] max-phone:p-[22px]">
				<Brand />
				<div className="relative z-[1] my-auto pb-[70px] max-phone:m-[27px_0_0] max-phone:p-0 max-phone:pb-[2px]">
					<Eyebrow tone="text-[#d4e4a1]">
						<T message={'A PLACE TO COME BACK TO'} />
					</Eyebrow>
					<blockquote className="mb-[14px] mt-[21px] max-w-[385px] font-sans text-[36px] font-semibold leading-[1.2] tracking-[-1.8px] max-phone:mb-1 max-phone:mt-[10px] max-phone:max-w-[260px] max-phone:text-[23px]">
						{' '}
						<T message={'“Remember the cabin above the ravine?”'} />{' '}
					</blockquote>
					<span className="text-xs text-[#b5c0b0] max-phone:text-[10px]">
						<T message={'That is often how it starts.'} />
					</span>
				</div>
				<div
					aria-hidden="true"
					className="absolute bottom-[-62px] right-[34px] h-[211px] w-[244px] rotate-[-28deg] opacity-[0.54] max-phone:bottom-[-94px] max-phone:right-[3px] max-phone:origin-bottom-right max-phone:scale-[0.72]"
				>
					<span className="absolute top-0 left-[64px] grid h-[90px] w-[90px] place-items-center border border-[#354238] bg-[#405944] text-[36px] text-lime shadow-[20px_20px_0_#1c302588]">
						▧
					</span>
					<i className="absolute bottom-5 left-[7px] h-[74px] w-[37px] border border-[#354238] bg-[#80926d] not-italic" />
					<i className="absolute bottom-5 left-[54px] h-[106px] w-[37px] border border-[#354238] bg-[#80926d] not-italic" />
					<i className="absolute bottom-5 left-[102px] h-[60px] w-[37px] border border-[#354238] bg-[#80926d] not-italic" />
					<b className="absolute bottom-[33px] right-[10px] font-mono text-[9px] font-normal text-[#d9e6ca]">
						{' '}
						<T message={'SEASON 04'} />{' '}
					</b>
				</div>
				<span className="relative z-[1] text-[11px] text-[#bdc5b7] max-phone:hidden">
					{' '}
					<T message={'A small archive of great adventures.'} />{' '}
				</span>
			</div>
			<div className="grid place-items-center px-[42px] py-[50px] max-phone:px-[21px] max-phone:py-9 max-phone:pb-[33px]">
				<div className="w-[min(100%,380px)]">
					<Eyebrow>{creating ? t('YOUR STORY CONTINUES') : t('GOOD TO SEE YOU AGAIN')}</Eyebrow>
					<h1 className="mb-2 mt-[13px] font-sans text-[34px] font-semibold tracking-[-1.6px] max-phone:text-[28px]">
						{creating ? t('Create a space') : t('Welcome back.')}
					</h1>
					<p className="m-0 text-[13px] text-[#b4c1ad]">
						{creating ? t('Gather your worlds in a single gallery.') : t('Find your worlds gallery again.')}
					</p>
					<form className="mt-[31px] grid gap-[18px]" onSubmit={submit}>
						{creating && (
							<label className="grid gap-2 text-[11px] font-bold text-[#e6eee1]">
								{' '}
								<T message={'Display name'} />{' '}
								<input
									name="name"
									autoComplete="name"
									required
									maxLength={80}
									placeholder={t('What do your friends call you?')}
									className={inputField}
								/>
							</label>
						)}
						<label className="grid gap-2 text-[11px] font-bold text-[#e6eee1]">
							{' '}
							<T message={'Email address'} />{' '}
							<input
								name="email"
								type="email"
								autoComplete="email"
								required
								placeholder={t('you@example.com')}
								className={inputField}
							/>
						</label>
						<label className="grid gap-2 text-[11px] font-bold text-[#e6eee1]">
							{' '}
							<T message={'Password'} />{' '}
							<input
								name="password"
								type="password"
								autoComplete={creating ? 'new-password' : 'current-password'}
								minLength={creating ? 12 : undefined}
								required
								placeholder={t(creating ? '12 characters minimum' : 'Your password')}
								className={inputField}
							/>
						</label>
						{error && (
							<p className="m-0 -mt-1 text-xs text-[#f0a49a]" role="alert">
								{error}
							</p>
						)}
						<button className={`${buttonDark} mt-[2px] w-full`} type="submit" disabled={busy}>
							{t(submitText(creating, busy))} <span>↗</span>
						</button>
					</form>
					<p className="mb-0 mt-[22px] text-center text-[11px] text-[#b4c1ad]">
						{creating ? t('Already have an account?') : t('No account yet?')}{' '}
						<Link
							className="font-bold text-[#b4c1ad] underline underline-offset-[3px]"
							to={creating ? '/login' : '/register'}
						>
							{creating ? t('Sign in') : t('Create a space')}
						</Link>
					</p>
					<p className="mb-0 mt-8 text-center text-[11px] text-[#b4c1ad]">
						{' '}
						<T message={'Just want to open a file?'} />{' '}
						<Link className="font-bold text-[#b4c1ad] underline underline-offset-[3px]" to="/viewer">
							{' '}
							<T message={'Try without an account'} />{' '}
						</Link>
					</p>
				</div>
			</div>
		</section>
	)
}
