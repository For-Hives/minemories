import { useEffect, useState } from 'react'
import { useAppContext } from '../app-context'
import { useI18n } from '../i18n/I18n'
import { type AuthMethod, authProviderKey, distinctId, isNewAccount, joinedMonth, signupSeenKey } from '../lib/insight'
import { identify, insightDisabled, setInsightDisabled, startInsight, track } from './insight'

const methods: readonly AuthMethod[] = ['email', 'google', 'discord']

/** The method of the sign-in started on this tab (AuthPage, SocialSignIn before its redirect), read once. */
function takeProvider(): AuthMethod | undefined {
	try {
		const saved = sessionStorage.getItem(authProviderKey)
		sessionStorage.removeItem(authProviderKey)
		return methods.find(method => method === saved)
	} catch {
		return undefined
	}
}
/** True the first time an account is seen on this device. */
function firstSighting(id: string) {
	try {
		const seen = localStorage.getItem(signupSeenKey)?.split(',') ?? []
		if (seen.includes(id)) return false
		localStorage.setItem(signupSeenKey, [...seen.slice(-9), id].join(','))
		return true
	} catch {
		return false
	}
}
/** Remembers how a sign-in started, so the account's first signed-in page (after an OAuth redirect too) counts it. */
export function rememberAuthProvider(provider: AuthMethod) {
	try {
		sessionStorage.setItem(authProviderKey, provider)
	} catch {
		/* The method is then reported as email. */
	}
}

/**
 * Ties the visit to the signed-in account's pseudonym, with the properties used for cohorts and retention, and counts a
 * new account's first page as its sign-up (or a sign-in started on this tab as a login). Renders nothing.
 */
export function InsightIdentity() {
	const { session } = useAppContext()
	const { locale } = useI18n()
	const user = session?.user
	const userId = user?.id
	const createdAt = user?.createdAt
	useEffect(() => {
		if (!userId) return
		let cancelled = false
		void distinctId(userId).then(id => {
			if (cancelled) return
			const joined = joinedMonth(createdAt)
			identify(id, { locale, signedIn: true, ...(joined ? { joined } : {}) })
			const method = takeProvider()
			if (isNewAccount(createdAt, Date.now()) && firstSighting(id)) track('signup', { method: method ?? 'email' })
			else if (method) track('login', { method })
		})
		return () => {
			cancelled = true
		}
	}, [userId, createdAt, locale])
	return null
}

/** The switch on the privacy page: visit statistics on (the default) or off for this device. */
export function InsightPreference() {
	const { t } = useI18n()
	// Checked on the prerendered page, then this device's choice once hydrated.
	const [enabled, setEnabled] = useState(true)
	useEffect(() => setEnabled(!insightDisabled()), [])
	return (
		<div>
			<label>
				<input
					type="checkbox"
					checked={enabled}
					onChange={event => {
						setInsightDisabled(!event.target.checked)
						setEnabled(!insightDisabled())
						if (event.target.checked) startInsight()
					}}
				/>{' '}
				{t('Count my visits on this device')}
			</label>
		</div>
	)
}
