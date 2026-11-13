import type { Database } from 'bun:sqlite'
import { type StorageRole, storageRole } from '@minemories/api-contract'
import { ACCOUNT_STORAGE_BYTES } from './configuration'

/**
 * Creates the role tables the quota reads. Called by `database.ts` (production startup and every test importing it) and
 * by `AdminRoles`, so a quota query never runs before them. Additive only: existing rows are never touched.
 */
export function migrateRoleStorage(database: Database): void {
	database.exec(`CREATE TABLE IF NOT EXISTS user_roles (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS role_storage_limits (role TEXT PRIMARY KEY, limit_bytes INTEGER NOT NULL CHECK(limit_bytes > 0),
 updated_at INTEGER NOT NULL, updated_by TEXT);`)
}

/**
 * Where each role's holders come from, as a SQL condition on an account id expression. Every account holds `user`.
 * A new role (alpha testers, a paid tier fed by billing...) only needs its condition here once it is in `storageRole`.
 */
export const ROLE_MEMBERSHIP: Record<StorageRole, (id: string) => string> = {
	user: () => '1',
	admin: id => `EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=${id})`,
}

const configured = (role: StorageRole) => `(SELECT limit_bytes FROM role_storage_limits WHERE role='${role}')`
/** The `user` limit: configured, or `ACCOUNT_STORAGE_BYTES` (a validated integer, so it is inlined, never bound). */
export const BASE_LIMIT_SQL = `COALESCE(${configured('user')},${ACCOUNT_STORAGE_BYTES})`

/**
 * The effective limit of the account whose id is the SQL expression `id` (`$id`, `u.id`...): the largest limit among the
 * roles it holds. A role without a configured limit, or not held, counts as 0, so the base always wins over it.
 * The base and a trailing 0 are separate arguments, so `MAX` stays the scalar form even with a single role.
 */
export function accountLimitSql(id: string): string {
	const others = storageRole.options
		.filter(role => role !== 'user')
		.map(role => `CASE WHEN ${ROLE_MEMBERSHIP[role](id)} THEN COALESCE(${configured(role)},0) ELSE 0 END`)
	return `MAX(${[BASE_LIMIT_SQL, ...others, '0'].join(',')})`
}

/** The limit an account currently gets from its roles; promotion or demotion applies on the next call. */
export function accountStorageLimit(database: Database, userId: string): number {
	return (database.query(`SELECT ${accountLimitSql('$id')} AS bytes`).get({ $id: userId }) as { bytes: number }).bytes
}

/** The roles an account holds, in `storageRole` order (always `user`). */
export function accountRoles(database: Database, userId: string): StorageRole[] {
	return storageRole.options.filter(
		role =>
			(database.query(`SELECT ${ROLE_MEMBERSHIP[role]('$id')} AS held`).get({ $id: userId }) as { held: number }).held
	)
}
