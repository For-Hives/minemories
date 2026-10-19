/** Only advertise providers whose two server credentials are configured. */
export function oauthProviders(env: Record<string, string | undefined>) {
	const providers: {
		google?: { clientId: string; clientSecret: string }
		discord?: { clientId: string; clientSecret: string }
	} = {}
	if (env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim())
		providers.google = { clientId: env.GOOGLE_CLIENT_ID.trim(), clientSecret: env.GOOGLE_CLIENT_SECRET.trim() }
	if (env.DISCORD_CLIENT_ID?.trim() && env.DISCORD_CLIENT_SECRET?.trim())
		providers.discord = { clientId: env.DISCORD_CLIENT_ID.trim(), clientSecret: env.DISCORD_CLIENT_SECRET.trim() }
	return providers
}
