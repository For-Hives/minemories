import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as z from 'zod'
import { AdminRoles } from './admin-roles'

export function promoteAdministrator(
	args: string[],
	environment: Readonly<Record<string, string | undefined>> = process.env
) {
	if (args.length !== 2 || args[0] !== '--email')
		throw new Error('Usage: bun api:admin --email <existing-account-email>')
	const email = z.email().parse(args[1]).toLowerCase()
	const path = resolve(environment.DATABASE_PATH ?? './data/minemories.sqlite')
	if (!existsSync(path)) throw new Error('Existing API database required; no administrator was created.')
	const database = new Database(path)
	database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
	try {
		new AdminRoles(database).bootstrap(email)
	} finally {
		database.close()
	}
}
export function runAdminCli(
	args: string[],
	environment: Readonly<Record<string, string | undefined>> = process.env
): number {
	try {
		promoteAdministrator(args, environment)
		process.stdout.write('Existing account promoted to administrator.\n')
		return 0
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : 'Administrator promotion failed.'}\n`)
		return 1
	}
}
if (import.meta.main) process.exitCode = runAdminCli(process.argv.slice(2))
