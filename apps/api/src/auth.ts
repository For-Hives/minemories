import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { database } from './database'

const authSecret = process.env.BETTER_AUTH_SECRET
if (!authSecret || authSecret.length < 32) {
	throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters. Copy .env.example and set it.')
}

const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173'

export const auth = betterAuth({
	appName: 'Minemories',
	baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
	secret: authSecret,
	database,
	trustedOrigins: [webOrigin],
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 12,
	},
})

const { runMigrations } = await getMigrations(auth.options)
await runMigrations()
