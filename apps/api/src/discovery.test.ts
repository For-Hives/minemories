import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateDiscovery, PublicDiscovery } from './discovery'

const resources: { db: Database; path: string }[] = []
afterEach(() => {
	for (const resource of resources.splice(0)) {
		resource.db.close()
		rmSync(resource.path, { recursive: true, force: true })
	}
})
function fixture() {
	const path = mkdtempSync(join(tmpdir(), 'minemories-discovery-'))
	const db = new Database(join(path, 'db.sqlite'))
	resources.push({ db, path })
	db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE memories(id TEXT PRIMARY KEY,user_id TEXT,object_key TEXT,deleted_at INTEGER);`)
	migrateDiscovery(db)
	let now = 1_800_000_000_000
	const service = new PublicDiscovery(db, new Set(['moderator', 'owner-moderator']), () => now)
	function memory(user = 'owner') {
		const id = randomUUID()
		db.query('INSERT INTO memories VALUES (?,?,?,NULL)').run(id, user, `${user}/${id}.glb`)
		return id
	}
	function publish(memoryId = memory(), user = 'owner', title = 'Village') {
		return service.publish(user, { memoryId, title, description: 'A build', category: 'build', thumbnail: null })
	}
	function approved() {
		const candidate = publish()
		service.moderate('moderator', candidate.id, 'approved', '')
		return candidate.id
	}
	return {
		db,
		path,
		service,
		memory,
		publish,
		approved,
		advance: (time = 3_600_000) => {
			now += time
		},
	}
}
const listing = { query: '', sort: 'recent' as const, page: 0 }

test('private by default, consent candidate hidden until another moderator approves', () => {
	const f = fixture()
	const memoryId = f.memory()
	expect(f.service.status('owner', memoryId)).toEqual({ id: null, state: 'private', reason: null })
	expect(f.service.revoke('owner', memoryId).state).toBe('private')
	const candidate = f.publish(memoryId)
	expect(f.service.list(null, listing).items).toEqual([])
	expect(() => f.service.get(candidate.id, null)).toThrow('Not Found')
	expect(() => f.service.file(candidate.id, 'owner')).toThrow('Not Found')
	expect(() => f.service.queue(null, { state: 'pending', page: 0 })).toThrow('Forbidden')
	expect(() => f.service.moderate('stranger', candidate.id, 'approved', '')).toThrow('Forbidden')
	expect(() => f.service.review(candidate.id, 'owner')).toThrow('Forbidden')
	expect(f.service.review(candidate.id, 'moderator').title).toBe('Village')
	expect(f.service.file(candidate.id, 'moderator').object_key).toContain(memoryId)
	expect(f.service.queue('moderator', { state: 'pending', page: 0 }).items).toHaveLength(1)
	expect(f.service.moderate('moderator', candidate.id, 'approved', '').state).toBe('approved')
	const item = f.service.get(candidate.id, null)
	expect(Object.keys(item).sort()).toEqual([
		'category',
		'description',
		'id',
		'publishedAt',
		'thumbnail',
		'title',
		'voted',
		'votes',
	])
	expect(f.service.file(candidate.id, null).object_key).toContain(memoryId)
	const self = f.publish(f.memory('owner-moderator'), 'owner-moderator')
	expect(() => f.service.moderate('owner-moderator', self.id, 'approved', '')).toThrow('Another moderator')
})

test('owner authorization, rejection reason, revocation and republication invalidate old IDs', () => {
	const f = fixture()
	const memoryId = f.memory()
	for (const operation of [
		() => f.publish(memoryId, 'other'),
		() => f.service.status('other', memoryId),
		() => f.service.revoke('other', memoryId),
	])
		expect(operation).toThrow('Not Found')
	const candidate = f.publish(memoryId)
	f.service.moderate('moderator', candidate.id, 'rejected', 'Private signs')
	expect(f.service.status('owner', memoryId)).toMatchObject({ state: 'rejected', reason: 'Private signs' })
	f.service.moderate('moderator', candidate.id, 'approved', '')
	f.service.vote('voter', candidate.id, true)
	f.service.report('reporter', candidate.id, 'Sign')
	const replacement = f.publish(memoryId, 'owner', 'Changed title')
	expect(replacement.id).not.toBe(candidate.id)
	expect(() => f.service.get(candidate.id, null)).toThrow('Not Found')
	expect(f.db.query('SELECT * FROM public_votes').all()).toHaveLength(0)
	f.service.moderate('moderator', replacement.id, 'approved', '')
	expect(f.service.revoke('owner', memoryId).state).toBe('revoked')
	expect(() => f.service.file(replacement.id, 'moderator')).toThrow('Not Found')
	expect(() => f.service.moderate('moderator', replacement.id, 'approved', '')).toThrow('Not Found')
})

test('votes are unique and idempotent; self voting, bursts and restart bypasses are rejected', () => {
	const f = fixture()
	const id = f.approved()
	expect(() => f.service.vote('owner', id, true)).toThrow('own publication')
	for (let i = 0; i < 100; i++) expect(f.service.vote('voter', id, true)).toEqual({ votes: 1, voted: true })
	expect(f.service.list('voter', { ...listing, sort: 'votes' }).items[0]?.voted).toBe(true)
	expect(f.service.list(null, listing).items[0]?.voted).toBe(false)
	for (let i = 0; i < 29; i++) f.service.vote('voter', id, i % 2 !== 0)
	const restarted = new PublicDiscovery(f.db, new Set(), () => 1_800_000_000_000)
	expect(() => restarted.vote('voter', id, true)).toThrow('Too Many Requests')
	f.advance()
	expect(f.service.vote('voter', id, true)).toEqual({ votes: 1, voted: true })
	f.advance(25 * 3_600_000)
	f.service.vote('new-voter', id, true)
	expect(f.db.query('SELECT * FROM public_action_limits WHERE user_id=?').all('voter')).toHaveLength(0)
})

test('reports are unique, bounded and can be reviewed or reject a live publication', () => {
	const f = fixture()
	const id = f.approved()
	for (let i = 0; i < 10; i++) f.service.report('reporter', id, `reason ${i}`)
	expect(() => f.service.report('reporter', id, 'spam')).toThrow('Too Many Requests')
	const queue = f.service.queue('moderator', { state: 'reported', page: 0 })
	expect(queue.items[0]?.reports).toEqual([
		{ id: expect.any(Number), reason: 'reason 9', createdAt: '2027-01-15T08:00:00.000Z' },
	])
	f.service.moderate('moderator', id, 'approved', 'Reviewed')
	expect(f.service.queue('moderator', { state: 'reported', page: 0 }).items).toHaveLength(0)
	f.advance()
	f.service.report('reporter', id, 'Still visible')
	f.service.moderate('moderator', id, 'rejected', 'Removed')
	expect(() => f.service.vote('voter', id, true)).toThrow('Not Found')
	expect(f.service.list(null, listing).items).toHaveLength(0)
})

test('trash revokes atomically, restoration stays private and deletion cascades', () => {
	const f = fixture()
	const id = f.approved()
	const memoryId = f.service.queue('moderator', { state: 'approved', page: 0 }).items[0]?.memoryId
	f.service.vote('voter', id, true)
	f.service.report('reporter', id, 'Check')
	f.db.query('UPDATE memories SET deleted_at=1 WHERE id=?').run(memoryId ?? '')
	expect(() => f.service.file(id, null)).toThrow('Not Found')
	f.db.query('UPDATE memories SET deleted_at=NULL WHERE id=?').run(memoryId ?? '')
	expect(f.service.status('owner', memoryId ?? '').state).toBe('revoked')
	expect(f.service.list(null, listing).items).toHaveLength(0)
	f.db.query('DELETE FROM memories WHERE id=?').run(memoryId ?? '')
	expect(f.db.query('SELECT * FROM public_publications').all()).toHaveLength(0)
	expect(f.db.query('SELECT * FROM public_votes').all()).toHaveLength(0)
	expect(f.db.query('SELECT * FROM public_reports').all()).toHaveLength(0)
})

test('literal search, categories, stable ranking and pagination cover real rows', () => {
	const f = fixture()
	for (let i = 0; i < 26; i++) {
		if (i % 5 === 0) f.advance()
		const candidate = f.publish(f.memory(), 'owner', i === 0 ? '100% House' : `Village ${i}`)
		f.service.moderate('moderator', candidate.id, 'approved', '')
		if (i === 0) f.service.vote('voter', candidate.id, true)
	}
	expect(f.service.list(null, listing)).toMatchObject({ hasMore: true, items: expect.any(Array) })
	expect(f.service.list(null, { ...listing, page: 1 }).items).toHaveLength(2)
	expect(f.service.list(null, { ...listing, query: '%' }).items[0]?.title).toBe('100% House')
	expect(f.service.list(null, { ...listing, category: 'landscape' }).items).toHaveLength(0)
	expect(f.service.list(null, { ...listing, sort: 'votes' }).items[0]?.title).toBe('100% House')
	expect(f.service.queue('moderator', { state: 'approved', page: 0 }).hasMore).toBe(true)
})

test('publication limits are durable and do not erase the previous candidate on denial', () => {
	const f = fixture()
	const memoryId = f.memory()
	let id = ''
	for (let i = 0; i < 5; i++) id = f.publish(memoryId).id
	expect(() => f.publish(memoryId)).toThrow('Too Many Requests')
	expect(f.service.status('owner', memoryId).id).toBe(id)
	f.advance()
	expect(f.publish(memoryId).id).not.toBe(id)
})

test('independent SQLite processes serialize duplicate votes and concurrent owner revocation', async () => {
	const f = fixture()
	const id = f.approved()
	async function worker(user: string, action = 'vote', target: string = id) {
		const process = Bun.spawn(
			[
				Bun.which('bun') ?? 'bun',
				join(import.meta.dir, 'test-support/discovery-worker.ts'),
				join(f.path, 'db.sqlite'),
				target,
				user,
				action,
			],
			{ stdout: 'pipe', stderr: 'pipe' }
		)
		const output = await new Response(process.stdout).text()
		const errors = await new Response(process.stderr).text()
		expect(await process.exited, errors).toBe(0)
		return JSON.parse(output) as { votes?: number; state?: string; code?: string }
	}
	await Promise.all(Array.from({ length: 8 }, (_, i) => worker(i < 4 ? 'same-voter' : `voter-${i}`)))
	expect(f.service.get(id, null).votes).toBe(5)
	const memoryId = f.service.queue('moderator', { state: 'approved', page: 0 }).items[0]?.memoryId
	await Promise.all([worker('owner', 'revoke', memoryId), worker('last-voter')])
	expect(() => f.service.get(id, null)).toThrow('Not Found')
	expect(f.db.query('SELECT * FROM public_votes').all()).toHaveLength(0)
})
