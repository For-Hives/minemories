import { isIP } from 'node:net'
import { isAbsolute } from 'node:path'

type Environment = Readonly<Record<string, string | undefined>>

export const DEV_S3_ACCESS_KEY = 'GK0123456789abcdef0123456789abcdef'
export const DEV_S3_SECRET_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const byteCountPattern = /^\d+$/

export function accountStorageBytes(environment: Environment): number {
	const value = environment.ACCOUNT_STORAGE_BYTES ?? String(2 * 1024 * 1024 * 1024)
	const bytes = Number(value)
	if (!(byteCountPattern.test(value) && Number.isSafeInteger(bytes)) || bytes <= 0) {
		throw new Error('ACCOUNT_STORAGE_BYTES must be a positive safe integer in bytes.')
	}
	return bytes
}

export const ACCOUNT_STORAGE_BYTES = accountStorageBytes(process.env)

function requiredValue(environment: Environment, name: string): string {
	const value = environment[name]
	if (!value?.trim()) throw new Error(`${name} must be explicitly configured.`)
	return value
}

function requiredSecret(environment: Environment, name: string): string {
	const value = requiredValue(environment, name)
	if (value.trim().length < 32 || value.trim().startsWith('replace-with-')) {
		throw new Error(`${name} must be a random secret with at least 32 characters; example values are not accepted.`)
	}
	return value
}

export function authSecret(environment: Environment): string {
	return requiredSecret(environment, 'BETTER_AUTH_SECRET')
}

export function pairingPepper(environment: Environment): string {
	const pepper = requiredSecret(environment, 'PAIRING_PEPPER')
	if (pepper === environment.BETTER_AUTH_SECRET) {
		throw new Error('PAIRING_PEPPER must differ from BETTER_AUTH_SECRET.')
	}
	return pepper
}

function configuredUrl(environment: Environment, name: string, httpsOnly: boolean): URL {
	const value = requiredValue(environment, name)
	let url: URL
	try {
		url = new URL(value)
	} catch {
		throw new Error(`${name} must be an absolute HTTP URL.`)
	}
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		(httpsOnly && url.protocol !== 'https:') ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new Error(`${name} must use ${httpsOnly ? 'HTTPS' : 'HTTP or HTTPS'} without credentials, query or fragment.`)
	}
	return url
}

function persistentPath(environment: Environment, name: string): void {
	if (!isAbsolute(requiredValue(environment, name))) {
		throw new Error(`${name} must be an absolute path on a persistent volume.`)
	}
}

export function allowedWebOrigins(environment: Environment): string[] {
	const production = environment.NODE_ENV === 'production'
	const origins = production
		? requiredValue(environment, 'WEB_ORIGIN')
		: (environment.WEB_ORIGIN ?? 'http://localhost:5173')
	return origins.split(',').map(origin => {
		const url = configuredUrl({ WEB_ORIGIN: origin.trim() }, 'WEB_ORIGIN', production)
		if (url.pathname !== '/') throw new Error('WEB_ORIGIN must contain origins without paths.')
		return url.origin
	})
}

function validateS3(environment: Environment): void {
	const endpoint = configuredUrl(environment, 'S3_ENDPOINT', false)
	if (endpoint.pathname !== '/') throw new Error('S3_ENDPOINT must not contain a path.')
	for (const name of ['S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET', 'S3_REGION']) requiredValue(environment, name)
	if (environment.S3_ACCESS_KEY === DEV_S3_ACCESS_KEY || environment.S3_SECRET_KEY === DEV_S3_SECRET_KEY) {
		throw new Error('Production S3 credentials must differ from the development fixture credentials.')
	}
}

export function validateProductionConfiguration(environment: Environment): void {
	if (environment.NODE_ENV !== 'production') return
	accountStorageBytes(environment)
	authSecret(environment)
	pairingPepper(environment)
	configuredUrl(environment, 'BETTER_AUTH_URL', true)
	allowedWebOrigins(environment)
	const port = Number(environment.API_PORT ?? 3001)
	if (!Number.isInteger(port) || port < 1 || port > 65535)
		throw new Error('API_PORT must be an integer from 1 to 65535.')
	persistentPath(environment, 'DATABASE_PATH')
	persistentPath(environment, 'UPLOADS_PATH')
	const driver = environment.STORAGE_DRIVER ?? 's3'
	if (driver === 's3') validateS3(environment)
	else if (driver === 'filesystem') persistentPath(environment, 'LOCAL_OBJECTS_PATH')
	else throw new Error('STORAGE_DRIVER must be either "s3" or "filesystem".')
	for (const address of (environment.TRUSTED_PROXY_IPS ?? '').split(',').filter(value => value.trim())) {
		if (!isIP(address.trim())) throw new Error('TRUSTED_PROXY_IPS must contain exact IPv4 or IPv6 addresses.')
	}
}

validateProductionConfiguration(process.env)
