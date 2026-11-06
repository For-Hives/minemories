// Client S3 du bucket des JAR du mod. Mêmes variables d'environnement que apps/api pour Garage
// (S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY), bucket distinct des captures.
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'

// Identifiants de développement identiques à apps/api/src/configuration.ts (Garage local).
const DEV_S3_ACCESS_KEY = 'GK0123456789abcdef0123456789abcdef'
const DEV_S3_SECRET_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
export const DEFAULT_MOD_BUCKET = 'minemories-mods'
// Préfixe facultatif : un seul niveau, `[a-z0-9][a-z0-9-]*/`, 40 caractères au plus (barre oblique comprise).
// Aucun `.`, aucun `/` interne : ni `..` ni `//` ni sortie du préfixe ne sont exprimables.
const MOD_PREFIX_PATTERN = /^(?:[a-z0-9][a-z0-9-]{0,38}\/)?$/

/** Valide `MOD_STORAGE_PREFIX` : vide (défaut) ou un niveau terminé par `/`. Lève une erreur claire sinon. */
export function parseModPrefix(value) {
	const prefix = value ?? ''
	if (typeof prefix !== 'string' || !MOD_PREFIX_PATTERN.test(prefix))
		throw new Error(
			`MOD_STORAGE_PREFIX invalide : vide, ou un seul niveau « [a-z0-9][a-z0-9-]*/ » de 1 à 40 caractères terminé par « / » (ex. public-mods/). Reçu : ${JSON.stringify(prefix)}`
		)
	return prefix
}

/** Paramètres de connexion : MOD_S3_* surcharge S3_* (un outil de release peut avoir d'autres clés que l'API). */
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
		// Garage n'implémente pas les extensions CRC optionnelles du SDK.
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED',
	})
}

export function isNotFound(error) {
	if (!error) return false
	const status = error.$metadata?.httpStatusCode
	return status === 404 || error.name === 'NotFound' || error.name === 'NoSuchKey' || error.name === 'NoSuchBucket'
}

/** Crée le bucket s'il manque, sauf en production où il doit être provisionné explicitement. */
export async function ensureBucket(client, env = process.env) {
	const { bucket, region } = storageSettings(env)
	try {
		await client.send(new HeadBucketCommand({ Bucket: bucket }))
	} catch (error) {
		if (!isNotFound(error)) throw error
		if (env.NODE_ENV === 'production')
			throw new Error(`Le bucket ${bucket} n'existe pas (création automatique désactivée en production).`)
		await client.send(
			new CreateBucketCommand({
				Bucket: bucket,
				CreateBucketConfiguration: region === 'us-east-1' ? undefined : { LocationConstraint: region },
			})
		)
	}
}
