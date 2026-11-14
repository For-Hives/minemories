import type { Database } from 'bun:sqlite'
import { defaultServerName, type ServerProfile, serverKey } from '@minemories/api-contract'

/**
 * What an owner chose for each of their servers (or single-player worlds): a name and a picture. The gallery used
 * to keep names in one browser and to show the newest capture's image, so both changed or vanished; they now live
 * on the account. The picture is always one of the owner's own views, taken in the viewer (`setCover`).
 */
export function migrateServerProfiles(db: Database): void {
	db.exec(`CREATE TABLE IF NOT EXISTS server_profiles (
 user_id TEXT NOT NULL, server_key TEXT NOT NULL, name TEXT, cover TEXT, updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id, server_key))`)
}

interface IdentityMetadata {
	worldName: string | null
	serverName: string | null
	seed: string | null
}

interface ProfileRow {
	server_key: string
	name: string | null
	cover: string | null
}

function readMetadata(raw: string | null): Record<string, unknown> {
	if (!raw) return {}
	try {
		const value: unknown = JSON.parse(raw)
		return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
	} catch {
		return {}
	}
}

/** Read exactly as the gallery reads it, so both compute the same server key. */
function text(value: unknown): string | null {
	return typeof value === 'string' ? value : null
}

function identity(metadata: Record<string, unknown>): IdentityMetadata {
	return { worldName: text(metadata.worldName), serverName: text(metadata.serverName), seed: text(metadata.seed) }
}

export class ServerProfiles {
	constructor(
		private readonly db: Database,
		private readonly now: () => number = Date.now
	) {}

	list(userId: string): ServerProfile[] {
		const rows = this.db
			.query('SELECT server_key, name, cover FROM server_profiles WHERE user_id = ? ORDER BY server_key')
			.all(userId) as ProfileRow[]
		return rows.map(row => ({ key: row.server_key, name: row.name, cover: row.cover }))
	}

	/** The profile of one capture's server, or null when the capture is not the owner's (or in the trash). */
	forMemory(userId: string, memoryId: string): (ServerProfile & { defaultName: string }) | null {
		const metadata = this.memoryIdentity(userId, memoryId)
		if (!metadata) return null
		const key = serverKey(metadata)
		const row = this.row(userId, key)
		return { key, name: row?.name ?? null, cover: row?.cover ?? null, defaultName: defaultServerName(metadata) }
	}

	/** The name the owner gave this capture's server, for share links; null when none. */
	nameForMemory(userId: string, memoryId: string): string | null {
		const metadata = this.memoryIdentity(userId, memoryId)
		return metadata ? (this.row(userId, serverKey(metadata))?.name ?? null) : null
	}

	rename(userId: string, key: string, name: string | null): void {
		this.db
			.query(
				`INSERT INTO server_profiles (user_id, server_key, name, cover, updated_at) VALUES (?, ?, ?, NULL, ?)
 ON CONFLICT(user_id, server_key) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`
			)
			.run(userId, key, name, this.now())
	}

	/**
	 * Makes `image` the capture's picture, marked as chosen so the viewer's automatic preview never replaces it,
	 * and its server's picture. False when the capture is not the owner's.
	 */
	setCover(userId: string, memoryId: string, image: string, name?: string | null): boolean {
		return this.db
			.transaction(() => {
				const row = this.memoryRow(userId, memoryId)
				if (!row) return false
				const metadata = readMetadata(row.metadata_json)
				const key = serverKey(identity(metadata))
				this.db
					.query('UPDATE memories SET metadata_json = ? WHERE id = ? AND user_id = ?')
					.run(JSON.stringify({ ...metadata, thumbnail: image, thumbnailChosen: true }), memoryId, userId)
				this.db
					.query(
						`INSERT INTO server_profiles (user_id, server_key, name, cover, updated_at) VALUES (?, ?, ?, ?, ?)
 ON CONFLICT(user_id, server_key) DO UPDATE SET cover = excluded.cover, updated_at = excluded.updated_at,
 name = CASE WHEN ? THEN excluded.name ELSE server_profiles.name END`
					)
					.run(userId, key, name ?? null, image, this.now(), name === undefined ? 0 : 1)
				return true
			})
			.immediate()
	}

	private row(userId: string, key: string): ProfileRow | null {
		return this.db
			.query('SELECT server_key, name, cover FROM server_profiles WHERE user_id = ? AND server_key = ?')
			.get(userId, key) as ProfileRow | null
	}

	private memoryRow(userId: string, memoryId: string) {
		return this.db
			.query('SELECT metadata_json FROM memories WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
			.get(memoryId, userId) as { metadata_json: string | null } | null
	}

	private memoryIdentity(userId: string, memoryId: string): IdentityMetadata | null {
		const row = this.memoryRow(userId, memoryId)
		return row ? identity(readMetadata(row.metadata_json)) : null
	}
}
