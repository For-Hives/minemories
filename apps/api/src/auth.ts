import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { createBilling } from './billing'
import { authSecret } from './configuration'
import { database } from './database'
import { logApiFailure } from './safe-errors'
import { webOrigins } from './web-origins'

export const billing = createBilling(database, process.env)
export const auth = betterAuth({
	plugins: billing.plugins,
	...(billing.config
		? {
				logger: {
					log(level: string) {
						if (level === 'error' || level === 'warn') logApiFailure('billing_auth_failed', 'auth')
					},
				},
			}
		: {}),
	appName: 'Minemories',
	baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
	secret: authSecret(process.env),
	database,
	trustedOrigins: webOrigins,
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 12,
	},
})

const { runMigrations } = await getMigrations(auth.options)
await runMigrations()

export function handleAuthRequest(request: Request): Promise<Response> {
	return billing.handle(request, incoming => auth.handler(incoming))
}
