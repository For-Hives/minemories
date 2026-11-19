import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import {
	AUTH_RATE_LIMIT_RULES,
	authProtection,
	CLIENT_IP_HEADER,
	SIGN_IN_PATH,
	SIGN_UP_PATH,
	SIGN_UP_UNAVAILABLE,
	signUpUnavailable,
} from './auth-protection'

const directory = mkdtempSync(join(tmpdir(), 'minemories-auth-protection-'))
const databases: Database[] = []
const verifications: Array<{ secret: unknown; response: unknown; remoteip: unknown }> = []
// Stands in for Cloudflare's siteverify endpoint, so the suite never leaves the machine.
const siteVerify = Bun.serve({
	port: 0,
	hostname: '127.0.0.1',
	async fetch(request) {
		const body = (await request.json()) as { secret: unknown; response: unknown; remoteip: unknown }
		verifications.push(body)
		return Response.json({ success: body.response === 'valid-token', hostname: 'minemories.net' })
	},
})

afterAll(() => {
	siteVerify.stop(true)
	for (const database of databases) database.close()
	rmSync(directory, { recursive: true, force: true })
})

async function protectedAuth(name: string, environment: Record<string, string>, rateLimit = true) {
	const database = new Database(join(directory, `${name}.sqlite`), { create: true })
	databases.push(database)
	const protection = authProtection(environment, { siteVerifyURL: new URL('/siteverify', siteVerify.url).href })
	const auth = betterAuth({
		...protection,
		rateLimit: { ...protection.rateLimit, enabled: rateLimit },
		baseURL: 'http://localhost:3001',
		secret: 'auth-protection-test-secret-with-32-characters',
		database,
		trustedOrigins: ['http://localhost:5173'],
		logger: { disabled: true },
		emailAndPassword: { enabled: true, minPasswordLength: 12 },
	})
	const { runMigrations } = await getMigrations(auth.options)
	await runMigrations()
	return auth
}

function post(
	auth: { handler: (request: Request) => Promise<Response> },
	path: string,
	body: unknown,
	headers: Record<string, string> = {}
) {
	return auth.handler(
		new Request(`http://localhost:3001/api/auth${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', ...headers },
			body: JSON.stringify(body),
		})
	)
}

const account = (email: string) => ({ email, password: 'a-real-test-password', name: 'Tester' })

test('outside production the limits stay off and sign-up needs no Turnstile, so local runs stay offline', () => {
	const protection = authProtection({ NODE_ENV: 'development' })
	expect(protection.plugins).toEqual([])
	expect(protection.rateLimit).toEqual({ enabled: false, storage: 'database', customRules: AUTH_RATE_LIMIT_RULES })
	expect(protection.advanced).toEqual({ ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } })
})

test('production limits sign-up to 3 an hour and sign-in to 10 per 10 minutes per client address', () => {
	const protection = authProtection({ NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'secret' })
	expect(protection.rateLimit.enabled).toBe(true)
	expect(protection.rateLimit.storage).toBe('database')
	expect(protection.rateLimit.customRules).toEqual({
		[SIGN_UP_PATH]: { window: 3600, max: 3 },
		[SIGN_IN_PATH]: { window: 600, max: 10 },
	})
	expect(protection.plugins.map(plugin => plugin.id)).toEqual(['captcha'])
	expect(protection.advanced.ipAddress?.ipAddressHeaders).toEqual(['x-forwarded-for'])
})

test('declared proxies are skipped from the right of a forwarded chain', () => {
	const protection = authProtection({ TRUSTED_PROXY_IPS: ' 10.0.0.2, ,10.0.0.3 ' })
	expect(protection.advanced.ipAddress?.trustedProxies).toEqual(['10.0.0.2', '10.0.0.3'])
})

test('production without a Turnstile secret refuses sign-up but keeps sign-in', async () => {
	const protection = authProtection({ NODE_ENV: 'production', TURNSTILE_SECRET_KEY: '  ' })
	expect(protection.plugins).toEqual([signUpUnavailable])
	const auth = await protectedAuth('no-secret', { NODE_ENV: 'production' }, false)
	const refused = await post(auth, SIGN_UP_PATH, account('robot@example.com'))
	expect(refused.status).toBe(503)
	expect(await refused.json()).toMatchObject({ code: SIGN_UP_UNAVAILABLE })
	const trailing = await post(auth, `${SIGN_UP_PATH}/`, account('robot@example.com'))
	expect(trailing.status).toBe(503)
	const signIn = await post(auth, SIGN_IN_PATH, { email: 'robot@example.com', password: 'a-real-test-password' })
	expect(signIn.status).toBe(401)
	expect(verifications).toEqual([])
})

test('sign-up without a Turnstile token, or with a rejected one, creates no account', async () => {
	const auth = await protectedAuth(
		'captcha',
		{ NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'turnstile-secret' },
		false
	)
	const missing = await post(auth, SIGN_UP_PATH, account('missing@example.com'))
	expect(missing.status).toBe(400)
	expect(await missing.json()).toMatchObject({ code: 'MISSING_RESPONSE' })
	const rejected = await post(auth, SIGN_UP_PATH, account('rejected@example.com'), {
		'x-captcha-response': 'forged-token',
		[CLIENT_IP_HEADER]: '203.0.113.7',
	})
	expect(rejected.status).toBe(403)
	expect(await rejected.json()).toMatchObject({ code: 'VERIFICATION_FAILED' })
	expect(verifications.at(-1)).toEqual({
		secret: 'turnstile-secret',
		response: 'forged-token',
		remoteip: '203.0.113.7',
	})
	const accepted = await post(auth, SIGN_UP_PATH, account('human@example.com'), { 'x-captcha-response': 'valid-token' })
	expect(accepted.status).toBe(200)
	// Sign-in is not behind Turnstile: the mod's pairing and returning players are not slowed down.
	const signIn = await post(auth, SIGN_IN_PATH, { email: 'human@example.com', password: 'a-real-test-password' })
	expect(signIn.status).toBe(200)
})

test('the fourth sign-up from one address within the hour is refused, another address still gets in', async () => {
	const auth = await protectedAuth('rate-limit', { NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'turnstile-secret' })
	const from = (address: string, index: number) =>
		post(auth, SIGN_UP_PATH, account(`player-${address}-${index}@example.com`), {
			'x-captcha-response': 'valid-token',
			[CLIENT_IP_HEADER]: address,
		})
	for (const index of [1, 2, 3]) {
		// biome-ignore lint/performance/noAwaitInLoops: the limit counts requests in order.
		expect((await from('198.51.100.1', index)).status).toBe(200)
	}
	const limited = await from('198.51.100.1', 4)
	expect(limited.status).toBe(429)
	expect(Number(limited.headers.get('x-retry-after'))).toBeGreaterThan(3500)
	expect((await from('198.51.100.2', 1)).status).toBe(200)
})

test('ten failed sign-ins from one address lock that address for ten minutes', async () => {
	const auth = await protectedAuth('sign-in-limit', {
		NODE_ENV: 'production',
		TURNSTILE_SECRET_KEY: 'turnstile-secret',
	})
	const attempt = () =>
		post(
			auth,
			SIGN_IN_PATH,
			{ email: 'nobody@example.com', password: 'a-wrong-password-guess' },
			{ [CLIENT_IP_HEADER]: '192.0.2.10' }
		)
	for (let index = 0; index < 10; index++) {
		// biome-ignore lint/performance/noAwaitInLoops: the limit counts requests in order.
		expect((await attempt()).status).toBe(401)
	}
	const limited = await attempt()
	expect(limited.status).toBe(429)
	expect(Number(limited.headers.get('x-retry-after'))).toBeGreaterThan(500)
})
