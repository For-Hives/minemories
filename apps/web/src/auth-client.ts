import { usernameClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export const authClient = createAuthClient({
	baseURL: apiBase,
	fetchOptions: { credentials: 'include' },
	// Sign-in with the Minecraft name (apps/api/src/sign-in-name.ts).
	plugins: [usernameClient()],
})

export type AuthSession = NonNullable<typeof authClient.$Infer.Session>
