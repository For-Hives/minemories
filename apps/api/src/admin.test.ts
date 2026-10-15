import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { AdminMetrics } from './admin-metrics'
import { AdminRoles } from './admin-roles'

function fixture() {
	const db = new Database(':memory:')
	db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT,emailVerified INTEGER,createdAt INTEGER);
 CREATE TABLE memories(id TEXT PRIMARY KEY,user_id TEXT,size INTEGER,deleted_at INTEGER);
 CREATE TABLE devices(id TEXT PRIMARY KEY,user_id TEXT,revoked_at INTEGER);
 CREATE TABLE session(id TEXT PRIMARY KEY,userId TEXT,expiresAt INTEGER);
 CREATE TABLE object_deletions(size INTEGER);CREATE TABLE mod_uploads(size INTEGER,completed INTEGER);
 CREATE TABLE public_publications(memory_id TEXT,state TEXT);CREATE TABLE object_tiers(state TEXT);
 INSERT INTO user VALUES ('owner','Owner','owner@example.com',1,100),('other','Other','other@example.com',0,200);`)
	const roles = new AdminRoles(db)
	return { db, roles }
}
test('only administrators manage roles; the last admin and audited history survive demotion attempts', () => {
	const { db, roles } = fixture()
	try {
		expect(roles.allowed(null)).toBe(false)
		expect(() => roles.require(null)).toThrow('Unauthorized')
		expect(() => roles.require('owner')).toThrow('Forbidden')
		expect(() => roles.bootstrap('absent@example.com')).toThrow('Existing account not found')
		roles.bootstrap('OWNER@example.com', 1000)
		roles.bootstrap('owner@example.com', 1001)
		expect(roles.audit('owner')).toHaveLength(1)
		expect(() => roles.setRole('owner', { userId: 'owner', role: 'user' })).toThrow('LAST_ADMIN')
		expect(() => roles.setRole('owner', { userId: 'absent', role: 'admin' })).toThrow('Not Found')
		roles.setRole('owner', { userId: 'other', role: 'admin' }, 2000)
		roles.setRole('owner', { userId: 'other', role: 'admin' }, 2001)
		expect(roles.audit('owner')).toHaveLength(2)
		roles.setRole('other', { userId: 'owner', role: 'user' }, 3000)
		expect(() => roles.setRole('owner', { userId: 'owner', role: 'admin' })).toThrow('Forbidden')
		expect(() => roles.setRole('other', { userId: 'other', role: 'user' })).toThrow('LAST_ADMIN')
		expect(roles.audit('other')[0]).toMatchObject({ actorName: 'Other', targetName: 'Owner', role: 'user', at: 3000 })
	} finally {
		db.close()
	}
})
test('admin user searches escape wildcards, page results and scope current capture/device totals', () => {
	const { db, roles } = fixture()
	try {
		roles.bootstrap('owner@example.com')
		db.exec(
			"UPDATE user SET name='100% builder' WHERE id='other';INSERT INTO memories VALUES ('m','other',123,NULL);INSERT INTO devices VALUES ('d','other',NULL),('revoked','other',1);"
		)
		const found = roles.users('owner', { query: '%', role: 'all', page: 1 })
		expect(found.users).toHaveLength(1)
		expect(found.users[0]).toMatchObject({
			id: 'other',
			emailVerified: false,
			captures: 1,
			storedBytes: 123,
			devices: 1,
			role: 'user',
		})
		expect(roles.users('owner', { query: "%' OR 1=1 --", role: 'all', page: 1 }).total).toBe(0)
		expect(roles.users('owner', { query: '', role: 'admin', page: 1 }).users.map(u => u.id)).toEqual(['owner'])
		expect(roles.users('owner', { query: '', role: 'user', page: 1 }).users.map(u => u.id)).toEqual(['other'])
		for (let i = 0; i < 30; i++)
			db.query('INSERT INTO user VALUES (?,?,?,?,?)').run(`u${i}`, `User ${i}`, `u${i}@example.com`, 0, 300 + i)
		expect(roles.users('owner', { query: '', role: 'all', page: 1 }).users).toHaveLength(25)
		expect(roles.users('owner', { query: '', role: 'all', page: 2 }).users).toHaveLength(7)
	} finally {
		db.close()
	}
})
test('hourly counters count only committed publications and survive retries, conversions and deletion', () => {
	const { db, roles } = fixture(),
		now = Date.now()
	try {
		roles.bootstrap('owner@example.com')
		const metrics = new AdminMetrics(db, roles, now)
		expect(() => metrics.summary(null, 24, now)).toThrow('Unauthorized')
		expect(() => metrics.summary('other', 24, now)).toThrow('Forbidden')
		db.query('INSERT INTO user VALUES (?,?,?,?,?)').run('new', 'New', 'new@example.com', 0, now)
		db.exec("INSERT INTO memories VALUES ('m','owner',123,NULL)")
		expect(() => db.exec("INSERT INTO memories VALUES ('m','owner',123,NULL)")).toThrow()
		expect(() =>
			db.transaction(() => {
				db.exec("INSERT INTO memories VALUES ('rollback','owner',999,NULL)")
				throw new Error('rollback')
			})()
		).toThrow('rollback')
		db.exec("UPDATE memories SET size=456 WHERE id='m';DELETE FROM memories WHERE id='m'")
		const result = metrics.summary('owner', 24, Date.now())
		expect(result.period).toEqual({ signups: 1, uploads: 1, uploadedBytes: 123 })
		expect(result.totals.users).toBe(3)
		expect(result.totals.memories).toBe(0)
		expect(result.series).toHaveLength(24)
		expect(result.series[0]?.coverage).toBe('none')
		expect(result.series.at(-1)?.coverage).toBe('partial')
		expect(new AdminMetrics(db, roles, now + 1000).summary('owner', 24, now + 1000).trackingStartedAt).toBe(now)
	} finally {
		db.close()
	}
})
test('series fill empty tracked hours and current totals distinguish storage, trash, reservations and restoration', () => {
	const { db, roles } = fixture(),
		now = Date.now(),
		hour = 3600000,
		at = Math.floor(now / hour) * hour
	try {
		roles.bootstrap('owner@example.com')
		const metrics = new AdminMetrics(db, roles, at - 3 * hour)
		db.query('INSERT INTO admin_hourly_metrics VALUES (?,?,?,?)').run(at - hour, 5, 2, 2000000000)
		db.exec(
			"INSERT INTO memories VALUES ('kept','owner',100,NULL),('trash','owner',50,1);INSERT INTO devices VALUES ('d','owner',NULL);INSERT INTO session VALUES ('s','owner',9000000000000);INSERT INTO object_deletions VALUES (30);INSERT INTO mod_uploads VALUES (40,0),(20,1);INSERT INTO public_publications VALUES ('kept','approved'),('trash','approved');INSERT INTO object_tiers VALUES ('cold'),('restoring');"
		)
		const result = metrics.summary('owner', 24, now)
		expect(result.totals).toMatchObject({
			storedBytes: 150,
			trashBytes: 50,
			pendingDeletionBytes: 30,
			reservedBytes: 40,
			sessions: 1,
			devices: 1,
			publicCaptures: 1,
			coldObjects: 1,
			restoringObjects: 1,
		})
		expect(result.series.find(row => row.at === at - 2 * hour)).toMatchObject({ uploads: 0, coverage: 'full' })
		expect(result.series.find(row => row.at === at - hour)).toMatchObject({
			uploads: 2,
			signups: 5,
			uploadedBytes: 2000000000,
			coverage: 'full',
		})
		expect(metrics.summary('owner', 168, now).series).toHaveLength(168)
		expect(metrics.summary('owner', 720, now).series).toHaveLength(720)
	} finally {
		db.close()
	}
})
