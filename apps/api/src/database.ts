import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import './configuration'
import { migrateCaptureAccess } from './capture-access'
import { migrateCaptureReaders } from './capture-readers'
import { boundColdStorageProvider, verifyColdStorageTarget } from './cold-storage-target'
import { migrateDiscovery } from './discovery'
import { migrateObjectDeletionClaims } from './object-deletions'
import { migrateRoadmapSnapshot } from './roadmap-snapshot'
import { configureS3StorageProvider } from './storage-s3'
import { migrateTimelapse } from './timelapse-catalog'
import { migrateTimelapseIndex } from './timelapse-index'
import { migrateTrashRetention } from './trash-retention'

const databasePath = resolve(process.env.DATABASE_PATH ?? './data/minemories.sqlite')
mkdirSync(dirname(databasePath), { recursive: true })

export const database = new Database(databasePath, { create: true })
database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
database.exec(`
  CREATE TABLE IF NOT EXISTS pairing_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS pairing_codes_user_id_idx
    ON pairing_codes(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER,
    revoked_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS devices_user_id_idx
    ON devices(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL REFERENCES devices(id),
    name TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS memories_user_id_idx
    ON memories(user_id, created_at DESC);
`)
database.exec(`CREATE TABLE IF NOT EXISTS object_deletions (
 object_key TEXT PRIMARY KEY, created_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0
); CREATE INDEX IF NOT EXISTS object_deletions_due_idx ON object_deletions(next_attempt_at, created_at);`)
migrateObjectDeletionClaims(database)
const memoryColumns = database.query('PRAGMA table_info(memories)').all() as Array<{ name: string }>
if (!memoryColumns.some(column => column.name === 'metadata_json')) {
	database.exec('ALTER TABLE memories ADD COLUMN metadata_json TEXT')
}
if (!memoryColumns.some(column => column.name === 'deleted_at')) {
	database.exec('ALTER TABLE memories ADD COLUMN deleted_at INTEGER')
}
migrateTrashRetention(database)
migrateCaptureAccess(database)
migrateCaptureReaders(database)
database.exec(`
  CREATE TABLE IF NOT EXISTS share_links (
    token_hash TEXT PRIMARY KEY,
    memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS share_links_memory_id_idx
    ON share_links(memory_id, created_at DESC);
`)

migrateDiscovery(database)

migrateTimelapse(database)

migrateTimelapseIndex(database)
migrateRoadmapSnapshot(database)
export const coldStorageConfiguration = verifyColdStorageTarget(database, process.env)
configureS3StorageProvider(boundColdStorageProvider(database))

const shareLinkColumns = database.query('PRAGMA table_info(share_links)').all() as Array<{ name: string }>
if (!shareLinkColumns.some(column => column.name === 'token_ciphertext'))
	database.exec('ALTER TABLE share_links ADD COLUMN token_ciphertext TEXT')
// A link opens one snapshot ('memory') or the whole evolving world of a snapshot ('world').
if (!shareLinkColumns.some(column => column.name === 'scope'))
	database.exec("ALTER TABLE share_links ADD COLUMN scope TEXT NOT NULL DEFAULT 'memory'")
if (!shareLinkColumns.some(column => column.name === 'world_key')) {
	database.exec('ALTER TABLE share_links ADD COLUMN world_key TEXT')
	database.exec('CREATE INDEX IF NOT EXISTS share_links_world_idx ON share_links(user_id, world_key, created_at DESC)')
}
// Opening counters for the administration overview; they hold no visitor identity.
if (!shareLinkColumns.some(column => column.name === 'open_count'))
	database.exec('ALTER TABLE share_links ADD COLUMN open_count INTEGER NOT NULL DEFAULT 0')
if (!shareLinkColumns.some(column => column.name === 'last_opened_at'))
	database.exec('ALTER TABLE share_links ADD COLUMN last_opened_at INTEGER')
