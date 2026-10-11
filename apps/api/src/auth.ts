import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { authSecret } from './configuration'
import { database } from './database'
import { webOrigins } from './web-origins'

export const auth = betterAuth({
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
