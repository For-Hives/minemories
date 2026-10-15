import { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { migrateCaptureReaders } from '../capture-readers'
import { ObjectDeletionQueue } from '../object-deletions'
import { migrateTimelapse, TimelapseCatalog } from '../timelapse-catalog'
import { TimelapseFiles, type TimelapseObjects } from '../timelapse-files'
import { migrateTimelapseIndex } from '../timelapse-index'
import { minimalGlb } from './glb-fixture'

export const frameMetadata = {
	worldId: 'a'.repeat(64),
	zoneId: 'b'.repeat(64),
	captureMode: 'around',
	captureBounds: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 2 },
	captureOrigin: { x: 1, y: 1, z: 1 },
	dimension: 'minecraft:overworld',
}
export async function temporalFixture() {
	const dir = await mkdtemp(join(tmpdir(), 'minemories-temporal-')),
		dbPath = join(dir, 'db.sqlite')
	let db = new Database(dbPath)
	db.exec(`PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;
	 CREATE TABLE memories(id TEXT PRIMARY KEY,user_id TEXT,object_key TEXT UNIQUE,size INTEGER,deleted_at INTEGER,metadata_json TEXT,name TEXT DEFAULT 'Capture',created_at INTEGER DEFAULT 0);
	 CREATE TABLE object_deletions(object_key TEXT PRIMARY KEY,created_at INTEGER,attempts INTEGER DEFAULT 0,
	 next_attempt_at INTEGER DEFAULT 0,user_id TEXT,size INTEGER,discard_upload INTEGER DEFAULT 0);`)
	migrateTimelapse(db)
	migrateCaptureReaders(db)
	migrateTimelapseIndex(db)
	const local = (key: string) => join(dir, key.replaceAll('/', '_'))
	const objects: TimelapseObjects = {
		read: async (key, signal) => createReadStream(local(key), { signal }),
		write: async (key, data, signal) => writeFile(local(key), data, { flag: 'wx', signal }),
	}
	const binary = Buffer.alloc(768 * 1024, 42),
		data = minimalGlb(binary, { asset: { version: '2.0' }, buffers: [{ byteLength: binary.length }] })
	return {
		get db() {
			return db
		},
		dir,
		data,
		objects,
		local,
		files: (options = { now: () => 0, heartbeatMs: 30_000 }) => new TimelapseFiles(db, objects, options),
		catalog: () => new TimelapseCatalog(db),
		async add(metadata: unknown = frameMetadata, payload = data) {
			const id = randomUUID(),
				key = `owner/${id}.glb`
			await writeFile(local(key), payload)
			db.query('INSERT INTO memories(id,user_id,object_key,size,deleted_at,metadata_json) VALUES (?,?,?,?,NULL,?)').run(
				id,
				'owner',
				key,
				payload.length,
				JSON.stringify(metadata)
			)
			return { id, key }
		},
		key(id: string) {
			return (db.query('SELECT object_key FROM memories WHERE id=?').get(id) as { object_key: string }).object_key
		},
		drain: async (now = 0) =>
			new ObjectDeletionQueue(db, async key => rm(local(key), { force: true })).drain(undefined, now),
		raw: async (key: string): Promise<Buffer> => readFile(local(key)),
		restart() {
			db.close()
			db = new Database(dbPath)
			db.exec('PRAGMA foreign_keys=ON')
			migrateTimelapse(db)
			migrateTimelapseIndex(db)
		},
		async close() {
			db.close()
			await rm(dir, { recursive: true, force: true })
		},
	}
}
export async function readAll(body: Readable): Promise<Buffer> {
	const pieces: Buffer[] = []
	for await (const piece of body) pieces.push(Buffer.from(piece))
	return Buffer.concat(pieces)
}
