import { afterEach, expect, spyOn, test } from 'bun:test'
import { passwordResetSender, RESET_BODY, RESET_SUBJECT, resetMessage } from './password-reset'
import { siteLanguage } from './web-catalog'

const link = (callback: string) =>
	`https://api.minemories.net/api/auth/reset-password/abc123?callbackURL=${encodeURIComponent(callback)}`
const user = { email: 'player@example.com', name: 'Diablox' }

const spies: Array<{ mockRestore: () => void }> = []
const silence = (method: 'warn' | 'error') => {
	const spy = spyOn(console, method).mockImplementation(() => undefined)
	spies.push(spy)
	return spy
}
afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore()
})

test('the email speaks the language of the page that asked for it', () => {
	const french = resetMessage({ user, url: link('https://minemories.net/fr/login/reset') })
	expect(french.subject).toBe('Choisis un nouveau mot de passe Minemories')
	expect(french.text).toStartWith('Salut Diablox,')
	expect(french.text).toContain(link('https://minemories.net/fr/login/reset'))
	const english = resetMessage({ user, url: link('https://minemories.net/login/reset') })
	expect(english.subject).toBe(RESET_SUBJECT)
	expect(english.text).toContain(RESET_BODY)
	// Not a URL, or a page without a known language: English.
	expect(resetMessage({ user, url: 'not a url' }).subject).toBe(RESET_SUBJECT)
	expect(siteLanguage('https://minemories.net/xx/login')).toBeUndefined()
	expect(siteLanguage('::')).toBeUndefined()
	expect(siteLanguage(null)).toBeUndefined()
	expect(siteLanguage('https://minemories.net/PT-BR/login/reset')).toBe('pt-br')
})

test('a name is escaped in the HTML, and an account without one is greeted by its address', () => {
	const html = resetMessage({ user: { email: 'a@example.com', name: '<b>Steve</b>' }, url: link('x') }).html
	expect(html).toContain('&#60;b&#62;Steve&#60;/b&#62;')
	expect(html).not.toContain('<b>Steve')
	expect(resetMessage({ user: { email: 'a@example.com', name: '  ' }, url: 'x' }).text).toStartWith('Hi a@example.com,')
})

test('with a Resend key the link is sent to the account’s address, from the configured sender', async () => {
	const calls: Array<{ input: string; init: RequestInit }> = []
	const send = passwordResetSender(
		{ NODE_ENV: 'production', RESEND_API_KEY: ' re_key ', MAIL_FROM: 'Minemories <noreply@send.minemories.net>' },
		(input, init) => {
			calls.push({ input, init })
			return Promise.resolve(new Response('{}', { status: 200 }))
		}
	)
	await send?.({ user, url: link('https://minemories.net/login/reset') })
	expect(calls).toHaveLength(1)
	expect(calls[0]?.input).toBe('https://api.resend.com/emails')
	expect(calls[0]?.init.headers).toMatchObject({ authorization: 'Bearer re_key' })
	const body = JSON.parse(String(calls[0]?.init.body))
	expect(body).toMatchObject({
		from: 'Minemories <noreply@send.minemories.net>',
		to: ['player@example.com'],
		subject: RESET_SUBJECT,
	})
	expect(body.html).toContain('reset-password/abc123')
})

test('a refused email is logged by status only, never with the address or the link', async () => {
	const error = silence('error')
	const send = passwordResetSender({ RESEND_API_KEY: 'key', MAIL_FROM: 'from@example.com' }, () =>
		Promise.resolve(new Response('nope', { status: 422 }))
	)
	await send?.({ user, url: link('x') })
	expect(error).toHaveBeenCalledWith('Password reset email failed: Resend answered 422')
})

test('production without a sender refuses resets; local runs write the link to the log', async () => {
	const warn = silence('warn')
	expect(passwordResetSender({ NODE_ENV: 'production', RESEND_API_KEY: 'key' })).toBeUndefined()
	expect(warn).toHaveBeenCalledTimes(1)
	const send = passwordResetSender({ NODE_ENV: 'development' })
	await send?.({ user, url: 'http://localhost:3001/api/auth/reset-password/t?callbackURL=x' })
	expect(warn).toHaveBeenLastCalledWith(
		'Password reset link (no mail sender configured): http://localhost:3001/api/auth/reset-password/t?callbackURL=x'
	)
})
