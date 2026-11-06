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

const identifierPattern = /^[A-Za-z0-9_-]{1,128}$/

/**
 * `ADMIN_BOOTSTRAP_USER_IDS` (comma-separated account identifiers, the same kind as `DIAGNOSTICS_OPERATOR_IDS`) promotes
 * each existing account once. An identifier is remembered, so a later demotion is never undone by a restart; accounts that
 * do not exist yet stay pending. Returns the identifiers promoted by this call.
 */
export function bootstrapAdministratorsFromEnvironment(
	database: Database,
	roles: AdminRoles,
	environment: Readonly<Record<string, string | undefined>> = process.env,
	now = Date.now()
): string[] {
	const wanted = (environment.ADMIN_BOOTSTRAP_USER_IDS ?? '')
		.split(',')
		.map(value => value.trim())
		.filter(value => identifierPattern.test(value))
	if (wanted.length === 0) return []
	database.exec('CREATE TABLE IF NOT EXISTS admin_bootstrap_ids (user_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL)')
	const promoted: string[] = []
	for (const userId of new Set(wanted)) {
		const done = database.transaction(() => {
			if (database.query('SELECT 1 FROM admin_bootstrap_ids WHERE user_id=?').get(userId)) return false
			if (!roles.bootstrapById(userId, now)) return false
			database.query('INSERT INTO admin_bootstrap_ids VALUES (?,?)').run(userId, now)
			return true
		})
		if (done.immediate()) promoted.push(userId)
	}
	return promoted
}
