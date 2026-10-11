import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateTrashRetention } from './trash-retention'

const directory = mkdtempSync(join(tmpdir(), 'minemories-retention-'))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

test('existing trash retains its old deadline, overdue trash gets a grace period and restarts do not extend it', () => {
	const path = join(directory, 'legacy.sqlite')
	let database = new Database(path)
	const now = Date.parse('2026-10-11T00:00:00Z')
	database.exec('CREATE TABLE memories (id TEXT PRIMARY KEY, deleted_at INTEGER)')
	database.query('INSERT INTO memories VALUES (?, ?)').run('recent', now - 86_400_000)
	database.query('INSERT INTO memories VALUES (?, ?)').run('overdue', Date.parse('2024-01-01T00:00:00Z'))
	database.query('INSERT INTO memories VALUES (?, NULL)').run('active')
	migrateTrashRetention(database, now)
	const rows = database.query('SELECT * FROM memories ORDER BY id').all()
	expect(rows).toEqual([
		{ id: 'active', deleted_at: null, purge_after: null },
		{ id: 'overdue', deleted_at: Date.parse('2024-01-01T00:00:00Z'), purge_after: Date.parse('2026-11-10T00:00:00Z') },
		{ id: 'recent', deleted_at: now - 86_400_000, purge_after: now - 86_400_000 + 25_920_720_000 },
	])
	database.close()
	database = new Database(path)
	migrateTrashRetention(database, now + 86_400_000)
	expect(database.query('SELECT * FROM memories ORDER BY id').all()).toEqual(rows)
	database.close()
})

test('migration failures roll back the column and its deadlines before a safe retry', () => {
	const database = new Database(':memory:')
	database.exec(`CREATE TABLE memories (id INTEGER, deleted_at INTEGER);
		INSERT INTO memories VALUES (1, 0);
		CREATE TRIGGER fail_retention BEFORE UPDATE ON memories BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;`)
	expect(() => migrateTrashRetention(database, 0)).toThrow('fixture failure')
	expect((database.query('PRAGMA table_info(memories)').all() as Array<{ name: string }>).map(row => row.name)).toEqual(
		['id', 'deleted_at']
	)
	database.exec('DROP TRIGGER fail_retention')
	migrateTrashRetention(database)
	expect(database.query('SELECT purge_after FROM memories').get()).not.toBeNull()
	database.close()
})
