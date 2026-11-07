// S3 client for the mod JAR bucket. Same environment variables as apps/api for Garage
// (S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY), with a bucket separate from captures.
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'

// Development credentials, identical to apps/api/src/configuration.ts (local Garage).
const DEV_S3_ACCESS_KEY = 'GK0123456789abcdef0123456789abcdef'
const DEV_S3_SECRET_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
export const DEFAULT_MOD_BUCKET = 'minemories-mods'
// Optional prefix: a single level, `[a-z0-9][a-z0-9-]*/`, at most 40 characters (slash included).
// No `.` and no inner `/`: neither `..`, `//` nor escaping the prefix can be expressed.
const MOD_PREFIX_PATTERN = /^(?:[a-z0-9][a-z0-9-]{0,38}\/)?$/

/** Validates `MOD_STORAGE_PREFIX`: empty (default) or one level ending with `/`. Throws a clear error otherwise. */
export function parseModPrefix(value) {
	const prefix = value ?? ''
	if (typeof prefix !== 'string' || !MOD_PREFIX_PATTERN.test(prefix))
		throw new Error(
			`Invalid MOD_STORAGE_PREFIX: must be empty, or a single level "[a-z0-9][a-z0-9-]*/" of 1 to 40 characters ending with "/" (e.g. public-mods/). Got: ${JSON.stringify(prefix)}`
		)
	return prefix
}

/** Connection settings: MOD_S3_* overrides S3_* (a release tool may use different keys than the API). */
export function storageSettings(env = process.env) {
	return {
		bucket: env.MOD_STORAGE_BUCKET || DEFAULT_MOD_BUCKET,
		prefix: parseModPrefix(env.MOD_STORAGE_PREFIX),
		endpoint: env.MOD_S3_ENDPOINT || env.S3_ENDPOINT || 'http://127.0.0.1:3900',
		region: env.MOD_S3_REGION || env.S3_REGION || 'garage',
		accessKeyId: env.MOD_S3_ACCESS_KEY || env.S3_ACCESS_KEY || DEV_S3_ACCESS_KEY,
		secretAccessKey: env.MOD_S3_SECRET_KEY || env.S3_SECRET_KEY || DEV_S3_SECRET_KEY,
	}
}

export function createClient(env = process.env) {
	const settings = storageSettings(env)
	return new S3Client({
		endpoint: settings.endpoint,
		region: settings.region,
		forcePathStyle: true,
		maxAttempts: 3,
		credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
		// Garage does not implement the SDK's optional CRC extensions.
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED',
	})
}

export function isNotFound(error) {
	if (!error) return false
	const status = error.$metadata?.httpStatusCode
	return status === 404 || error.name === 'NotFound' || error.name === 'NoSuchKey' || error.name === 'NoSuchBucket'
}

/** Creates the bucket when missing, except in production where it must be provisioned explicitly. */
export async function ensureBucket(client, env = process.env) {
	const { bucket, region } = storageSettings(env)
	try {
		await client.send(new HeadBucketCommand({ Bucket: bucket }))
	} catch (error) {
		if (!isNotFound(error)) throw error
		if (env.NODE_ENV === 'production')
			throw new Error(`Bucket ${bucket} does not exist (automatic creation is disabled in production).`)
		await client.send(
			new CreateBucketCommand({
				Bucket: bucket,
				CreateBucketConfiguration: region === 'us-east-1' ? undefined : { LocationConstraint: region },
			})
		)
	}
}
