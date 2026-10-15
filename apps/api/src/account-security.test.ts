import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { AccountSecurity } from './account-security'

function fixture() {
	const db = new Database(':memory:')
	db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE user(id TEXT PRIMARY KEY,email TEXT UNIQUE,emailVerified INTEGER,updatedAt INTEGER);
 CREATE TABLE account(id TEXT PRIMARY KEY,userId TEXT,providerId TEXT,password TEXT,updatedAt INTEGER);
 CREATE TABLE session(id TEXT PRIMARY KEY,userId TEXT,expiresAt INTEGER);
 INSERT INTO user VALUES ('owner','owner@example.com',1,0),('other','other@example.com',1,0);
 INSERT INTO account VALUES ('credential','owner','credential','hash:old-password',0);
 INSERT INTO session VALUES ('current','owner',1000000),('another','owner',1000000),('other-session','other',1000000);`)
	const passwords = {
		verify: ({ hash, password }: { hash: string; password: string }) => Promise.resolve(hash === `hash:${password}`),
		hash: (value: string) => Promise.resolve(`hash:${value}`),
	}
	const security = new AccountSecurity(db, passwords)
	return { db, passwords, security, identity: { userId: 'owner', sessionId: 'current' } }
}
test('email changes preserve identity, reset verification and atomically revoke every owner session', async () => {
	const f = fixture()
	try {
		expect(
			await f.security.changeEmail(f.identity, { email: 'NEW@example.com', currentPassword: 'old-password' }, 1000)
		).toEqual({ ok: true })
		expect(f.db.query('SELECT id,email,emailVerified FROM user WHERE id=?').get('owner')).toEqual({
			id: 'owner',
			email: 'new@example.com',
			emailVerified: 0,
		})
		expect(f.db.query('SELECT id FROM session').all()).toEqual([{ id: 'other-session' }])
	} finally {
		f.db.close()
	}
})
test('password updates use the configured algorithms and revoke all sessions only on success', async () => {
	const f = fixture()
	try {
		await expect(
			f.security.changePassword(f.identity, { currentPassword: 'wrong', newPassword: 'new-password' }, 1000)
		).rejects.toMatchObject({ code: 'BAD_REQUEST' })
		expect(f.db.query('SELECT COUNT(*) AS n FROM session').get()).toEqual({ n: 3 })
		await f.security.changePassword(f.identity, { currentPassword: 'old-password', newPassword: 'new-password' }, 1000)
		expect(f.db.query('SELECT password FROM account').get()).toEqual({ password: 'hash:new-password' })
		await expect(
			f.security.changeEmail(f.identity, { email: 'x@example.com', currentPassword: 'new-password' }, 1000)
		).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
	} finally {
		f.db.close()
	}
})
test('duplicate email rolls back without revoking sessions or changing verification', async () => {
	const f = fixture()
	try {
		await expect(
			f.security.changeEmail(f.identity, { email: 'other@example.com', currentPassword: 'old-password' }, 1000)
		).rejects.toMatchObject({ code: 'CONFLICT' })
		expect(f.db.query('SELECT email,emailVerified FROM user WHERE id=?').get('owner')).toEqual({
			email: 'owner@example.com',
			emailVerified: 1,
		})
		expect(f.db.query('SELECT COUNT(*) AS n FROM session').get()).toEqual({ n: 3 })
	} finally {
		f.db.close()
	}
})
test('expired, revoked or concurrently changed credentials cannot publish a mutation', async () => {
	const f = fixture()
	try {
		await expect(
			f.security.changeEmail(f.identity, { email: 'x@example.com', currentPassword: 'old-password' }, 1000000)
		).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
		f.passwords.verify = () => {
			f.db.exec("UPDATE account SET password='changed-elsewhere'")
			return Promise.resolve(true)
		}
		await expect(
			f.security.changeEmail(f.identity, { email: 'x@example.com', currentPassword: 'old-password' }, 1000)
		).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
		expect(f.db.query('SELECT email FROM user WHERE id=?').get('owner')).toEqual({ email: 'owner@example.com' })
	} finally {
		f.db.close()
	}
})
test('confirmation attempts are limited per account and reset after a minute', async () => {
	const f = fixture()
	try {
		for (let i = 0; i < 8; i++) {
			// biome-ignore lint/performance/noAwaitInLoops: exhaust the same persistent rate-limit window in order.
			await expect(
				f.security.changeEmail(f.identity, { email: 'x@example.com', currentPassword: 'wrong' }, 1000)
			).rejects.toMatchObject({ code: 'BAD_REQUEST' })
		}
		await expect(
			f.security.changeEmail(f.identity, { email: 'x@example.com', currentPassword: 'old-password' }, 1001)
		).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
		await f.security.changeEmail(f.identity, { email: 'x@example.com', currentPassword: 'old-password' }, 61000)
	} finally {
		f.db.close()
	}
})

test('ISO timestamps from Better Auth expire just like numeric fixture timestamps', async () => {
	const f = fixture()
	try {
		f.db.query('UPDATE session SET expiresAt=? WHERE id=?').run('2026-01-01T00:00:00.000Z', 'current')
		await expect(
			f.security.confirmed(f.identity, 'old-password', () => true, Date.parse('2026-01-02T00:00:00.000Z'))
		).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
		expect(
			await f.security.confirmed(f.identity, 'old-password', () => true, Date.parse('2025-12-31T00:00:00.000Z'))
		).toBe(true)
	} finally {
		f.db.close()
	}
})
