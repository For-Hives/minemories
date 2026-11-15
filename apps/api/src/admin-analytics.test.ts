import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { AdminAnalyticsReader, bucketOf, concentration, median } from './admin-analytics'
import { AdminRoles } from './admin-roles'

const DAY = 86_400_000
const WEEK = 7 * DAY
const MINUTE = 60_000
const MB = 1_000_000
// 2026-11-16 is a Monday (UTC): the current week starts there.
const NOW = Date.UTC(2026, 10, 18, 12)
const MONDAY = Date.UTC(2026, 10, 16)

function fixture() {
	const db = new Database(':memory:')
	db.exec(`PRAGMA foreign_keys=OFF;
 CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT,emailVerified INTEGER,createdAt INTEGER);
 CREATE TABLE session(id TEXT PRIMARY KEY,userId TEXT,createdAt,expiresAt INTEGER);
 CREATE TABLE devices(id TEXT PRIMARY KEY,user_id TEXT,created_at INTEGER,last_seen_at INTEGER,revoked_at INTEGER);
 CREATE TABLE memories(id TEXT PRIMARY KEY,user_id TEXT,name TEXT DEFAULT 'Capture',size INTEGER,created_at INTEGER,deleted_at INTEGER,metadata_json TEXT);
 CREATE TABLE share_links(token_hash TEXT PRIMARY KEY,memory_id TEXT,user_id TEXT);
 CREATE TABLE public_publications(id TEXT PRIMARY KEY,memory_id TEXT,user_id TEXT,state TEXT);
 CREATE TABLE public_votes(publication_id TEXT,user_id TEXT);
 INSERT INTO user VALUES ('admin','Admin','a@x',1,1);`)
	const roles = new AdminRoles(db)
	roles.bootstrap('a@x')
	return { db, reader: new AdminAnalyticsReader(db, roles) }
}

test('only administrators read analytics', () => {
	const { db, reader } = fixture()
	expect(() => reader.read(null)).toThrow('Unauthorized')
	expect(() => reader.read('someone')).toThrow('Forbidden')
	db.close()
})

test('buckets, median and concentration', () => {
	expect(bucketOf(1, [5, 10])).toBe(0)
	expect(bucketOf(7, [5, 10])).toBe(1)
	expect(bucketOf(99, [5, 10])).toBe(2)
	expect(median([])).toBeNull()
	expect(median([3, 1, 2])).toBe(2)
	expect(median([4, 1, 3, 2])).toBe(2.5)
	const even = concentration([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])
	expect(even.gini).toBeCloseTo(0, 5)
	expect(even.topTenShare).toBeCloseTo(0.1, 5)
	expect(even.lorenz).toHaveLength(10)
	const skewed = concentration([0, 0, 0, 0, 0, 0, 0, 0, 0, 100])
	expect(skewed.topTenShare).toBe(1)
	expect(skewed.gini).toBeGreaterThan(0.85)
	const none = concentration([])
	expect(none).toEqual({ accounts: 0, topTenShare: 0, gini: 0, lorenz: none.lorenz })
	expect(none.lorenz[9]).toBe(1)
})

test('the funnel counts accounts that reached each step', () => {
	const { db, reader } = fixture()
	db.exec(`INSERT INTO user VALUES ('a','A','a1@x',1,1),('b','B','b@x',0,1),('c','C','c@x',1,1);
 INSERT INTO devices VALUES ('d1','a',0,NULL,NULL),('d2','a',0,NULL,NULL),('d3','c',0,NULL,NULL);
 INSERT INTO memories(id,user_id,size,created_at,deleted_at,metadata_json) VALUES ('m1','a',1,1,NULL,NULL),('m2','a',1,1,NULL,NULL);
 INSERT INTO share_links VALUES ('t','m1','a');
 INSERT INTO public_publications VALUES ('p','m1','a','approved');`)
	expect(reader.read('admin', NOW).funnel).toEqual({
		accounts: 4,
		verified: 3,
		paired: 2,
		captured: 1,
		shared: 1,
		submitted: 1,
	})
	db.close()
})

test('time to first capture is bucketed and its median is in minutes', () => {
	const { db, reader } = fixture()
	db.exec(`INSERT INTO user VALUES ('a','A','a1@x',1,1),('b','B','b@x',1,1),('c','C','c@x',1,1),('d','D','d@x',1,1);
 INSERT INTO devices VALUES ('d1','a',1000,NULL,NULL),('d2','b',1000,NULL,NULL),('d3','c',1000,NULL,NULL),('d4','d',1000,NULL,NULL);`)
	const memory = db.query(
		'INSERT INTO memories(id,user_id,size,created_at,deleted_at,metadata_json) VALUES (?,?,?,?,NULL,NULL)'
	)
	memory.run('m1', 'a', 1, 1000 + 2 * MINUTE)
	memory.run('m2', 'b', 1, 1000 + 20 * MINUTE)
	memory.run('m3', 'c', 1, 1000 + 3 * DAY)
	memory.run('m4', 'c', 1, 1000 + 9 * DAY)
	memory.run('m5', 'd', 1, 5) // before pairing: ignored
	const { firstCapture } = reader.read('admin', NOW)
	expect(firstCapture.buckets).toEqual([1, 1, 0, 0, 1, 0])
	expect(firstCapture.samples).toBe(3)
	expect(firstCapture.medianMinutes).toBe(20)
	const empty = fixture()
	expect(empty.reader.read('admin', NOW).firstCapture).toEqual({
		buckets: [0, 0, 0, 0, 0, 0],
		samples: 0,
		medianMinutes: null,
	})
	db.close()
	empty.db.close()
})

test('cohorts follow each sign-up week and count who is active n weeks later', () => {
	const { db, reader } = fixture()
	const user = db.query('INSERT INTO user VALUES (?,?,?,1,?)')
	user.run('a', 'A', 'a1@x', MONDAY - WEEK + DAY) // joined last week
	user.run('b', 'B', 'b@x', MONDAY - WEEK + 2 * DAY) // joined last week
	user.run('c', 'C', 'c@x', MONDAY + DAY) // joined this week
	user.run('old', 'Old', 'o@x', MONDAY - 20 * WEEK) // outside the eight weeks
	db.query('INSERT INTO session VALUES (?,?,?,?)').run('s1', 'a', MONDAY + DAY, 0) // a active this week (offset 1)
	db.query('INSERT INTO session VALUES (?,?,?,?)').run('s2', 'old', MONDAY, 0)
	db.query('INSERT INTO session VALUES (?,?,?,?)').run('s3', 'b', new Date(MONDAY - WEEK + 3 * DAY).toISOString(), 0) // same week as joining: not counted
	db.query('INSERT INTO memories(id,user_id,size,created_at,deleted_at,metadata_json) VALUES (?,?,?,?,NULL,NULL)').run(
		'm',
		'b',
		1,
		MONDAY + 2 * DAY
	) // b active this week
	db.query('INSERT INTO devices VALUES (?,?,?,?,NULL)').run('d', 'b', 0, MONDAY + 3 * DAY)
	const { cohorts } = reader.read('admin', NOW)
	expect(cohorts).toHaveLength(8)
	expect(cohorts.at(-1)).toEqual({ weekStart: MONDAY, size: 1, active: [1] })
	expect(cohorts.at(-2)).toEqual({ weekStart: MONDAY - WEEK, size: 2, active: [2, 2] })
	expect(cohorts[0]?.size).toBe(0)
	expect(cohorts[0]?.active).toHaveLength(8)
	db.close()
})

test('storage concentration comes from live captures only', () => {
	const { db, reader } = fixture()
	db.exec(`INSERT INTO user VALUES ('a','A','a1@x',1,1),('b','B','b@x',1,1);
 INSERT INTO memories(id,user_id,size,created_at,deleted_at,metadata_json) VALUES ('m1','a',90,1,NULL,NULL),('m2','b',10,1,NULL,NULL),('m3','b',999,1,5,NULL);`)
	const { concentration: result } = reader.read('admin', NOW)
	expect(result.accounts).toBe(3)
	expect(result.topTenShare).toBeCloseTo(0.9, 5)
	db.close()
})

test('worlds count biomes, dimensions, servers and sizes, and name only shared servers', () => {
	const { db, reader } = fixture()
	db.exec(`INSERT INTO user VALUES ('a','A','a1@x',1,1),('b','B','b@x',1,1);`)
	const memory = db.query(
		'INSERT INTO memories(id,user_id,size,created_at,deleted_at,metadata_json) VALUES (?,?,?,1,NULL,?)'
	)
	const meta = (value: Record<string, unknown>) => JSON.stringify(value)
	memory.run('1', 'a', 2 * MB, meta({ biome: 'plains', dimension: 'minecraft:overworld', serverName: 'Shared SMP' }))
	memory.run('2', 'b', 30 * MB, meta({ biome: 'plains', dimension: 'minecraft:the_nether', serverName: 'Shared SMP' }))
	memory.run('3', 'a', 300 * MB, meta({ biome: 'forest', dimension: 'minecraft:overworld', serverName: 'Private' }))
	memory.run('4', 'a', 60 * MB, meta({ worldName: 'Solo' }))
	memory.run('5', 'a', 120 * MB, null)
	db.query('INSERT INTO memories(id,user_id,size,created_at,deleted_at,metadata_json) VALUES (?,?,?,1,9,NULL)').run(
		'6',
		'a',
		1
	)
	const { worlds } = reader.read('admin', NOW)
	expect(worlds.captures).toBe(5)
	expect(worlds.withBiome).toBe(3)
	expect(worlds.biomes).toEqual([
		{ name: 'plains', count: 2 },
		{ name: 'forest', count: 1 },
	])
	expect(worlds.dimensions).toEqual([
		{ name: 'overworld', count: 2 },
		{ name: 'the_nether', count: 1 },
	])
	expect(worlds.onServer).toBe(3)
	expect(worlds.singleplayer).toBe(2)
	expect(worlds.distinctServers).toBe(2)
	expect(worlds.topServers).toEqual([{ name: 'Shared SMP', captures: 2, accounts: 2 }])
	expect(worlds.sizes).toEqual([1, 0, 1, 1, 1, 1])
	expect(worlds.medianBytes).toBe(60 * MB)
	db.close()
})

test('the publication funnel counts captures, shares, submissions, approvals and votes', () => {
	const { db, reader } = fixture()
	db.exec(`INSERT INTO memories(id,user_id,size,created_at,deleted_at,metadata_json) VALUES ('m1','a',1,1,NULL,NULL),('m2','a',1,1,NULL,NULL),('m3','a',1,1,5,NULL);
 INSERT INTO share_links VALUES ('t1','m1','a'),('t2','m1','a'),('t3','m3','a');
 INSERT INTO public_publications VALUES ('p1','m1','a','approved'),('p2','m2','a','pending');`)
	for (const voter of ['v1', 'v2', 'v3', 'v4', 'v5']) db.query('INSERT INTO public_votes VALUES (?,?)').run('p1', voter)
	db.query('INSERT INTO public_votes VALUES (?,?)').run('p2', 'v1')
	expect(reader.read('admin', NOW).publication).toEqual({
		captures: 2,
		shared: 1,
		submitted: 2,
		approved: 1,
		voted: 2,
		wellVoted: 1,
	})
	db.close()
})

test('a database without the discovery tables still answers', () => {
	const db = new Database(':memory:')
	db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT,emailVerified INTEGER,createdAt INTEGER);
 CREATE TABLE session(id TEXT,userId TEXT,createdAt,expiresAt INTEGER);
 CREATE TABLE devices(id TEXT,user_id TEXT,created_at INTEGER,last_seen_at INTEGER);
 CREATE TABLE memories(id TEXT,user_id TEXT,size INTEGER,created_at INTEGER,deleted_at INTEGER,metadata_json TEXT);
 CREATE TABLE share_links(token_hash TEXT,memory_id TEXT,user_id TEXT);
 INSERT INTO user VALUES ('admin','Admin','a@x',1,1);`)
	const roles = new AdminRoles(db)
	roles.bootstrap('a@x')
	const result = new AdminAnalyticsReader(db, roles).read('admin', NOW)
	expect(result.funnel.submitted).toBe(0)
	expect(result.publication).toEqual({ captures: 0, shared: 0, submitted: 0, approved: 0, voted: 0, wellVoted: 0 })
	db.close()
})
