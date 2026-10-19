import { expect, test } from 'bun:test'
import { oauthProviders } from './oauth-config'

test('unconfigured and partially configured OAuth providers are never advertised', () => {
	for (const env of [
		{},
		{ GOOGLE_CLIENT_ID: 'id' },
		{ GOOGLE_CLIENT_SECRET: 'secret' },
		{ DISCORD_CLIENT_ID: 'id' },
		{ DISCORD_CLIENT_SECRET: 'secret' },
		{ GOOGLE_CLIENT_ID: ' ', GOOGLE_CLIENT_SECRET: 's', DISCORD_CLIENT_ID: ' ', DISCORD_CLIENT_SECRET: 's' },
	])
		expect(oauthProviders(env)).toEqual({})
})
test('server OAuth configuration trims credentials and enables each complete provider', () => {
	expect(
		oauthProviders({
			GOOGLE_CLIENT_ID: ' g ',
			GOOGLE_CLIENT_SECRET: ' gs ',
			DISCORD_CLIENT_ID: ' d ',
			DISCORD_CLIENT_SECRET: ' ds ',
		})
	).toEqual({ google: { clientId: 'g', clientSecret: 'gs' }, discord: { clientId: 'd', clientSecret: 'ds' } })
})
