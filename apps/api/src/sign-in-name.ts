import type { Database } from 'bun:sqlite'
import type { BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { username } from 'better-auth/plugins'
import { RESET_REQUEST_PATH } from './auth-protection'

/**
 * A Minecraft Java name (`minecraftUsername` in packages/api-contract): what players type to sign in. Better Auth's
 * username plugin stores it lowercased in `user.username` (unique) and as typed in `user.displayUsername`.
 */
export const SIGN_IN_NAME = /^[A-Za-z0-9_]{3,16}$/
/** A reset asked for an unknown name goes on as an unknown address: same answer, same timing, no mail. */
const NOBODY = 'nobody@minemories.invalid'

export function signInName(): BetterAuthPlugin {
	return username({
		minUsernameLength: 3,
		maxUsernameLength: 16,
		usernameValidator: name => SIGN_IN_NAME.test(name),
	}) as BetterAuthPlugin
}

/** "Forgot your password?" accepts the Minecraft name too: the hook swaps it for that account's email. */
export const resetByName: BetterAuthPlugin = {
	id: 'reset-by-name',
	hooks: {
		before: [
			{
				matcher: context => context.path === RESET_REQUEST_PATH,
				handler: createAuthMiddleware(async context => {
					const body = context.body as { email?: unknown } | undefined
					const value = typeof body?.email === 'string' ? body.email.trim() : ''
					if (!value || value.includes('@')) return
					const user = SIGN_IN_NAME.test(value)
						? await context.context.adapter.findOne<{ email: string }>({
								model: 'user',
								where: [{ field: 'username', value: value.toLowerCase() }],
							})
						: null
					return { context: { body: { ...body, email: user?.email ?? NOBODY } } }
				}),
			},
		],
	},
}

/**
 * Accounts created before sign-in names get one from their display name, once: only when the name is a valid Minecraft
 * name that no other account uses (as a display name or a sign-in name, case ignored). Nothing is ever overwritten; a
 * clash stays empty and that player chooses a name in their account settings.
 */
export function backfillSignInNames(database: Database): number {
	const users = database.query('SELECT id, name, username FROM user').all() as Array<{
		id: string
		name: string | null
		username: string | null
	}>
	const taken = new Set(users.flatMap(user => (user.username ? [user.username] : [])))
	const nameCounts = new Map<string, number>()
	for (const user of users) {
		const key = user.name?.trim().toLowerCase()
		if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
	}
	const update = database.query('UPDATE user SET username=?, displayUsername=? WHERE id=? AND username IS NULL')
	let filled = 0
	for (const user of users) {
		const name = user.name?.trim() ?? ''
		const key = name.toLowerCase()
		if (user.username || !SIGN_IN_NAME.test(name) || nameCounts.get(key) !== 1 || taken.has(key)) continue
		update.run(key, name, user.id)
		taken.add(key)
		filled += 1
	}
	return filled
}
