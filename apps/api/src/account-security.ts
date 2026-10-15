import type { Database } from 'bun:sqlite'
import { ORPCError } from '@orpc/server'

interface Passwords {
	verify(input: { hash: string; password: string }): Promise<boolean>
	hash(password: string): Promise<string>
}
interface Identity {
	userId: string
	sessionId: string
}
interface Credential {
	id: string
	password: string
}

/** Use Better Auth's configured password algorithms; publish credentials and session revocation atomically. */
export class AccountSecurity {
	constructor(
		private readonly database: Database,
		private readonly passwords: Passwords
	) {
		database.exec(`CREATE TABLE IF NOT EXISTS account_security_attempts (
		 user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,started_at INTEGER NOT NULL,attempts INTEGER NOT NULL
		)`)
	}
	async changeEmail(identity: Identity, input: { email: string; currentPassword: string }, now = Date.now()) {
		const credential = await this.confirm(identity, input.currentPassword, now)
		try {
			this.database
				.transaction(() => {
					this.current(identity, credential, now)
					this.database
						.query('UPDATE user SET email=?,emailVerified=0,updatedAt=? WHERE id=?')
						.run(input.email.toLowerCase(), now, identity.userId)
					this.revoke(identity.userId)
				})
				.immediate()
		} catch (error) {
			if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE')
				throw new ORPCError('CONFLICT', { message: 'EMAIL_UNAVAILABLE' })
			throw error
		}
		return { ok: true as const }
	}
	async changePassword(identity: Identity, input: { newPassword: string; currentPassword: string }, now = Date.now()) {
		const credential = await this.confirm(identity, input.currentPassword, now)
		const hash = await this.passwords.hash(input.newPassword)
		this.database
			.transaction(() => {
				this.current(identity, credential, now)
				this.database.query('UPDATE account SET password=?,updatedAt=? WHERE id=?').run(hash, now, credential.id)
				this.revoke(identity.userId)
			})
			.immediate()
		return { ok: true as const }
	}
	async confirmed<T>(identity: Identity, password: string, operation: () => T, now = Date.now()): Promise<T> {
		const credential = await this.confirm(identity, password, now)
		return this.database
			.transaction(() => {
				this.current(identity, credential, now)
				return operation()
			})
			.immediate()
	}
	private async confirm(identity: Identity, password: string, now: number): Promise<Credential> {
		const credential = this.current(identity, null, now)
		const attempts = this.database
			.query(`INSERT INTO account_security_attempts VALUES (?, ?,1)
		 ON CONFLICT(user_id) DO UPDATE SET started_at=CASE WHEN started_at<=?-60000 THEN excluded.started_at ELSE started_at END,
		 attempts=CASE WHEN started_at<=?-60000 THEN 1 ELSE attempts+1 END RETURNING attempts`)
			.get(identity.userId, now, now, now) as { attempts: number }
		if (attempts.attempts > 8) throw new ORPCError('TOO_MANY_REQUESTS')
		if (!(await this.passwords.verify({ hash: credential.password, password })))
			throw new ORPCError('BAD_REQUEST', { message: 'CURRENT_PASSWORD_INVALID' })
		return credential
	}
	private current(identity: Identity, previous: Credential | null, now: number): Credential {
		const credential = this.database
			.query(`SELECT a.id,a.password FROM account a JOIN session s ON s.userId=a.userId
		 WHERE a.userId=? AND a.providerId='credential' AND s.id=? AND (CASE WHEN typeof(s.expiresAt)='text' THEN unixepoch(s.expiresAt)*1000 ELSE s.expiresAt END)>?`)
			.get(identity.userId, identity.sessionId, now) as Credential | null
		if (!credential?.password || (previous && credential.password !== previous.password))
			throw new ORPCError('UNAUTHORIZED')
		return credential
	}
	private revoke(userId: string) {
		this.database.query('DELETE FROM session WHERE userId=?').run(userId)
	}
}
