import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { assertColdStorageIdentity, coldStorageTarget, verifyColdStorageTarget } from './cold-storage-target'
import { migrateObjectTiers } from './object-tiers'

const configured = {
	COLD_STORAGE_PROVIDER: 'aws',
	COLD_STORAGE_CLASS: 'GLACIER',
	S3_ENDPOINT: 'https://s3.eu-west-3.amazonaws.com',
	S3_BUCKET: 'private-captures',
	S3_REGION: 'eu-west-3',
}

test('cold storage is opt-in and requires an explicit provider, class and HTTPS target', () => {
	expect(coldStorageTarget({})).toBeNull()
	expect(coldStorageTarget({ COLD_STORAGE_PROVIDER: 'off', STORAGE_DRIVER: 'filesystem' })).toBeNull()
	expect(coldStorageTarget(configured)).toEqual({
		provider: 'aws',
		archiveClass: 'GLACIER',
		endpoint: configured.S3_ENDPOINT,
		bucket: 'private-captures',
		region: 'eu-west-3',
	})
	expect(
		coldStorageTarget({ ...configured, COLD_STORAGE_PROVIDER: 'r2', COLD_STORAGE_CLASS: 'STANDARD_IA' })?.provider
	).toBe('r2')
	expect(coldStorageTarget({ ...configured, COLD_STORAGE_CLASS: 'DEEP_ARCHIVE' })?.archiveClass).toBe('DEEP_ARCHIVE')
	for (const changes of [
		{ COLD_STORAGE_PROVIDER: '' },
		{ COLD_STORAGE_PROVIDER: 'garage' },
		{ STORAGE_DRIVER: 'filesystem' },
		{ COLD_STORAGE_CLASS: 'GLACIER_IR' },
		{ COLD_STORAGE_CLASS: undefined },
		{ COLD_STORAGE_PROVIDER: 'r2' },
		{ S3_BUCKET: undefined },
		{ S3_REGION: ' auto ' },
		{ S3_ENDPOINT: 'invalid' },
		{ S3_ENDPOINT: 'http://localhost' },
		{ S3_ENDPOINT: 'https://user:secret@example.test' },
		{ S3_ENDPOINT: 'https://example.test/path' },
		{ S3_ENDPOINT: 'https://example.test/?secret=token' },
		{ S3_ENDPOINT: 'https://example.test/#fragment' },
	])
		expect(() => coldStorageTarget({ ...configured, ...changes })).toThrow()
})

test('binding survives a new SQLite connection, permits disabling and credential rotation, and fences target changes', () => {
	const db = new Database(':memory:')
	try {
		assertColdStorageIdentity(db, {})
		migrateObjectTiers(db)
		expect(verifyColdStorageTarget(db, {})).toBeNull()
		expect(db.query('SELECT * FROM object_tier_target').all()).toEqual([])
		expect(verifyColdStorageTarget(db, configured)?.provider).toBe('aws')
		assertColdStorageIdentity(db, configured)
		expect(() => assertColdStorageIdentity(db, { S3_ENDPOINT: 'private-invalid-url' })).toThrow(
			'Invalid cold storage target URL.'
		)
		expect(() => assertColdStorageIdentity(db, {})).toThrow('target changed')
		const snapshot = db.serialize()
		const restarted = Database.deserialize(snapshot)
		try {
			expect(verifyColdStorageTarget(restarted, { ...configured, S3_ACCESS_KEY: 'rotated' })?.provider).toBe('aws')
			expect(verifyColdStorageTarget(restarted, { ...configured, COLD_STORAGE_PROVIDER: 'off' })).toBeNull()
			expect(verifyColdStorageTarget(restarted, { ...configured, COLD_STORAGE_PROVIDER: undefined })).toBeNull()
			for (const changes of [
				{ S3_ENDPOINT: 'https://s3.eu-west-3.amazonaws.com/prefix', COLD_STORAGE_PROVIDER: 'off' },
				{ S3_ENDPOINT: 'https://s3.eu-west-3.amazonaws.com/?other=1', COLD_STORAGE_PROVIDER: 'off' },
				{ S3_BUCKET: 'another' },
				{ S3_REGION: 'another' },
				{ S3_ENDPOINT: 'https://other.test' },
				{ STORAGE_DRIVER: 'filesystem', COLD_STORAGE_PROVIDER: 'off' },
				{ COLD_STORAGE_CLASS: 'DEEP_ARCHIVE' },
				{ COLD_STORAGE_PROVIDER: 'r2', COLD_STORAGE_CLASS: 'STANDARD_IA' },
			])
				expect(() => verifyColdStorageTarget(restarted, { ...configured, ...changes })).toThrow()
			expect(restarted.query('SELECT * FROM object_tier_target').all()).toEqual(
				db.query('SELECT * FROM object_tier_target').all()
			)
		} finally {
			restarted.close()
		}
	} finally {
		db.close()
	}
})

test('existing unbound operations cannot be silently assigned to a newly configured bucket', () => {
	const db = new Database(':memory:')
	try {
		migrateObjectTiers(db)
		db.query(
			"INSERT INTO object_tiers(object_key,state,operation_id,updated_at) VALUES ('owner/key.glb','archiving','operation',0)"
		).run()
		expect(() => verifyColdStorageTarget(db, configured)).toThrow('unidentified')
		expect(() => verifyColdStorageTarget(db, {})).toThrow('unidentified')
		expect(db.query('SELECT * FROM object_tier_target').all()).toEqual([])
	} finally {
		db.close()
	}
})
