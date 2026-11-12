import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import type { RoadmapResponse } from '@minemories/api-contract'
import { migrateRoadmapSnapshot, roadmapSnapshotStore } from './roadmap-snapshot'

const NOW = Date.parse('2026-11-07T12:00:00Z')
const empty = { items: [], more: 0 }
/** Built by hand: importing ./roadmap would load the API configuration through its logging helpers. */
function buildRoadmap(at: number): RoadmapResponse {
	return {
		updatedAt: new Date(at).toISOString(),
		columns: { planned: empty, inProgress: empty, done: empty },
		latestRelease: null,
	}
}

function store() {
	const database = new Database(':memory:')
	migrateRoadmapSnapshot(database)
	migrateRoadmapSnapshot(database)
	return { database, snapshots: roadmapSnapshotStore(database) }
}

test('keeps a single roadmap snapshot and replaces it on every save', () => {
	const { database, snapshots } = store()
	expect(snapshots.load()).toBeNull()
	const first = buildRoadmap(NOW)
	snapshots.save(first, NOW)
	expect(snapshots.load()).toEqual({ body: first, fetchedAt: NOW })
	const second = buildRoadmap(NOW + 1000)
	snapshots.save(second, NOW + 1000)
	expect(snapshots.load()).toEqual({ body: second, fetchedAt: NOW + 1000 })
	expect(database.query('SELECT COUNT(*) AS count FROM roadmap_snapshot').get()).toEqual({ count: 1 })
	database.close()
})

test('a corrupt stored body reads as no snapshot', () => {
	const { database, snapshots } = store()
	database.query('INSERT INTO roadmap_snapshot (id,body,fetched_at) VALUES (1,?,?)').run('{not json', NOW)
	expect(snapshots.load()).toBeNull()
	expect(() =>
		database.query('INSERT INTO roadmap_snapshot (id,body,fetched_at) VALUES (2,?,?)').run('{}', NOW)
	).toThrow()
	database.close()
})
