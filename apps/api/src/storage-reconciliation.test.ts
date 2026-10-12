import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { classifyStorageCandidate, ORPHAN_GRACE_MS, type StorageCandidate } from './storage-reconciliation'
import { ObjectReferences } from './storage-references'

const database = new Database(':memory:')
database.exec(`CREATE TABLE devices (user_id TEXT); INSERT INTO devices VALUES ('owner');
	CREATE TABLE memories (object_key TEXT, user_id TEXT);
	CREATE TABLE mod_uploads (id TEXT, user_id TEXT, completed INTEGER);`)
const references = new ObjectReferences(database)
afterAll(() => database.close())
const id = '11111111-1111-4111-8111-111111111111'
const key = `owner/${id}.glb`
const now = 2 * ORPHAN_GRACE_MS
function candidate(overrides: Partial<StorageCandidate> = {}): StorageCandidate {
	return {
		key,
		object: { key, size: 1234, modified: 0, etag: 'original' },
		uploads: [],
		job: null,
		...overrides,
	}
}
function classify(value: StorageCandidate) {
	return classifyStorageCandidate(references, value, now)
}

test('historical canonical orphans are proposed, while unknown namespaces and filenames need review', () => {
	expect(classify(candidate())).toEqual({
		action: 'queue',
		reason: 'orphan_object',
		owner: 'owner',
		size: 1234,
		discardUpload: true,
	})
	for (const key of [`unknown/${id}.glb`, 'owner/capture.glb', `../${id}.glb`])
		expect(classify(candidate({ key })).action).toBe('review')
	expect(classify(candidate({ object: null })).action).toBe('gone')
})

test('every object and unfinished upload observes the grace period, including replaced or future-dated data', () => {
	const object = candidate().object
	if (!object) throw new Error('Missing fixture object')
	expect(classify(candidate({ object: { ...object, modified: now - ORPHAN_GRACE_MS } })).action).toBe('queue')
	for (const modified of [now - ORPHAN_GRACE_MS + 1, now + 1])
		expect(classify(candidate({ object: { ...object, modified } })).action).toBe('recent')
	for (const modified of [-1, Number.NaN])
		expect(classify(candidate({ object: { ...object, modified } })).action).toBe('review')
	const upload = { key, id: 'abandoned', created: 0 }
	expect(classify(candidate({ object: null, uploads: [upload] }))).toMatchObject({
		action: 'queue',
		size: null,
		discardUpload: true,
		reason: 'orphan_multipart_size_unknown',
	})
	expect(classify(candidate({ uploads: [upload, { ...upload, id: 'new', created: now }] })).action).toBe('recent')
})

test('legacy claims are backfilled only from attributable, exact information, retaining unknown original multipart sizes', () => {
	const job = { user_id: null, size: null, discard_upload: 0 }
	expect(classify(candidate({ job }))).toMatchObject({
		action: 'repair',
		owner: 'owner',
		size: 1234,
		discardUpload: false,
	})
	expect(classify(candidate({ job, object: null }))).toMatchObject({ action: 'repair', size: 0 })
	expect(classify(candidate({ job, object: null, uploads: [{ key, id: 'parts', created: 0 }] }))).toMatchObject({
		action: 'repair',
		size: null,
		reason: 'size_unrecoverable',
		discardUpload: true,
	})
	const complete = { user_id: 'owner', size: 1234, discard_upload: 1 }
	expect(classify(candidate({ job: complete })).action).toBe('unchanged')
	expect(
		classify(candidate({ job: { ...complete, size: null }, object: null, uploads: [{ key, id: 'parts', created: 0 }] }))
			.action
	).toBe('unchanged')
	for (const conflict of [
		{ ...job, user_id: 'someone-else' },
		{ ...job, size: -1 },
		{ ...job, size: 9999 },
	])
		expect(classify(candidate({ job: conflict })).action).toBe('review')
})

test('captured and incomplete-upload references are protected even when an obsolete deletion job exists', () => {
	database.query('INSERT INTO memories VALUES (?, ?)').run(key, 'owner')
	expect(classify(candidate()).action).toBe('protected')
	expect(classify(candidate({ job: { user_id: null, size: null, discard_upload: 0 } })).reason).toBe(
		'referenced_deletion_conflict'
	)
	database.exec('DELETE FROM memories')
	database.query('INSERT INTO mod_uploads VALUES (?, ?, 0)').run(id, 'owner')
	expect(classify(candidate()).action).toBe('protected')
	database.exec('UPDATE mod_uploads SET completed = 1')
	expect(classify(candidate()).action).toBe('queue')
	database.exec('DELETE FROM mod_uploads')
})
