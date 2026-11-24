import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { authProtection } from './auth-protection'
import { createBilling } from './billing'
import { authSecret } from './configuration'
import { database } from './database'
import { oauthProviders } from './oauth-config'
import { passwordResetSender, RESET_TOKEN_SECONDS } from './password-reset'
import { logApiFailure } from './safe-errors'
import { backfillSignInNames, resetByName, signInName } from './sign-in-name'
import { webOrigins } from './web-origins'

export const billing = createBilling(database, process.env)
const sendResetPassword = passwordResetSender(process.env)
const protection = authProtection(process.env)
export const auth = betterAuth({
	plugins: [...billing.plugins, ...protection.plugins, signInName(), resetByName],
	// It would tell anyone which names have an account; sign-up already refuses a taken one.
	disabledPaths: ['/is-username-available'],
	rateLimit: protection.rateLimit,
	advanced: protection.advanced,
	socialProviders: oauthProviders(process.env),
	account: { accountLinking: { enabled: true, disableImplicitLinking: true } },
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
		...(sendResetPassword ? { sendResetPassword } : {}),
		resetPasswordTokenExpiresIn: RESET_TOKEN_SECONDS,
		revokeSessionsOnPasswordReset: true,
	},
})

const { runMigrations } = await getMigrations(auth.options)
await runMigrations()
backfillSignInNames(database)

export function handleAuthRequest(request: Request): Promise<Response> {
	return billing.handle(request, incoming => auth.handler(incoming))
}
