import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { AdminJournalReader } from './admin-journal'
import { AdminRoles } from './admin-roles'

function fixture() {
	const db = new Database(':memory:')
	db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT,emailVerified INTEGER,createdAt INTEGER);
 INSERT INTO user VALUES ('admin','Admin','a@x',1,1),('bea','Bea','b@x',1,1);`)
	const roles = new AdminRoles(db)
	roles.bootstrap('a@x')
	return { db, roles, reader: new AdminJournalReader(db, roles) }
}

test('only administrators read the journal', () => {
	const { db, reader } = fixture()
	expect(() => reader.read(null)).toThrow('Unauthorized')
	expect(() => reader.read('bea')).toThrow('Forbidden')
	db.close()
})

test('role changes alone are enough, and an empty journal is a list', () => {
	const { db, roles, reader } = fixture()
	expect(reader.read('admin')).toEqual([
		{ at: expect.any(Number), area: 'roles', action: 'role_granted', actor: null, target: 'Admin' },
	])
	roles.setRole('admin', { userId: 'bea', role: 'admin' }, 5)
	roles.setRole('admin', { userId: 'bea', role: 'user' }, 6)
	const entries = reader.read('admin').filter(entry => entry.target === 'Bea')
	expect(entries.map(entry => [entry.action, entry.actor])).toEqual([
		['role_removed', 'Admin'],
		['role_granted', 'Admin'],
	])
	db.close()
})

test('every log is merged newest first, with fixed action codes', () => {
	const { db, reader } = fixture()
	db.exec(`CREATE TABLE admin_account_deletions(id INTEGER PRIMARY KEY,actor_id TEXT,target_id TEXT,target_name TEXT,deleted_at INTEGER);
 CREATE TABLE public_publications(id TEXT,title TEXT,state TEXT,reviewed_at INTEGER,reviewed_by TEXT);
 CREATE TABLE diagnostic_issues(fingerprint TEXT,state TEXT,updated_at INTEGER,updated_by TEXT);
 INSERT INTO admin_account_deletions VALUES (1,'admin','x','Gone',50);
 INSERT INTO public_publications VALUES ('p1','Village','approved',60,'bea'),('p2','Pending','pending',NULL,NULL),('p3','Nope','rejected',70,'operator:mcp'),('p4','Revoked','revoked',80,'bea');
 INSERT INTO diagnostic_issues VALUES ('abcdef0123456789','resolved',90,'admin'),('ffff','open',NULL,NULL);
 INSERT INTO role_storage_limits(role,limit_bytes,updated_at,updated_by) VALUES ('user',5,100,'admin');`)
	const entries = reader.read('admin')
	// The bootstrap grant was written with the real clock: it is the newest.
	expect(entries.map(entry => `${entry.area}:${entry.action}`)).toEqual([
		'roles:role_granted',
		'quota:quota_set',
		'health:issue_resolved',
		'moderation:publication_rejected',
		'moderation:publication_approved',
		'deletions:account_deleted',
	])
	expect(entries[1]).toEqual({ at: 100, area: 'quota', action: 'quota_set', actor: 'Admin', target: 'user' })
	expect(entries[2]?.target).toBe('abcdef01')
	expect(entries[3]?.actor).toBeNull()
	db.close()
})

test('without any log table the journal is empty', () => {
	const db = new Database(':memory:')
	db.exec('CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT)')
	const roles = { require: (id: string | null) => id ?? '' } as unknown as AdminRoles
	expect(new AdminJournalReader(db, roles).read('x')).toEqual([])
	db.close()
})
