import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { migrateCaptureAccess, recordCaptureOpening } from './capture-access'

test('opening history migrates existing captures and remains monotonic across conversion and deletion', () => {
	const db = new Database(':memory:')
	try {
		db.exec(`CREATE TABLE memories(id TEXT,object_key TEXT,created_at INTEGER,deleted_at INTEGER);
		 INSERT INTO memories VALUES ('capture','original',100,NULL)`)
		migrateCaptureAccess(db)
		migrateCaptureAccess(db)
		const opened = () =>
			(db.query('SELECT last_opened_at FROM memories').get() as { last_opened_at: number | null }).last_opened_at
		expect(opened()).toBeNull()
		recordCaptureOpening(db, null, 200)
		recordCaptureOpening(db, 'unknown', 200)
		expect(opened()).toBeNull()
		recordCaptureOpening(db, 'original', 200)
		recordCaptureOpening(db, 'original', 150)
		expect(opened()).toBe(200)
		db.exec("UPDATE memories SET object_key='manifest'")
		recordCaptureOpening(db, 'original', 300)
		expect(opened()).toBe(200)
		recordCaptureOpening(db, 'manifest', 300)
		expect(opened()).toBe(300)
		db.exec('UPDATE memories SET deleted_at=400')
		recordCaptureOpening(db, 'manifest', 500)
		expect(opened()).toBe(300)
	} finally {
		db.close()
	}
})
