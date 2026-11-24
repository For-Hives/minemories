import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import type { ResetMail } from './password-reset'
import { backfillSignInNames, resetByName, SIGN_IN_NAME, signInName } from './sign-in-name'

const directory = mkdtempSync(join(tmpdir(), 'minemories-sign-in-name-'))
const databases: Database[] = []
afterAll(() => {
	for (const database of databases) database.close()
	rmSync(directory, { recursive: true, force: true })
})

const base = (database: Database) => ({
	baseURL: 'http://localhost:3001',
	secret: 'sign-in-name-test-secret-with-32-characters',
	database,
	trustedOrigins: ['http://localhost:5173'],
	logger: { disabled: true },
})

/** The options of apps/api/src/auth.ts that this feature adds, around a mailbox the test can read. */
async function authWithNames(name: string) {
	const database = new Database(join(directory, `${name}.sqlite`), { create: true })
	databases.push(database)
	const mails: ResetMail[] = []
	const auth = betterAuth({
		...base(database),
		plugins: [signInName(), resetByName],
		disabledPaths: ['/is-username-available'],
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 12,
			sendResetPassword: mail => {
				mails.push(mail)
				return Promise.resolve()
			},
			revokeSessionsOnPasswordReset: true,
		},
	})
	const { runMigrations } = await getMigrations(auth.options)
	await runMigrations()
	return { auth, database, mails }
}

function post(auth: { handler: (request: Request) => Promise<Response> }, path: string, body: unknown, cookie = '') {
	return auth.handler(
		new Request(`http://localhost:3001/api/auth${path}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				origin: 'http://localhost:5173',
				...(cookie ? { cookie } : {}),
			},
			body: JSON.stringify(body),
		})
	)
}

const password = 'a-real-test-password'
const newPassword = 'another-real-password'

test('a sign-in name is a Minecraft Java name', () => {
	for (const name of ['Steve', 'abc', 'Gold_Diablox_123']) expect(SIGN_IN_NAME.test(name)).toBe(true)
	for (const name of ['ab', 'Gold D. Diablox', 'name-with-dash', 'seventeen_letters', 'é_accent']) {
		expect(SIGN_IN_NAME.test(name)).toBe(false)
	}
})

test('a player signs up with their Minecraft name, then signs in with it whatever the case', async () => {
	const { auth, database } = await authWithNames('sign-in')
	const created = await post(auth, '/sign-up/email', {
		email: 'diablox@example.com',
		password,
		name: 'Diablox',
		username: 'Diablox',
	})
	expect(created.status).toBe(200)
	expect(database.query('SELECT username, displayUsername FROM user').get()).toEqual({
		username: 'diablox',
		displayUsername: 'Diablox',
	})
	expect((await post(auth, '/sign-in/username', { username: 'DIABLOX', password })).status).toBe(200)
	expect((await post(auth, '/sign-in/email', { email: 'diablox@example.com', password })).status).toBe(200)
	const wrong = await post(auth, '/sign-in/username', { username: 'Diablox', password: 'not-the-password' })
	expect(wrong.status).toBe(401)
	expect(await wrong.json()).toMatchObject({ code: 'INVALID_USERNAME_OR_PASSWORD' })
	const unknown = await post(auth, '/sign-in/username', { username: 'Nobody_here', password })
	expect(unknown.status).toBe(401)
	expect(await unknown.json()).toMatchObject({ code: 'INVALID_USERNAME_OR_PASSWORD' })
})

test('a taken or invalid name refuses the sign-up, and nobody can list which names exist', async () => {
	const { auth, database } = await authWithNames('sign-up')
	await post(auth, '/sign-up/email', { email: 'first@example.com', password, name: 'Alex', username: 'Alex' })
	const taken = await post(auth, '/sign-up/email', {
		email: 'second@example.com',
		password,
		name: 'alex',
		username: 'alex',
	})
	expect(taken.status).toBe(400)
	expect(await taken.json()).toMatchObject({ code: 'USERNAME_IS_ALREADY_TAKEN' })
	const invalid = await post(auth, '/sign-up/email', {
		email: 'third@example.com',
		password,
		name: 'Gold D. Diablox',
		username: 'Gold D. Diablox',
	})
	expect(invalid.status).toBe(400)
	expect(await invalid.json()).toMatchObject({ code: 'INVALID_USERNAME' })
	// A display name that is not a Minecraft name still makes an account, which signs in with its email.
	const free = await post(auth, '/sign-up/email', { email: 'free@example.com', password, name: 'Gold D. Diablox' })
	expect(free.status).toBe(200)
	expect(database.query('SELECT COUNT(*) AS count FROM user').get()).toEqual({ count: 2 })
	expect((await post(auth, '/is-username-available', { username: 'Alex' })).status).toBe(404)
})

test('the account page changes the sign-in name, never to one another account uses', async () => {
	const { auth, database } = await authWithNames('update')
	await post(auth, '/sign-up/email', { email: 'one@example.com', password, name: 'One', username: 'Player_one' })
	const second = await post(auth, '/sign-up/email', { email: 'two@example.com', password, name: 'Two' })
	const cookie = second.headers.getSetCookie().join('; ')
	const taken = await post(auth, '/update-user', { username: 'player_ONE' }, cookie)
	expect(taken.status).toBe(400)
	expect(await taken.json()).toMatchObject({ code: 'USERNAME_IS_ALREADY_TAKEN' })
	expect(
		(await post(auth, '/update-user', { username: 'Player_Two', displayUsername: 'Player_Two' }, cookie)).status
	).toBe(200)
	expect(database.query("SELECT username, displayUsername FROM user WHERE email='two@example.com'").get()).toEqual({
		username: 'player_two',
		displayUsername: 'Player_Two',
	})
	expect((await post(auth, '/sign-in/username', { username: 'player_two', password })).status).toBe(200)
})

test('a forgotten password: the link from the email sets a new one once, and signs out every session', async () => {
	const { auth, mails } = await authWithNames('reset')
	const created = await post(auth, '/sign-up/email', { email: 'reset@example.com', password, name: 'Resetter' })
	const oldSession = created.headers.getSetCookie().join('; ')
	const redirectTo = 'http://localhost:5173/fr/login/reset'
	expect((await post(auth, '/request-password-reset', { email: 'reset@example.com', redirectTo })).status).toBe(200)
	expect(mails).toHaveLength(1)
	expect(mails[0]?.user.email).toBe('reset@example.com')
	const link = new URL(mails[0]?.url ?? '')
	expect(link.searchParams.get('callbackURL')).toBe(redirectTo)
	const token = link.pathname.split('/').at(-1) ?? ''
	// The emailed link goes through the API, which sends the browser on to the site's page with the token.
	const landing = await auth.handler(new Request(link))
	expect(landing.status).toBe(302)
	expect(landing.headers.get('location')).toBe(`${redirectTo}?token=${token}`)
	expect((await post(auth, '/reset-password', { token, newPassword })).status).toBe(200)
	const again = await post(auth, '/reset-password', { token, newPassword: 'a-third-real-password' })
	expect(again.status).toBe(400)
	expect(await again.json()).toMatchObject({ code: 'INVALID_TOKEN' })
	expect((await post(auth, '/sign-in/email', { email: 'reset@example.com', password })).status).toBe(401)
	expect((await post(auth, '/sign-in/email', { email: 'reset@example.com', password: newPassword })).status).toBe(200)
	const session = await auth.handler(
		new Request('http://localhost:3001/api/auth/get-session', { headers: { cookie: oldSession } })
	)
	expect(await session.json()).toBeNull()
})

test('a reset asked with a Minecraft name goes to that account; any other name gets the same answer, no email', async () => {
	const { auth, mails } = await authWithNames('reset-by-name')
	await post(auth, '/sign-up/email', { email: 'named@example.com', password, name: 'Named', username: 'Named' })
	const redirectTo = 'http://localhost:5173/login/reset'
	const byName = await post(auth, '/request-password-reset', { email: ' NAMED ', redirectTo })
	expect(byName.status).toBe(200)
	expect(mails.map(mail => mail.user.email)).toEqual(['named@example.com'])
	const answers = await Promise.all(
		['Unknown_name', 'not a name', '', 'nobody@example.com'].map(async email => {
			const response = await post(auth, '/request-password-reset', { email, redirectTo })
			return [response.status, await response.json()]
		})
	)
	expect(answers.slice(0, 2)).toEqual([
		[200, expect.objectContaining({ status: true })],
		[200, expect.objectContaining({ status: true })],
	])
	// An empty field is a malformed request, as before; an unknown email is answered like a known one.
	expect(answers[2]?.[0]).toBe(400)
	expect(answers[3]).toEqual([200, expect.objectContaining({ status: true })])
	expect(mails).toHaveLength(1)
})

test('existing accounts get their display name as sign-in name when it is a free Minecraft name, once', async () => {
	const database = new Database(join(directory, 'backfill.sqlite'), { create: true })
	databases.push(database)
	// The database as production has it today: accounts made before the username plugin existed.
	const before = betterAuth({ ...base(database), emailAndPassword: { enabled: true, minPasswordLength: 12 } })
	await (await getMigrations(before.options)).runMigrations()
	const names = ['Diablox', 'Alex', 'ALEX', 'Gold D. Diablox', 'Notch', 'Taken_later']
	await Promise.all(
		names.map((name, index) =>
			before.api.signUpEmail({ body: { email: `player${index}@example.com`, password, name } })
		)
	)
	const { auth } = await (async () => {
		const after = betterAuth({
			...base(database),
			plugins: [signInName()],
			emailAndPassword: { enabled: true, minPasswordLength: 12 },
		})
		await (await getMigrations(after.options)).runMigrations()
		return { auth: after }
	})()
	// Someone already chose "notch" as a sign-in name: the other Notch keeps none.
	database.query("UPDATE user SET username='notch', displayUsername='notch' WHERE name='Taken_later'").run()
	expect(backfillSignInNames(database)).toBe(1)
	expect(backfillSignInNames(database)).toBe(0)
	const rows = database.query('SELECT name, username, displayUsername FROM user ORDER BY email').all()
	expect(rows).toEqual([
		{ name: 'Diablox', username: 'diablox', displayUsername: 'Diablox' },
		{ name: 'Alex', username: null, displayUsername: null },
		{ name: 'ALEX', username: null, displayUsername: null },
		{ name: 'Gold D. Diablox', username: null, displayUsername: null },
		{ name: 'Notch', username: null, displayUsername: null },
		{ name: 'Taken_later', username: 'notch', displayUsername: 'notch' },
	])
	expect((await post(auth, '/sign-in/username', { username: 'diablox', password })).status).toBe(200)
})
