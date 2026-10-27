import type { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import {
	type CaptureIdentity,
	captureTimeKey,
	MAX_TILES,
	type TemporalFrame,
	type TemporalWindow,
	TIMELAPSE_PAGE_FRAMES,
	type TileList,
	temporalIdentity,
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
}
interface Selected extends Entry {
	name: string
	size: number
}
interface TileRow {
	memory_id: string
	x: number
	z: number
	size: number
	sha256: string
	quads: number
	tile_chunks: number
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
	 user_id TEXT NOT NULL,series_key TEXT NOT NULL,time_key TEXT NOT NULL,capture_json TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS timelapse_order ON timelapse_index(user_id,series_key,time_key,memory_id);
	CREATE TABLE IF NOT EXISTS timelapse_index_rejected (
	 memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE
	);`)
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

function seriesKey(owner: string, identity: CaptureIdentity, dimension: string | null, tiled: boolean) {
	// Tiled captures share one series per world: tiles sit on an absolute grid, so zones can be combined over time.
	if (tiled)
		return createHash('sha256')
			.update(JSON.stringify(['timelapse-series-world-v1', owner, identity.worldId, identity.worldScope, dimension]))
			.digest('hex')
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

function uploadTime(value: number): string | null {
	if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) return null
	return new Date(value).toISOString()
}

function describe(source: Source, tiled: boolean) {
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
		seriesKey: seriesKey(source.user_id, identity, metadata.dimension, tiled),
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

function composeWorld(
	captures: Array<{ memory_id: string; capture_json: string }>,
	byCapture: Map<string, TileRow[]>,
	tileBlocks: number
): Map<string, TileRow> {
	const world = new Map<string, TileRow>()
	for (const capture of captures) {
		const tiles = byCapture.get(capture.memory_id)
		if (!tiles) continue
		const { bounds } = JSON.parse(capture.capture_json) as Stored
		// Only cells that the capture contains entirely can be emptied by it.
		for (let x = Math.ceil(bounds.minX / tileBlocks); (x + 1) * tileBlocks - 1 <= bounds.maxX; x++)
			for (let z = Math.ceil(bounds.minZ / tileBlocks); (z + 1) * tileBlocks - 1 <= bounds.maxZ; z++)
				world.delete(`${x}:${z}`)
		for (const tile of tiles) world.set(`${tile.x}:${tile.z}`, tile)
	}
	return world
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
				const tiled = this.database.query('SELECT 1 FROM memory_tiles WHERE memory_id=? LIMIT 1').get(memoryId) !== null
				const capture = describe(source, tiled)
				if (!capture) return false
				this.database
					.query('INSERT INTO timelapse_index VALUES (?,?,?,?,?)')
					.run(source.id, source.user_id, capture.seriesKey, capture.key, JSON.stringify(capture.frame))
				return true
			})
			.immediate()
	}

	/** A bounded migration pass; rejected tagged imports never starve later valid snapshots. */
	backfill(): number {
		const rows = this.database
			.query(`SELECT id FROM memories m WHERE deleted_at IS NULL
		 AND CASE WHEN json_valid(metadata_json) THEN json_type(metadata_json,'$.worldId')='text' ELSE 0 END
		 AND NOT EXISTS(SELECT 1 FROM timelapse_index i WHERE i.memory_id=m.id)
		 AND NOT EXISTS(SELECT 1 FROM timelapse_index_rejected r WHERE r.memory_id=m.id) ORDER BY created_at,id LIMIT 20`)
			.all() as { id: string }[]
		let added = 0
		for (const row of rows) {
			if (this.put(row.id)) added++
			else
				this.database
					.query('INSERT OR IGNORE INTO timelapse_index_rejected SELECT id FROM memories WHERE id=?')
					.run(row.id)
		}
		return added
	}

	frames(userId: string, input: FrameInput): TemporalWindow {
		return this.database
			.transaction(() => {
				const seed = this.entry(userId, input.memoryId)
				const anchor = input.anchorId ? this.entry(userId, input.anchorId) : seed
				if (anchor.series_key !== seed.series_key) throw new ORPCError('NOT_FOUND')
				const parts = this.window(anchor, input.direction)
				const tiles = this.tileCounts(parts.map(row => row.memory_id))
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
					frames: parts.map(row => this.frame(row, tiles)),
					hasPrevious: parts.length > 0 && this.more(anchor, parts[0] ?? anchor, '<'),
					hasNext: parts.length > 0 && this.more(anchor, parts.at(-1) ?? anchor, '>'),
				}
			})
			.immediate()
	}

	/**
	 * Tiles of the whole world as of this capture: for each grid cell, the latest tile written at or before it.
	 * A newer capture that fully contains a cell without a tile row has emptied it. Zones never captured again
	 * keep their last known state.
	 */
	cumulativeTiles(userId: string, memoryId: string): TileList | null {
		const anchor = this.entry(userId, memoryId)
		const captures = this.database
			.query(`SELECT i.memory_id,i.capture_json FROM timelapse_index i JOIN memories m ON m.id=i.memory_id
		 WHERE i.user_id=? AND i.series_key=? AND m.deleted_at IS NULL AND (i.time_key,i.memory_id) <= (?,?)
		 ORDER BY i.time_key,i.memory_id`)
			.all(userId, anchor.series_key, anchor.time_key, anchor.memory_id) as Array<{
			memory_id: string
			capture_json: string
		}>
		const rows = this.database
			.query(`SELECT t.memory_id,t.x,t.z,t.size,t.sha256,t.quads,t.tile_chunks FROM memory_tiles t
		 JOIN timelapse_index i ON i.memory_id=t.memory_id JOIN memories m ON m.id=t.memory_id
		 WHERE i.user_id=? AND i.series_key=? AND m.deleted_at IS NULL AND (i.time_key,i.memory_id) <= (?,?)`)
			.all(userId, anchor.series_key, anchor.time_key, anchor.memory_id) as Array<TileRow>
		const tileChunks = rows.find(row => row.memory_id === anchor.memory_id)?.tile_chunks
		if (tileChunks === undefined) return null
		const byCapture = new Map<string, TileRow[]>()
		for (const row of rows) {
			if (row.tile_chunks !== tileChunks) continue
			byCapture.set(row.memory_id, [...(byCapture.get(row.memory_id) ?? []), row])
		}
		const tileBlocks = 16 * tileChunks
		const world = composeWorld(captures, byCapture, tileBlocks)
		const { origin } = JSON.parse(anchor.capture_json) as Stored
		const distance = (tile: TileRow) =>
			((tile.x + 0.5) * tileBlocks - origin.x) ** 2 + ((tile.z + 0.5) * tileBlocks - origin.z) ** 2
		const kept = [...world.values()]
			.sort((a, b) => distance(a) - distance(b) || a.x - b.x || a.z - b.z)
			.slice(0, MAX_TILES)
			.sort((a, b) => a.x - b.x || a.z - b.z)
		if (kept.length === 0) return null
		return {
			memoryId: anchor.memory_id,
			tileChunks,
			tiles: kept.map(({ memory_id, x, z, size, sha256, quads }) => ({
				memoryId: memory_id,
				x,
				z,
				size,
				sha256,
				quads,
			})),
		}
	}

	/** Indexes a user's captures that carry a world identity but are not indexed yet, a bounded batch at a time. */
	indexPending(userId: string, limit = 200): void {
		const rows = this.database
			.query(`SELECT id FROM memories m WHERE user_id=? AND deleted_at IS NULL
		 AND CASE WHEN json_valid(metadata_json) THEN json_type(metadata_json,'$.worldId')='text' ELSE 0 END
		 AND NOT EXISTS(SELECT 1 FROM timelapse_index i WHERE i.memory_id=m.id)
		 AND NOT EXISTS(SELECT 1 FROM timelapse_index_rejected r WHERE r.memory_id=m.id) ORDER BY created_at,id LIMIT ?`)
			.all(userId, limit) as { id: string }[]
		for (const row of rows) {
			if (!this.put(row.id))
				this.database
					.query('INSERT OR IGNORE INTO timelapse_index_rejected SELECT id FROM memories WHERE id=?')
					.run(row.id)
		}
	}

	/** Timeline of each indexed capture: its series, the number of captures and the latest one. */
	timelines(userId: string): Map<string, { seriesId: string; frames: number; latestId: string }> {
		this.indexPending(userId)
		const rows = this.database
			.query(`SELECT i.memory_id,i.series_key FROM timelapse_index i JOIN memories m ON m.id=i.memory_id
		 WHERE i.user_id=? AND m.deleted_at IS NULL ORDER BY i.series_key,i.time_key,i.memory_id`)
			.all(userId) as Array<{ memory_id: string; series_key: string }>
		const bySeries = new Map<string, string[]>()
		for (const row of rows) bySeries.set(row.series_key, [...(bySeries.get(row.series_key) ?? []), row.memory_id])
		const result = new Map<string, { seriesId: string; frames: number; latestId: string }>()
		for (const [seriesId, ids] of bySeries) {
			const latestId = ids.at(-1)
			if (!latestId) continue
			for (const id of ids) result.set(id, { seriesId, frames: ids.length, latestId })
		}
		return result
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
	/** One grouped query per page; memories without tile rows are absent from the map. */
	private tileCounts(ids: string[]): Map<string, number> {
		if (ids.length === 0) return new Map()
		const rows = this.database
			.query(
				`SELECT memory_id,COUNT(*) AS count FROM memory_tiles WHERE memory_id IN (${ids.map(() => '?').join(',')}) GROUP BY memory_id`
			)
			.all(...ids) as Array<{ memory_id: string; count: number }>
		return new Map(rows.map(row => [row.memory_id, row.count]))
	}
	private frame(row: Selected, tiles: Map<string, number>): TemporalFrame {
		const {
			seriesName: _name,
			dimension: _dimension,
			mode: _mode,
			scope: _scope,
			...frame
		} = JSON.parse(row.capture_json) as Stored
		const tileCount = tiles.get(row.memory_id)
		return { id: row.memory_id, name: row.name, size: row.size, ...frame, ...(tileCount ? { tileCount } : {}) }
	}
}
