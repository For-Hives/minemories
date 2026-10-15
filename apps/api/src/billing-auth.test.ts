import { afterAll, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'minemories-billing-auth-'))
Object.assign(process.env, {
	DATABASE_PATH: join(root, 'db.sqlite'),
	LOCAL_OBJECTS_PATH: join(root, 'objects'),
	STORAGE_DRIVER: 'filesystem',
	COLD_STORAGE_PROVIDER: 'off',
	BETTER_AUTH_SECRET: 'isolated-billing-auth-secret-at-least-32-characters',
	PAIRING_PEPPER: 'isolated-billing-auth-pepper-at-least-32-characters',
	POLAR_ENVIRONMENT: 'sandbox',
	POLAR_ORGANIZATION_ID: '11111111-1111-4111-8111-111111111111',
	POLAR_ACCESS_TOKEN: 'isolated-billing-access-token-at-least-32-characters',
	POLAR_WEBHOOK_SECRET: 'isolated-billing-webhook-secret-at-least-32-characters',
	POLAR_PRODUCTS: JSON.stringify([{ slug: 'fixture', productId: '22222222-2222-4222-8222-222222222222' }]),
	WEB_ORIGIN: 'http://localhost:5173',
})
const { auth, billing, handleAuthRequest } = await import('./auth'),
	{ database } = await import('./database')
afterAll(() => {
	database.close()
	rmSync(root, { recursive: true, force: true })
})
test('configured application wires billing and sanitizes supplier authentication logs', async () => {
	expect(billing.config?.environment).toBe('sandbox')
	expect((await handleAuthRequest(new Request('http://localhost:3001/api/auth/get-session'))).status).toBe(200)
	const output = spyOn(console, 'error').mockImplementation(() => {})
	try {
		const context = await auth.$context
		context.logger.error('fixture-private-provider-response')
		context.logger.warn('fixture-private-provider-response')
		expect(output).toHaveBeenCalled()
		expect(JSON.stringify(output.mock.calls)).not.toContain('fixture-private-provider-response')
		expect(JSON.stringify(output.mock.calls)).toContain('billing_auth_failed')
	} finally {
		output.mockRestore()
	}
})
