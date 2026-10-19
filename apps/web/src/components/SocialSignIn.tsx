import { useEffect, useState } from 'react'
import { apiBase } from '../api-client'
import { authClient } from '../auth-client'
import { useI18n } from '../i18n/I18n'

type Provider = 'google' | 'discord'
export function SocialSignIn({
	destination,
	link = false,
	linkedProviders = [],
}: {
	destination: string
	link?: boolean
	linkedProviders?: string[]
}) {
	const { t } = useI18n()
	const [providers, setProviders] = useState<Provider[]>([])
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	useEffect(() => {
		const controller = new AbortController()
		void fetch(`${apiBase}/api/auth-providers`, { signal: controller.signal })
			.then(async response => {
				if (!response.ok) return
				const data: unknown = await response.json()
				if (Array.isArray(data) && !controller.signal.aborted)
					setProviders(data.filter((value): value is Provider => value === 'google' || value === 'discord'))
			})
			.catch(() => undefined)
		return () => controller.abort()
	}, [])
	async function signIn(provider: Provider) {
		if (busy) return
		setBusy(true)
		setError('')
		const path =
			destination.startsWith('/') && !destination.startsWith('//') && !destination.includes('\\')
				? destination
				: '/gallery'
		try {
			const authenticate = link ? authClient.linkSocial : authClient.signIn.social
			const result = await authenticate({
				provider,
				callbackURL: new URL(path, window.location.origin).href,
			})
			if (result.error) throw result.error
		} catch {
			setError(t('Could not sign in. Try again or use your email.'))
			setBusy(false)
		}
	}
	const available = providers.filter(provider => !linkedProviders.includes(provider))
	if (!available.length) return null
	return (
		<div className="auth-social">
			{available.map(provider => (
				<button
					className="auth-submit"
					key={provider}
					type="button"
					disabled={busy}
					onClick={() => void signIn(provider)}
				>
					{link ? t('Link') : t('Continue with')} {provider === 'google' ? 'Google' : 'Discord'}
				</button>
			))}
			{error && (
				<p role="alert" className="auth-error">
					{error}
				</p>
			)}
			{!link && <p>{t('or with your email address')}</p>}
		</div>
	)
}
