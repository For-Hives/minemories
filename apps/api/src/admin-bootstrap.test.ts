import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { bootstrapAdministratorsFromEnvironment, bootstrapTemporaryAdministrator } from './admin-bootstrap'
import { AdminRoles } from './admin-roles'

test('temporary bootstrap only promotes an existing account and never restores intentionally removed access', () => {
	const database = new Database(':memory:')
	database.exec('PRAGMA foreign_keys=ON;CREATE TABLE user(id TEXT PRIMARY KEY,email TEXT UNIQUE)')
	const roles = new AdminRoles(database)
	try {
		expect(bootstrapTemporaryAdministrator(database, roles)).toBe(false)
		database.exec("INSERT INTO user VALUES ('owner','Breval2000@live.fr'),('other','other@example.com')")
		expect(bootstrapTemporaryAdministrator(database, roles, 1000)).toBe(true)
		expect(roles.allowed('owner')).toBe(true)
		expect(database.query('SELECT actor_id,target_id,role FROM admin_role_audit').all()).toEqual([
			{ actor_id: null, target_id: 'owner', role: 'admin' },
		])
		roles.bootstrap('other@example.com')
		roles.setRole('other', { userId: 'owner', role: 'user' })
		expect(bootstrapTemporaryAdministrator(database, roles)).toBe(false)
		expect(roles.allowed('owner')).toBe(false)
		database.exec("DELETE FROM user WHERE id='owner';INSERT INTO user VALUES ('replacement','breval2000@live.fr')")
		expect(bootstrapTemporaryAdministrator(database, roles)).toBe(false)
		expect(roles.allowed('replacement')).toBe(false)
	} finally {
		database.close()
	}
})

test('configured account identifiers are promoted once, never by e-mail, and a demotion survives a restart', () => {
	const database = new Database(':memory:')
	database.exec('PRAGMA foreign_keys=ON;CREATE TABLE user(id TEXT PRIMARY KEY,email TEXT UNIQUE)')
	database.exec("INSERT INTO user VALUES ('owner','owner@example.com'),('second','second@example.com')")
	const roles = new AdminRoles(database)
	const environment = { ADMIN_BOOTSTRAP_USER_IDS: ' owner , missing, bad id!, owner ' }
	try {
		expect(bootstrapAdministratorsFromEnvironment(database, roles, {})).toEqual([])
		expect(bootstrapAdministratorsFromEnvironment(database, roles, environment, 1000)).toEqual(['owner'])
		expect(roles.allowed('owner')).toBe(true)
		expect(roles.allowed('second')).toBe(false)
		expect(database.query('SELECT actor_id,target_id,role FROM admin_role_audit').all()).toEqual([
			{ actor_id: null, target_id: 'owner', role: 'admin' },
		])
		expect(bootstrapAdministratorsFromEnvironment(database, roles, environment)).toEqual([])
		roles.bootstrapById('second')
		roles.setRole('second', { userId: 'owner', role: 'user' })
		expect(bootstrapAdministratorsFromEnvironment(database, roles, environment)).toEqual([])
		expect(roles.allowed('owner')).toBe(false)
		database.exec("INSERT INTO user VALUES ('missing','m@example.com')")
		expect(bootstrapAdministratorsFromEnvironment(database, roles, environment)).toEqual(['missing'])
		expect(roles.bootstrapById('missing')).toBe(false)
		expect(roles.bootstrapById('nobody')).toBe(false)
	} finally {
		database.close()
	}
})
