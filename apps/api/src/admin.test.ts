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
 CREATE TABLE object_deletions(user_id TEXT,size INTEGER,discard_upload INTEGER DEFAULT 0);CREATE TABLE mod_uploads(user_id TEXT,size INTEGER,completed INTEGER);
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
test('the directory sums quota usage for the whole page in one grouped query, with sorting and an overview', () => {
	const { db, roles } = fixture()
	try {
		roles.bootstrap('owner@example.com')
		const quota = roles.users('owner', { query: '', role: 'all', page: 1 }).quotaBytes
		expect(quota).toBeGreaterThan(0)
		db.exec(`INSERT INTO user VALUES ('empty','Empty','empty@example.com',1,300),('full','Full','full@example.com',1,50);
 INSERT INTO memories VALUES ('a','other',100,NULL),('b','other',50,1),('c','full',${quota - 10},NULL);
 INSERT INTO mod_uploads VALUES ('other',30,0),('other',999,1),('full',5,0);
 INSERT INTO object_deletions VALUES ('other',20,0),('other',7,1);`)
		const page = roles.users('owner', { query: '', role: 'all', page: 1 })
		const by = Object.fromEntries(page.users.map(u => [u.id, u]))
		expect(by.other).toMatchObject({
			captures: 2,
			storedBytes: 150,
			usedBytes: 207,
			reservedBytes: 37,
			pendingDeletionBytes: 20,
		})
		expect(by.empty).toMatchObject({
			captures: 0,
			storedBytes: 0,
			usedBytes: 0,
			reservedBytes: 0,
			pendingDeletionBytes: 0,
		})
		expect(by.owner?.usedBytes).toBe(0)
		expect(page.overview).toEqual({ accounts: 4, usedBytes: 207 + quota - 5, nearQuotaAccounts: 1 })
		expect(page.users.map(u => u.id)).toEqual(['empty', 'other', 'owner', 'full'])
		const order = (sort: 'registered_desc' | 'registered_asc' | 'storage_desc' | 'storage_asc') =>
			roles.users('owner', { query: '', role: 'all', page: 1, sort }).users.map(u => u.id)
		expect(order('registered_asc')).toEqual(['full', 'owner', 'other', 'empty'])
		expect(order('storage_desc')).toEqual(['full', 'other', 'empty', 'owner'])
		expect(order('storage_asc')).toEqual(['empty', 'owner', 'other', 'full'])
		// The overview ignores filters; the usage stays right on later pages.
		const filtered = roles.users('owner', { query: 'Full', role: 'user', page: 1, sort: 'storage_desc' })
		expect(filtered.total).toBe(1)
		expect(filtered.overview.accounts).toBe(4)
		for (let i = 0; i < 30; i++) {
			db.query('INSERT INTO user VALUES (?,?,?,?,?)').run(`u${i}`, `User ${i}`, `u${i}@example.com`, 0, 400 + i)
			db.query('INSERT INTO memories VALUES (?,?,?,NULL)').run(`m${i}`, `u${i}`, i + 1)
		}
		const second = roles.users('owner', { query: '', role: 'all', page: 2, sort: 'storage_desc' })
		expect(second.users).toHaveLength(9)
		expect(second.users.at(-1)?.usedBytes).toBe(0)
		expect(Object.keys(second.users[0] ?? {}).sort()).toEqual(
			[
				'captures',
				'createdAt',
				'devices',
				'email',
				'emailVerified',
				'id',
				'name',
				'pendingDeletionBytes',
				'reservedBytes',
				'role',
				'storedBytes',
				'usedBytes',
			].sort()
		)
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
			"INSERT INTO memories VALUES ('kept','owner',100,NULL),('trash','owner',50,1);INSERT INTO devices VALUES ('d','owner',NULL);INSERT INTO session VALUES ('s','owner',9000000000000);INSERT INTO object_deletions VALUES ('owner',30,0);INSERT INTO mod_uploads VALUES ('owner',40,0),('owner',20,1);INSERT INTO public_publications VALUES ('kept','approved'),('trash','approved');INSERT INTO object_tiers VALUES ('cold'),('restoring');"
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
