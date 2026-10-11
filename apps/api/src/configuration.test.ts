import { expect, test } from 'bun:test'
import {
	accountStorageBytes,
	allowedWebOrigins,
	authSecret,
	DEV_S3_ACCESS_KEY,
	DEV_S3_SECRET_KEY,
	pairingPepper,
	validateProductionConfiguration,
} from './configuration'

const production = {
	NODE_ENV: 'production',
	BETTER_AUTH_SECRET: 'configuration-fixture-auth-secret-at-least-32-characters',
	PAIRING_PEPPER: 'configuration-fixture-pairing-pepper-at-least-32-characters',
	BETTER_AUTH_URL: 'https://api.example.test',
	WEB_ORIGIN: 'https://example.test, https://www.example.test',
	DATABASE_PATH: '/fixture/db.sqlite',
	UPLOADS_PATH: '/fixture/uploads',
	S3_ENDPOINT: 'http://garage:3900',
	S3_ACCESS_KEY: 'fixture-access-key',
	S3_SECRET_KEY: 'fixture-secret-key',
	S3_BUCKET: 'fixture-bucket',
	S3_REGION: 'garage',
}

test('account storage has a finite default and accepts only positive safe integer bytes', () => {
	expect(accountStorageBytes({})).toBe(2 * 1024 * 1024 * 1024)
	expect(accountStorageBytes({ ACCOUNT_STORAGE_BYTES: '2147483648' })).toBe(2 * 1024 * 1024 * 1024)
	expect(accountStorageBytes({ ACCOUNT_STORAGE_BYTES: '1' })).toBe(1)
	for (const value of ['', ' ', '0', '-1', '1.5', 'NaN', 'Infinity', '1e9', '9007199254740992', 'private-fixture']) {
		expect(() => accountStorageBytes({ ACCOUNT_STORAGE_BYTES: value })).toThrow('ACCOUNT_STORAGE_BYTES')
		expect(() => validateProductionConfiguration({ ...production, ACCOUNT_STORAGE_BYTES: value })).toThrow(
			'ACCOUNT_STORAGE_BYTES'
		)
	}
})

test('secrets are explicit, sufficiently long, distinct and never replaced by each other', () => {
	expect(authSecret(production)).toBe(production.BETTER_AUTH_SECRET)
	expect(pairingPepper(production)).toBe(production.PAIRING_PEPPER)
	for (const invalid of [undefined, '', '   ', 'short', 'replace-with-a-random-secret-at-least-32-characters']) {
		expect(() => authSecret({ BETTER_AUTH_SECRET: invalid })).toThrow('BETTER_AUTH_SECRET')
		expect(() => pairingPepper({ ...production, PAIRING_PEPPER: invalid })).toThrow('PAIRING_PEPPER')
	}
	expect(() => pairingPepper({ ...production, PAIRING_PEPPER: production.BETTER_AUTH_SECRET })).toThrow('must differ')
	expect(pairingPepper({ PAIRING_PEPPER: production.PAIRING_PEPPER })).toBe(production.PAIRING_PEPPER)
})

test('production accepts explicit S3 or filesystem configuration and exact proxy addresses', () => {
	expect(() => validateProductionConfiguration(production)).not.toThrow()
	expect(() =>
		validateProductionConfiguration({
			...production,
			STORAGE_DRIVER: 's3',
			API_PORT: '65535',
			TRUSTED_PROXY_IPS: '127.0.0.1, ::1, ',
		})
	).not.toThrow()
	expect(() =>
		validateProductionConfiguration({
			...production,
			STORAGE_DRIVER: 'filesystem',
			LOCAL_OBJECTS_PATH: '/fixture/objects',
			API_PORT: '1',
		})
	).not.toThrow()
	expect(() => validateProductionConfiguration({ NODE_ENV: 'development' })).not.toThrow()
	expect(allowedWebOrigins({})).toEqual(['http://localhost:5173'])
	expect(allowedWebOrigins({ WEB_ORIGIN: ' http://LOCALHOST:5173/, https://EXAMPLE.test:443/ ' })).toEqual([
		'http://localhost:5173',
		'https://example.test',
	])
})

test('production requires explicit URLs, paths, credentials, bucket and region', () => {
	for (const name of Object.keys(production).filter(name => name !== 'NODE_ENV')) {
		expect(() => validateProductionConfiguration({ ...production, [name]: undefined })).toThrow(name)
	}
	for (const name of ['DATABASE_PATH', 'UPLOADS_PATH']) {
		expect(() => validateProductionConfiguration({ ...production, [name]: './data' })).toThrow(name)
	}
	expect(() =>
		validateProductionConfiguration({
			...production,
			STORAGE_DRIVER: 'filesystem',
			LOCAL_OBJECTS_PATH: './data/objects',
		})
	).toThrow('LOCAL_OBJECTS_PATH')
	expect(() => validateProductionConfiguration({ ...production, STORAGE_DRIVER: 'unknown' })).toThrow('STORAGE_DRIVER')
	expect(() => validateProductionConfiguration({ ...production, S3_ACCESS_KEY: DEV_S3_ACCESS_KEY })).toThrow('fixture')
	expect(() => validateProductionConfiguration({ ...production, S3_SECRET_KEY: DEV_S3_SECRET_KEY })).toThrow('fixture')
})

test('production rejects malformed or unsafe URLs without echoing their contents', () => {
	for (const value of [
		'invalid',
		'http://example.test',
		'ftp://example.test',
		'https://user:private-password@example.test',
		'https://example.test?private=secret',
		'https://example.test#private',
	]) {
		for (const name of ['BETTER_AUTH_URL', 'WEB_ORIGIN']) {
			try {
				validateProductionConfiguration({ ...production, [name]: value })
				throw new Error('Invalid URL accepted')
			} catch (error) {
				expect(String(error)).toContain(name)
				expect(String(error)).not.toContain(value)
			}
		}
	}
	expect(() => validateProductionConfiguration({ ...production, WEB_ORIGIN: 'https://example.test/path' })).toThrow(
		'paths'
	)
	expect(() => validateProductionConfiguration({ ...production, WEB_ORIGIN: 'https://example.test,' })).toThrow(
		'WEB_ORIGIN'
	)
	expect(() => validateProductionConfiguration({ ...production, S3_ENDPOINT: 'http://garage:3900/path' })).toThrow(
		'S3_ENDPOINT'
	)
	expect(() => validateProductionConfiguration({ ...production, S3_ENDPOINT: 'ftp://garage' })).toThrow('HTTP or HTTPS')
	for (const port of ['', '0', '-1', '65536', 'NaN', '3001.5']) {
		expect(() => validateProductionConfiguration({ ...production, API_PORT: port })).toThrow('API_PORT')
	}
	expect(() => validateProductionConfiguration({ ...production, TRUSTED_PROXY_IPS: '127.0.0.1,proxy.local' })).toThrow(
		'TRUSTED_PROXY_IPS'
	)
})
