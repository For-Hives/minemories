import type { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import {
	type CaptureIdentity,
	captureTimeKey,
	type TemporalFrame,
	type TemporalWindow,
	TIMELAPSE_PAGE_FRAMES,
	temporalIdentity,
	WORLD_EVOLUTION_FRAMES,
	type WorldEvolution,
} from '@minemories/api-contract'
import { ORPCError } from '@orpc/server'
import { parseMetadata } from './memory-metadata'
import { MAX_UPLOAD_BYTES } from './upload-files'

interface Source {
	id: string
	user_id: string
	created_at: number
	size: number
	metadata_json: string | null
}
interface Entry {
	memory_id: string
	user_id: string
	series_key: string
	time_key: string
	capture_json: string
	world_key: string
}
interface Selected extends Entry {
	name: string
	size: number
}
interface FrameInput {
	memoryId: string
	anchorId?: string | undefined
	direction: 'around' | 'before' | 'after'
}

export function migrateTimelapseIndex(database: Database) {
	database
		.transaction(() => {
			database.exec(`CREATE TABLE IF NOT EXISTS timelapse_index_version (id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
	 CREATE TABLE IF NOT EXISTS timelapse_index (
	 memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
	 user_id TEXT NOT NULL,series_key TEXT NOT NULL,time_key TEXT NOT NULL,capture_json TEXT NOT NULL,world_key TEXT
	);
	CREATE INDEX IF NOT EXISTS timelapse_order ON timelapse_index(user_id,series_key,time_key,memory_id);
	CREATE TABLE IF NOT EXISTS timelapse_index_rejected (
	 memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE
	);`)
			const columns = database.query('PRAGMA table_info(timelapse_index)').all() as { name: string }[]
			if (!columns.some(column => column.name === 'world_key'))
				database.exec('ALTER TABLE timelapse_index ADD COLUMN world_key TEXT')
			database.exec(
				'CREATE INDEX IF NOT EXISTS timelapse_world_order ON timelapse_index(user_id,world_key,time_key,memory_id)'
			)
			const version = database.query('SELECT version FROM timelapse_index_version WHERE id=1').get() as {
				version: number
			} | null
			if (version?.version !== 3) {
				database.exec('DELETE FROM timelapse_index;DELETE FROM timelapse_index_rejected')
				database.query('INSERT INTO timelapse_index_version VALUES (1,3) ON CONFLICT(id) DO UPDATE SET version=3').run()
			}
		})
		.immediate()
}

function seriesKey(owner: string, identity: CaptureIdentity, dimension: string | null) {
	const b = identity.captureBounds
	return createHash('sha256')
		.update(
			JSON.stringify([
				'timelapse-series-v1',
				owner,
				identity.worldId,
				identity.worldScope,
				identity.zoneId,
				dimension,
				identity.captureMode,
				b.minX,
				b.maxX,
				b.minZ,
				b.maxZ,
				identity.captureMode === 'selection' ? [b.minY, b.maxY] : null,
			])
		)
		.digest('hex')
}

/** Every identified capture of one world and dimension, whatever its zone, composes a single evolving world. */
function worldKey(owner: string, identity: CaptureIdentity, dimension: string | null) {
	return createHash('sha256')
		.update(JSON.stringify(['timelapse-world-v1', owner, identity.worldId, identity.worldScope, dimension]))
		.digest('hex')
}

function uploadTime(value: number): string | null {
	if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) return null
	return new Date(value).toISOString()
}

function describe(source: Source) {
	if (!Number.isSafeInteger(source.size) || source.size < 1 || source.size > MAX_UPLOAD_BYTES) return null
	const metadata = parseMetadata(source.metadata_json ?? undefined)
	if (!metadata) return null
	const identity = temporalIdentity(metadata)
	if (!identity) return null
	const captured = metadata.captureStartedAt ?? metadata.capturedAt
	const at = captured ?? uploadTime(source.created_at)
	if (!at) return null
	const key = captureTimeKey(at)
	if (!key) return null
	return {
		seriesKey: seriesKey(source.user_id, identity, metadata.dimension),
		worldKey: worldKey(source.user_id, identity, metadata.dimension),
		key,
		frame: {
			at,
			timeSource: metadata.captureStartedAt || metadata.capturedAt ? ('capture' as const) : ('upload' as const),
			captureStartedAt: metadata.captureStartedAt ?? null,
			captureFinishedAt: metadata.captureFinishedAt ?? null,
			origin: identity.captureOrigin,
			bounds: identity.captureBounds,
			dayTime: metadata.dayTime,
			seed: metadata.seed,
			biome: metadata.biome,
			seriesName: metadata.worldName || metadata.serverName || 'Minecraft',
			dimension: metadata.dimension,
			mode: identity.captureMode,
			scope: identity.worldScope,
		},
	}
}

type Stored = NonNullable<ReturnType<typeof describe>>['frame']

/** Owner-scoped projection of actual captures, independent of the physical GLB/chunk representation. */
export class TimelapseIndex {
	constructor(private readonly database: Database) {}

	put(memoryId: string): boolean {
		return this.database
			.transaction(() => {
				this.database.query('DELETE FROM timelapse_index WHERE memory_id=?').run(memoryId)
				this.database.query('DELETE FROM timelapse_index_rejected WHERE memory_id=?').run(memoryId)
				const source = this.database
					.query('SELECT id,user_id,created_at,size,metadata_json FROM memories WHERE id=?')
					.get(memoryId) as Source | null
				if (!source) return false
				const capture = describe(source)
				if (!capture) return false
				this.database
					.query(
						'INSERT INTO timelapse_index (memory_id,user_id,series_key,time_key,capture_json,world_key) VALUES (?,?,?,?,?,?)'
					)
					.run(
						source.id,
						source.user_id,
						capture.seriesKey,
						capture.key,
						JSON.stringify(capture.frame),
						capture.worldKey
					)
				return true
			})
			.immediate()
	}

	/** A bounded migration pass; rejected tagged imports never starve later valid snapshots. */
	backfill(): number {
		return this.pass(null).added
	}

	private pass(userId: string | null) {
		const rows = this.database
			.query(`SELECT id FROM memories m WHERE deleted_at IS NULL AND (?1 IS NULL OR m.user_id=?1)
		 AND CASE WHEN json_valid(metadata_json) THEN json_type(metadata_json,'$.worldId')='text' ELSE 0 END
		 AND NOT EXISTS(SELECT 1 FROM timelapse_index i WHERE i.memory_id=m.id)
		 AND NOT EXISTS(SELECT 1 FROM timelapse_index_rejected r WHERE r.memory_id=m.id) ORDER BY created_at,id LIMIT 20`)
			.all(userId) as { id: string }[]
		let added = 0
		for (const row of rows) {
			if (this.put(row.id)) added++
			else
				this.database
					.query('INSERT OR IGNORE INTO timelapse_index_rejected SELECT id FROM memories WHERE id=?')
					.run(row.id)
		}
		return { added, processed: rows.length }
	}

	frames(userId: string, input: FrameInput): TemporalWindow {
		return this.database
			.transaction(() => {
				const seed = this.entry(userId, input.memoryId)
				const anchor = input.anchorId ? this.entry(userId, input.anchorId) : seed
				if (anchor.series_key !== seed.series_key) throw new ORPCError('NOT_FOUND')
				const parts = this.window(anchor, input.direction)
				const stored = JSON.parse(seed.capture_json) as Stored
				const totals = this.database
					.query(`SELECT COUNT(*) AS frames,SUM(m.size) AS bytes FROM timelapse_index i
			 JOIN memories m ON m.id=i.memory_id WHERE i.user_id=? AND i.series_key=? AND m.deleted_at IS NULL`)
					.get(userId, seed.series_key) as { frames: number; bytes: number }
				return {
					seriesId: seed.series_key,
					name: stored.seriesName,
					dimension: stored.dimension,
					mode: stored.mode,
					scope: stored.scope,
					totalFrames: totals.frames,
					totalBytes: totals.bytes,
					frames: parts.map(row => this.frame(row)),
					hasPrevious: parts.length > 0 && this.more(anchor, parts[0] ?? anchor, '<'),
					hasNext: parts.length > 0 && this.more(anchor, parts.at(-1) ?? anchor, '>'),
				}
			})
			.immediate()
	}

	/** Most recent frames of the whole world, oldest first, after indexing this owner's pending captures. */
	world(userId: string, memoryId: string): WorldEvolution {
		const seed = this.entry(userId, memoryId)
		while (this.pass(userId).processed > 0);
		return this.database
			.transaction(() => {
				const stored = JSON.parse(seed.capture_json) as Stored
				const totals = this.database
					.query(`SELECT COUNT(*) AS frames,SUM(m.size) AS bytes FROM timelapse_index i
			 JOIN memories m ON m.id=i.memory_id WHERE i.user_id=? AND i.world_key=? AND m.deleted_at IS NULL`)
					.get(userId, seed.world_key) as { frames: number; bytes: number }
				const rows = this.database
					.query(`SELECT i.*,m.name,m.size FROM timelapse_index i JOIN memories m ON m.id=i.memory_id
			 WHERE i.user_id=? AND i.world_key=? AND m.deleted_at IS NULL
			 ORDER BY i.time_key DESC,i.memory_id DESC LIMIT ?`)
					.all(userId, seed.world_key, WORLD_EVOLUTION_FRAMES) as Selected[]
				return {
					worldKey: seed.world_key,
					name: stored.seriesName,
					dimension: stored.dimension,
					scope: stored.scope,
					totalFrames: totals.frames,
					totalBytes: totals.bytes,
					frames: rows.reverse().map(row => this.frame(row)),
					truncated: totals.frames > rows.length,
				}
			})
			.immediate()
	}

	private entry(userId: string, id: string): Entry {
		if (!this.database.query('SELECT 1 FROM memories WHERE id=? AND user_id=? AND deleted_at IS NULL').get(id, userId))
			throw new ORPCError('NOT_FOUND')
		if (!this.database.query('SELECT 1 FROM timelapse_index WHERE memory_id=?').get(id)) this.put(id)
		const entry = this.database
			.query('SELECT * FROM timelapse_index WHERE memory_id=? AND user_id=?')
			.get(id, userId) as Entry | null
		if (!entry) throw new ORPCError('NOT_FOUND', { message: 'This capture has no temporal identity.' })
		return entry
	}

	private select(anchor: Entry, comparison: '<' | '<=' | '>', limit: number): Selected[] {
		const direction = comparison === '>' ? 'ASC' : 'DESC'
		return this.database
			.query(`SELECT i.*,m.name,m.size FROM timelapse_index i JOIN memories m ON m.id=i.memory_id
		 WHERE i.user_id=? AND i.series_key=? AND m.deleted_at IS NULL AND (i.time_key,i.memory_id) ${comparison} (?,?)
		 ORDER BY i.time_key ${direction},i.memory_id ${direction} LIMIT ?`)
			.all(anchor.user_id, anchor.series_key, anchor.time_key, anchor.memory_id, limit) as Selected[]
	}
	private window(anchor: Entry, direction: FrameInput['direction']): Selected[] {
		if (direction === 'before') return this.select(anchor, '<', TIMELAPSE_PAGE_FRAMES).reverse()
		if (direction === 'after') return this.select(anchor, '>', TIMELAPSE_PAGE_FRAMES)
		return [
			...this.select(anchor, '<=', TIMELAPSE_PAGE_FRAMES / 2).reverse(),
			...this.select(anchor, '>', TIMELAPSE_PAGE_FRAMES / 2),
		]
	}
	private more(series: Entry, boundary: Entry, comparison: '<' | '>'): boolean {
		return (
			this.select({ ...series, time_key: boundary.time_key, memory_id: boundary.memory_id }, comparison, 1).length > 0
		)
	}
	private frame(row: Selected): TemporalFrame {
		const {
			seriesName: _name,
			dimension: _dimension,
			mode: _mode,
			scope: _scope,
			...frame
		} = JSON.parse(row.capture_json) as Stored
		return { id: row.memory_id, name: row.name, size: row.size, ...frame }
	}
}
