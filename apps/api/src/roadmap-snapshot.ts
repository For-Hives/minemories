import type { Database } from 'bun:sqlite'
import type { RoadmapResponse } from '@minemories/api-contract'

/** Last good `GET /api/roadmap` body as stored; the reader validates `body` before serving it. */
export interface StoredRoadmap {
	body: unknown
	fetchedAt: number
}

export interface RoadmapSnapshotStore {
	load(): StoredRoadmap | null
	save(body: RoadmapResponse, fetchedAt: number): void
}

/** Single-row table: the API restarts on the last roadmap it built instead of waiting for GitHub. */
export function migrateRoadmapSnapshot(database: Database): void {
	database.exec(
		'CREATE TABLE IF NOT EXISTS roadmap_snapshot (id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL,fetched_at INTEGER NOT NULL)'
	)
}

export function roadmapSnapshotStore(database: Database): RoadmapSnapshotStore {
	return {
		load() {
			const row = database.query('SELECT body,fetched_at FROM roadmap_snapshot WHERE id=1').get() as {
				body: string
				fetched_at: number
			} | null
			if (!row) return null
			try {
				return { body: JSON.parse(row.body), fetchedAt: row.fetched_at }
			} catch {
				return null
			}
		},
		save(body, fetchedAt) {
			database
				.query(
					'INSERT INTO roadmap_snapshot (id,body,fetched_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,fetched_at=excluded.fetched_at'
				)
				.run(JSON.stringify(body), fetchedAt)
		},
	}
}
