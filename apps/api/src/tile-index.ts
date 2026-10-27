import type { Database } from 'bun:sqlite'
import type { TileList } from '@minemories/api-contract'
import type { TileBundleLayout } from './tile-bundle'

export type TileLocation = { objectKey: string; offset: number; size: number; sha256: string }

export function migrateTileIndex(database: Database): void {
	database.exec(`CREATE TABLE IF NOT EXISTS memory_tiles (
	 memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
	 x INTEGER NOT NULL, z INTEGER NOT NULL, tile_chunks INTEGER NOT NULL,
	 offset INTEGER NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, quads INTEGER NOT NULL,
	 PRIMARY KEY (memory_id, x, z)
	) WITHOUT ROWID;`)
}

/** Owner-scoped byte map of a tiled `.mmtiles` object; offsets are absolute in the stored object. */
export class TileIndex {
	constructor(private readonly database: Database) {}

	put(memoryId: string, layout: TileBundleLayout): void {
		this.database.transaction(() => {
			this.database.query('DELETE FROM memory_tiles WHERE memory_id=?').run(memoryId)
			const insert = this.database.query(
				'INSERT INTO memory_tiles (memory_id,x,z,tile_chunks,offset,size,sha256,quads) VALUES (?,?,?,?,?,?,?,?)'
			)
			const { manifest } = layout
			for (const tile of manifest.tiles)
				insert.run(
					memoryId,
					tile.x,
					tile.z,
					manifest.tileChunks,
					layout.dataOffset + tile.offset,
					tile.size,
					tile.sha256,
					tile.quads
				)
		})()
	}

	list(userId: string, memoryId: string): TileList | null {
		const rows = this.database
			.query(`SELECT t.x,t.z,t.size,t.sha256,t.quads,t.tile_chunks FROM memory_tiles t
		 JOIN memories m ON m.id=t.memory_id WHERE t.memory_id=? AND m.user_id=? AND m.deleted_at IS NULL ORDER BY t.x,t.z`)
			.all(memoryId, userId) as Array<{
			x: number
			z: number
			size: number
			sha256: string
			quads: number
			tile_chunks: number
		}>
		const first = rows[0]
		if (!first) return null
		return {
			memoryId,
			tileChunks: first.tile_chunks,
			tiles: rows.map(({ x, z, size, sha256, quads }) => ({ x, z, size, sha256, quads })),
		}
	}

	locate(userId: string, memoryId: string, x: number, z: number): TileLocation | null {
		const row = this.database
			.query(`SELECT m.object_key AS objectKey,t.offset,t.size,t.sha256 FROM memory_tiles t
		 JOIN memories m ON m.id=t.memory_id WHERE t.memory_id=? AND m.user_id=? AND m.deleted_at IS NULL AND t.x=? AND t.z=?`)
			.get(memoryId, userId, x, z) as TileLocation | null
		return row
	}

	count(memoryId: string): number {
		const row = this.database.query('SELECT COUNT(*) AS count FROM memory_tiles WHERE memory_id=?').get(memoryId) as {
			count: number
		}
		return row.count
	}
}
