import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { AdminAccounts } from './admin-accounts'
import { AdminInsightsReader, activityLevel } from './admin-insights'
import { AdminRoles } from './admin-roles'

const DAY = 86_400_000
const NOW = 100 * DAY

function fixture() {
	const db = new Database(':memory:')
	db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT,emailVerified INTEGER,createdAt INTEGER);
 CREATE TABLE session(id TEXT PRIMARY KEY,userId TEXT REFERENCES user(id) ON DELETE CASCADE,createdAt,expiresAt INTEGER);
 CREATE TABLE devices(id TEXT PRIMARY KEY,user_id TEXT,last_seen_at INTEGER,revoked_at INTEGER);
 CREATE TABLE memories(id TEXT PRIMARY KEY,user_id TEXT,name TEXT,object_key TEXT,size INTEGER,created_at INTEGER);
 CREATE TABLE share_links(token_hash TEXT PRIMARY KEY,memory_id TEXT REFERENCES memories(id) ON DELETE CASCADE,user_id TEXT,
  scope TEXT DEFAULT 'memory',revoked_at INTEGER,open_count INTEGER NOT NULL DEFAULT 0,last_opened_at INTEGER);
 CREATE TABLE object_deletions(object_key TEXT PRIMARY KEY,created_at INTEGER,user_id TEXT,size INTEGER);
 CREATE TABLE pairing_codes(id TEXT PRIMARY KEY,user_id TEXT);
 INSERT INTO user VALUES ('admin','Admin','a@x',1,1),('busy','Busy','b@x',1,2),('quiet','Quiet','q@x',1,3),('idle','Idle','i@x',1,4);`)
	const roles = new AdminRoles(db)
	roles.bootstrap('a@x')
	return { db, roles }
}

test('only administrators read insights', () => {
	const { db, roles } = fixture()
	const reader = new AdminInsightsReader(db, roles)
	expect(() => reader.read(null)).toThrow('Unauthorized')
	expect(() => reader.read('busy')).toThrow('Forbidden')
	db.close()
})

test('versions come from the latest consented mod report of each device', () => {
	const { db, roles } = fixture()
	db.exec(
		`CREATE TABLE diagnostic_reports(device_id TEXT,id TEXT,received_at INTEGER,report_json TEXT,PRIMARY KEY(device_id,id))`
	)
	const report = (minecraft: string, mod: string, source = 'mod') =>
		JSON.stringify({ source, versions: { minecraft, loader: 'neoforge-21', mod } })
	const insert = db.query('INSERT INTO diagnostic_reports VALUES (?,?,?,?)')
	insert.run('d1', 'old', 1, report('1.20.1', '0.1.0'))
	insert.run('d1', 'new', 2, report('1.21.1', '0.2.0'))
	insert.run('d2', 'r', 1, report('1.21.1', '0.2.0'))
	insert.run('d3', 'r', 1, report('1.19.2', '0.2.0'))
	insert.run('d4', 'r', 1, JSON.stringify({ source: 'api', versions: { api: '1' } }))
	const { versions } = new AdminInsightsReader(db, roles).read('admin', NOW)
	expect(versions.reportingDevices).toBe(3)
	expect(versions.minecraft).toEqual([
		{ version: '1.21.1', devices: 2 },
		{ version: '1.19.2', devices: 1 },
	])
	expect(versions.mod[0]).toEqual({ version: '0.2.0', devices: 3 })
	expect(versions.loader).toEqual([{ version: 'neoforge-21', devices: 3 }])
	db.close()
})

test('versions tally unknown values and tolerate a missing diagnostics table', () => {
	const { db, roles } = fixture()
	expect(new AdminInsightsReader(db, roles).read('admin', NOW).versions.reportingDevices).toBe(0)
	db.exec('CREATE TABLE diagnostic_reports(device_id TEXT,id TEXT,received_at INTEGER,report_json TEXT)')
	db.exec(`INSERT INTO diagnostic_reports VALUES ('d','r',1,'{"source":"mod","versions":{}}')`)
	expect(new AdminInsightsReader(db, roles).read('admin', NOW).versions.mod).toEqual([
		{ version: 'unknown', devices: 1 },
	])
	db.close()
})

test('share totals and the most opened links', () => {
	const { db, roles } = fixture()
	db.exec(`INSERT INTO memories VALUES ('m1','busy','Castle','k1',10,1),('m2','busy','Farm','k2',10,1);
 INSERT INTO share_links(token_hash,memory_id,user_id,scope,revoked_at,open_count,last_opened_at) VALUES
 ('t1','m1','busy','memory',NULL,5,50),('t2','m2','busy','world',7,2,40),('t3','m2','busy','memory',NULL,0,NULL)`)
	const { shares } = new AdminInsightsReader(db, roles).read('admin', NOW)
	expect(shares).toMatchObject({ links: 3, activeLinks: 2, revokedLinks: 1, worldLinks: 1, openedLinks: 2, opens: 7 })
	expect(shares.top).toEqual([
		{ name: 'Castle', owner: 'Busy', scope: 'memory', opens: 5, lastOpenedAt: 50, revoked: false },
		{ name: 'Farm', owner: 'Busy', scope: 'world', opens: 2, lastOpenedAt: 40, revoked: true },
	])
	db.close()
})

test('active accounts are ranked by recent logins, uploads and paired devices', () => {
	const { db, roles } = fixture()
	const recent = NOW - 2 * DAY
	db.query('INSERT INTO session VALUES (?,?,?,?)').run('s1', 'busy', recent, NOW)
	db.query('INSERT INTO session VALUES (?,?,?,?)').run('s2', 'busy', new Date(recent).toISOString(), NOW)
	db.query('INSERT INTO session VALUES (?,?,?,?)').run('s3', 'quiet', NOW - 60 * DAY, NOW)
	for (let index = 0; index < 4; index += 1)
		db.query('INSERT INTO memories VALUES (?,?,?,?,?,?)').run(`m${index}`, 'busy', 'n', `k${index}`, 1, recent + index)
	db.query('INSERT INTO devices VALUES (?,?,?,NULL)').run('d', 'quiet', NOW - DAY)
	const { activity } = new AdminInsightsReader(db, roles).read('admin', NOW)
	expect(activity.activeUsers).toBe(2)
	expect(activity.users.map(user => [user.id, user.level, user.score, user.logins, user.uploads])).toEqual([
		['busy', 'medium', 14, 2, 4],
		['quiet', 'low', 2, 0, 0],
	])
	expect(activity.users[0]?.lastActiveAt).toBe(recent + 3)
	expect(activityLevel(6)).toBe('medium')
	expect(activityLevel(15)).toBe('high')
	db.close()
})

test('administrators delete other accounts and queue their objects', () => {
	const { db, roles } = fixture()
	db.exec(`CREATE TABLE timelapse_frames(memory_id TEXT REFERENCES memories(id) ON DELETE CASCADE,object_key TEXT,size INTEGER);
 CREATE TABLE timelapse_chunks(object_key TEXT PRIMARY KEY,user_id TEXT,size INTEGER);
 INSERT INTO memories VALUES ('m1','busy','Castle','k1',10,1);
 INSERT INTO timelapse_frames VALUES ('m1','frame',3);
 INSERT INTO timelapse_chunks VALUES ('chunk','busy',4);
 INSERT INTO share_links(token_hash,memory_id,user_id) VALUES ('t','m1','busy');
 INSERT INTO devices VALUES ('d','busy',NULL,NULL);
 INSERT INTO pairing_codes VALUES ('p','busy');
 INSERT INTO session VALUES ('s','busy',1,2);`)
	const accounts = new AdminAccounts(db, roles)
	expect(() => accounts.deleteUser(null, 'busy')).toThrow('Unauthorized')
	expect(() => accounts.deleteUser('quiet', 'busy')).toThrow('Forbidden')
	expect(() => accounts.deleteUser('admin', 'absent')).toThrow('Not Found')
	expect(() => accounts.deleteUser('admin', 'admin')).toThrow('SELF_DELETE')
	roles.setRole('admin', { userId: 'quiet', role: 'admin' })
	expect(() => accounts.deleteUser('admin', 'quiet')).toThrow('ADMIN_ACCOUNT')
	expect(accounts.deleteUser('admin', 'busy', 9)).toEqual({ ok: true })
	const count = (table: string) => (db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
	expect(db.query('SELECT object_key FROM object_deletions ORDER BY object_key').all()).toEqual([
		{ object_key: 'chunk' },
		{ object_key: 'frame' },
		{ object_key: 'k1' },
	])
	for (const table of ['memories', 'share_links', 'devices', 'pairing_codes', 'session', 'timelapse_chunks'])
		expect(count(table)).toBe(0)
	expect(db.query("SELECT 1 FROM user WHERE id='busy'").get()).toBeNull()
	expect(db.query('SELECT target_name,deleted_at FROM admin_account_deletions').get()).toEqual({
		target_name: 'Busy',
		deleted_at: 9,
	})
	db.close()
})

test('account deletion works without the optional timelapse tables', () => {
	const { db, roles } = fixture()
	expect(new AdminAccounts(db, roles).deleteUser('admin', 'idle')).toEqual({ ok: true })
	db.close()
})
