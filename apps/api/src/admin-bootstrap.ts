import type { Database } from 'bun:sqlite'
import type { AdminRoles } from './admin-roles'

// TODO(#125): remove this temporary owner bootstrap once server-side administration is available.
const initialAdministratorEmail = 'breval2000@live.fr'

/** Promote an existing account once; a later demotion or account recreation must not restore access. */
export function bootstrapTemporaryAdministrator(database: Database, roles: AdminRoles, now = Date.now()): boolean {
	database.exec(
		'CREATE TABLE IF NOT EXISTS temporary_admin_bootstrap (id INTEGER PRIMARY KEY CHECK(id=1),user_id TEXT NOT NULL,created_at INTEGER NOT NULL)'
	)
	return database
		.transaction(() => {
			if (database.query('SELECT 1 FROM temporary_admin_bootstrap WHERE id=1').get()) return false
			const target = database.query('SELECT id FROM user WHERE lower(email)=?').get(initialAdministratorEmail) as {
				id: string
			} | null
			if (!target) return false
			roles.bootstrap(initialAdministratorEmail, now)
			database.query('INSERT INTO temporary_admin_bootstrap VALUES (1,?,?)').run(target.id, now)
			return true
		})
		.immediate()
}
