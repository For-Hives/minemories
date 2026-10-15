import type { Database } from 'bun:sqlite'

type Environment = Readonly<Record<string, string | undefined>>
export interface ColdStorageTarget {
	provider: 'aws' | 'r2'
	archiveClass: 'GLACIER' | 'DEEP_ARCHIVE' | 'STANDARD_IA'
	endpoint: string
	bucket: string
	region: string
}

function required(environment: Environment, name: string): string {
	const value = environment[name]
	if (!value || value !== value.trim())
		throw new Error(`${name} must be explicitly configured without surrounding spaces.`)
	return value
}

function endpoint(value: string): string {
	let url: URL
	try {
		url = new URL(value)
	} catch {
		throw new Error('Cold storage requires a valid S3_ENDPOINT.')
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
		throw new Error('Cold storage requires an HTTPS S3_ENDPOINT without credentials, path, query or fragment.')
	}
	return url.origin
}

/** Opt-in only; parsing never performs cloud operations or chooses a commercial provider. */
export function coldStorageTarget(environment: Environment): ColdStorageTarget | null {
	const provider = environment.COLD_STORAGE_PROVIDER
	if (provider === undefined || provider === 'off') return null
	if (provider !== 'aws' && provider !== 'r2') throw new Error('COLD_STORAGE_PROVIDER must be off, aws or r2.')
	if ((environment.STORAGE_DRIVER ?? 's3') !== 's3') throw new Error('Cold storage requires STORAGE_DRIVER=s3.')
	const archiveClass = required(environment, 'COLD_STORAGE_CLASS')
	if (!['GLACIER', 'DEEP_ARCHIVE', 'STANDARD_IA'].includes(archiveClass)) throw new Error('Invalid COLD_STORAGE_CLASS.')
	if (provider === 'r2' && archiveClass !== 'STANDARD_IA') throw new Error('R2 cold storage requires STANDARD_IA.')
	return {
		provider,
		archiveClass: archiveClass as ColdStorageTarget['archiveClass'],
		endpoint: endpoint(required(environment, 'S3_ENDPOINT')),
		bucket: required(environment, 'S3_BUCKET'),
		region: required(environment, 'S3_REGION'),
	}
}

function storageIdentity(environment: Environment): string {
	let storageUrl: URL
	try {
		storageUrl = new URL(environment.S3_ENDPOINT ?? 'http://127.0.0.1:3900')
	} catch {
		throw new Error('Invalid cold storage target URL.')
	}
	return JSON.stringify({
		driver: environment.STORAGE_DRIVER ?? 's3',
		endpoint: storageUrl.href,
		bucket: environment.S3_BUCKET ?? 'minemories',
		region: environment.S3_REGION ?? 'garage',
	})
}

/** Read-only guard for maintenance tools, including databases predating cold storage. */
export function assertColdStorageIdentity(database: Database, environment: Environment): void {
	if (!database.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='object_tier_target'").get()) return
	const previous = database.query('SELECT storage_identity FROM object_tier_target WHERE id=1').get() as {
		storage_identity: string
	} | null
	if (previous && previous.storage_identity !== storageIdentity(environment)) {
		throw new Error('Cold storage target changed; migrate physical objects and their catalog before starting the API.')
	}
}

/** Check even when the worker is disabled: published locations still serve reads and deletions. */
export function verifyColdStorageTarget(database: Database, environment: Environment): ColdStorageTarget | null {
	database.exec(`CREATE TABLE IF NOT EXISTS object_tier_target (
	 id INTEGER PRIMARY KEY CHECK(id=1),storage_identity TEXT NOT NULL,policy_identity TEXT NOT NULL
	)`)
	const target = coldStorageTarget(environment)
	return database
		.transaction(() => {
			const previous = database
				.query('SELECT storage_identity,policy_identity FROM object_tier_target WHERE id=1')
				.get() as {
				storage_identity: string
				policy_identity: string
			} | null
			assertColdStorageIdentity(database, environment)
			if (!previous && unidentifiedObjects(database)) {
				throw new Error('Cannot bind an unidentified existing cold storage catalog; reconcile it before activation.')
			}
			if (!target) return null
			const policy = JSON.stringify({ provider: target.provider, archiveClass: target.archiveClass })
			if (previous) {
				if (previous.policy_identity !== policy)
					throw new Error('Cold storage policy changed; an explicit migration is required.')
				return target
			}
			database.query('INSERT INTO object_tier_target VALUES (1,?,?)').run(storageIdentity(environment), policy)
			return target
		})
		.immediate()
}

function unidentifiedObjects(database: Database): boolean {
	return Boolean(
		database
			.query(`SELECT 1 FROM object_tiers UNION ALL SELECT 1 FROM object_tier_locations
	 UNION ALL SELECT 1 FROM object_tier_copies UNION ALL SELECT 1 FROM object_tier_garbage LIMIT 1`)
			.get()
	)
}
