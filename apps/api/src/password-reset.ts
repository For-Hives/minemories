import { siteLanguage, translateWeb } from './web-catalog'

type Environment = Readonly<Record<string, string | undefined>>
type Fetch = (input: string, init: RequestInit) => Promise<Response>

export interface ResetMail {
	user: { email: string; name?: string | null }
	url: string
}
export type SendResetPassword = (mail: ResetMail) => Promise<void>

/** One hour, Better Auth's default, written down because the email promises it. */
export const RESET_TOKEN_SECONDS = 60 * 60
const RESEND_URL = 'https://api.resend.com/emails'

// English source messages, translated in the web catalogs (apps/web/src/i18n/locales/*.json).
export const RESET_SUBJECT = 'Choose a new Minemories password'
export const RESET_GREETING = 'Hi {name},'
export const RESET_BODY =
	'Someone asked for a new password for your Minemories account. If it was you, choose it with this link. It works for one hour.'
export const RESET_BUTTON = 'Choose a new password'
export const RESET_IGNORE = 'Not you? Ignore this email: your password stays the same.'

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`)

/** The email in the language of the page that asked for it (its `callbackURL`), as plain text and HTML. */
export function resetMessage(mail: ResetMail) {
	let callback: string | null = null
	try {
		callback = new URL(mail.url).searchParams.get('callbackURL')
	} catch {
		callback = null
	}
	const lang = siteLanguage(callback)
	const t = (message: string) => translateWeb(lang, message)
	const name = mail.user.name?.trim() || mail.user.email
	const greeting = t(RESET_GREETING).replace('{name}', name)
	const text = [greeting, '', t(RESET_BODY), '', mail.url, '', t(RESET_IGNORE)].join('\n')
	const html = [
		`<p>${escapeHtml(greeting)}</p>`,
		`<p>${escapeHtml(t(RESET_BODY))}</p>`,
		`<p><a href="${escapeHtml(mail.url)}">${escapeHtml(t(RESET_BUTTON))}</a></p>`,
		`<p>${escapeHtml(t(RESET_IGNORE))}</p>`,
	].join('\n')
	return { subject: t(RESET_SUBJECT), text, html }
}

/**
 * How "Forgot your password?" sends its link. With RESEND_API_KEY and MAIL_FROM, through Resend. Outside production
 * without them, the link is written to the API log so a local reset needs no mail account. Production without them
 * returns undefined: Better Auth then refuses the request (RESET_PASSWORD_DISABLED) instead of pretending to send.
 */
export function passwordResetSender(environment: Environment, fetcher: Fetch = fetch): SendResetPassword | undefined {
	const key = environment.RESEND_API_KEY?.trim()
	const from = environment.MAIL_FROM?.trim()
	if (key && from) {
		return async mail => {
			const message = resetMessage(mail)
			const response = await fetcher(RESEND_URL, {
				method: 'POST',
				headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
				body: JSON.stringify({ from, to: [mail.user.email], ...message }),
			})
			// Never the address or the link in the log: the status is enough to find a failure.
			if (!response.ok) console.error(`Password reset email failed: Resend answered ${response.status}`)
		}
	}
	if (environment.NODE_ENV === 'production') {
		console.warn('RESEND_API_KEY or MAIL_FROM is not set: password reset is refused until they are.')
		return undefined
	}
	return mail => {
		console.warn(`Password reset link (no mail sender configured): ${mail.url}`)
		return Promise.resolve()
	}
}
