import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { TRASH_RETENTION_MS } from '@minemories/api-contract'
import { pairingPepper } from './configuration'
import { database } from './database'

const pepper = pairingPepper(process.env)

const CODE_LIFETIME_MS = 5 * 60 * 1000
const codeHash = (value: string) => createHmac('sha256', pepper).update(value).digest('hex')

interface PairingRow {
	id: string
	user_id: string
	expires_at: number
	used_at: number | null
}

interface DeviceRow {
	id: string
	user_id: string
	name: string
	created_at: number
}

export function createPairingCode(userId: string) {
	const now = Date.now()
	const expiresAt = now + CODE_LIFETIME_MS

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
		const id = randomUUID()
		try {
			database.transaction(() => {
				database.query('DELETE FROM pairing_codes WHERE user_id = ? AND used_at IS NULL').run(userId)
				database.query('DELETE FROM pairing_codes WHERE expires_at < ?').run(now)
				database
					.query('INSERT INTO pairing_codes (id, user_id, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
					.run(id, userId, codeHash(code), now, expiresAt)
			})()
			return { code, expiresAt: new Date(expiresAt).toISOString() }
		} catch (error) {
			if (!(error instanceof Error && error.message.includes('UNIQUE constraint failed'))) throw error
		}
	}

	throw new Error('Could not allocate a unique pairing code.')
}

export function exchangePairingCode(code: string, name: string): { deviceId: string; deviceToken: string } | null {
	const now = Date.now()
	const token = randomBytes(32).toString('base64url')
	const tokenDigest = codeHash(token)
	let paired: { deviceId: string; deviceToken: string } | null = null

	database.transaction(() => {
		const pairing = database
			.query('SELECT id, user_id, expires_at, used_at FROM pairing_codes WHERE code_hash = ?')
			.get(codeHash(code)) as PairingRow | null
		if (!pairing || pairing.used_at !== null || pairing.expires_at <= now) return

		const update = database
			.query('UPDATE pairing_codes SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?')
			.run(now, pairing.id, now)
		if (update.changes !== 1) return

		const deviceId = randomUUID()
		database
			.query('INSERT INTO devices (id, user_id, name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
			.run(deviceId, pairing.user_id, name, tokenDigest, now, now)
		paired = { deviceId, deviceToken: token }
	})()

	return paired
}

export function getDeviceFromToken(token: string) {
	const row = database
		.query('SELECT id, user_id, name, created_at FROM devices WHERE token_hash = ? AND revoked_at IS NULL')
		.get(codeHash(token)) as DeviceRow | null
	if (!row) return null

	database.query('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(Date.now(), row.id)
	return {
		id: row.id,
		userId: row.user_id,
		name: row.name,
		createdAt: new Date(row.created_at).toISOString(),
	}
}

export function listMemories(userId: string) {
	const rows = database
		.query(
			'SELECT id, name, size, created_at, metadata_json FROM memories WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC'
		)
		.all(userId) as Array<{ id: string; name: string; size: number; created_at: number; metadata_json: string | null }>

	return rows.map(row => ({
		id: row.id,
		name: row.name,
		size: row.size,
		createdAt: new Date(row.created_at).toISOString(),
		metadata: row.metadata_json ? { ...emptyMetadata(), ...JSON.parse(row.metadata_json) } : emptyMetadata(),
	}))
}

export function listTrash(userId: string) {
	const rows = database
		.query(
			'SELECT id, name, size, created_at, deleted_at, COALESCE(purge_after, deleted_at + ?) AS purge_after, metadata_json FROM memories WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC'
		)
		.all(TRASH_RETENTION_MS, userId) as Array<{
		id: string
		name: string
		size: number
		created_at: number
		deleted_at: number
		purge_after: number
		metadata_json: string | null
	}>

	return rows.map(row => ({
		id: row.id,
		name: row.name,
		size: row.size,
		createdAt: new Date(row.created_at).toISOString(),
		deletedAt: new Date(row.deleted_at).toISOString(),
		purgeAt: new Date(row.purge_after).toISOString(),
		metadata: row.metadata_json ? { ...emptyMetadata(), ...JSON.parse(row.metadata_json) } : emptyMetadata(),
	}))
}

export function renameMemory(userId: string, id: string, name: string): boolean {
	const result = database
		.query('UPDATE memories SET name = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
		.run(name, id, userId)
	return result.changes === 1
}

export function trashMemory(userId: string, id: string): boolean {
	const now = Date.now()
	const result = database
		.query('UPDATE memories SET deleted_at = ?, purge_after = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
		.run(now, now + TRASH_RETENTION_MS, id, userId)
	return result.changes === 1
}

export function restoreMemory(userId: string, id: string): boolean {
	const result = database
		.query(
			'UPDATE memories SET deleted_at = NULL, purge_after = NULL WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL'
		)
		.run(id, userId)
	return result.changes === 1
}

export function deleteMemory(userId: string, id: string): string | null {
	const row = database.query('SELECT object_key, size FROM memories WHERE id = ? AND user_id = ?').get(id, userId) as {
		object_key: string
		size: number
	} | null
	if (!row) return null
	database.transaction(() => {
		database
			.query('INSERT INTO object_deletions (object_key, created_at, user_id, size) VALUES (?, ?, ?, ?)')
			.run(row.object_key, Date.now(), userId, row.size)
		database.query('DELETE FROM memories WHERE id = ? AND user_id = ?').run(id, userId)
	})()
	return row.object_key
}

export function purgeDeletedMemories(now = Date.now()): string[] {
	return database.transaction(() => {
		database
			.query(`INSERT INTO object_deletions (object_key, created_at, user_id, size)
			SELECT object_key, ?, user_id, size FROM memories WHERE deleted_at IS NOT NULL AND COALESCE(purge_after, deleted_at + ?) <= ?`)
			.run(now, TRASH_RETENTION_MS, now)
		const rows = database
			.query(`DELETE FROM memories WHERE deleted_at IS NOT NULL AND COALESCE(purge_after, deleted_at + ?) <= ?
			RETURNING object_key`)
			.all(TRASH_RETENTION_MS, now) as Array<{ object_key: string }>
		return rows.map(row => row.object_key)
	})()
}

export function createShareLink(userId: string, memoryId: string): { token: string } | null {
	const memory = database
		.query('SELECT id FROM memories WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
		.get(memoryId, userId) as { id: string } | null
	if (!memory) return null
	const token = randomBytes(32).toString('base64url')
	const now = Date.now()
	database.transaction(() => {
		database
			.query('UPDATE share_links SET revoked_at = ? WHERE memory_id = ? AND user_id = ? AND revoked_at IS NULL')
			.run(now, memoryId, userId)
		database
			.query(
				'INSERT INTO share_links (token_hash, memory_id, user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)'
			)
			.run(codeHash(token), memoryId, userId, now)
	})()
	return { token }
}

export function revokeShareLink(userId: string, memoryId: string): void {
	database
		.query('UPDATE share_links SET revoked_at = ? WHERE memory_id = ? AND user_id = ? AND revoked_at IS NULL')
		.run(Date.now(), memoryId, userId)
}

export function shareStatus(userId: string, memoryId: string) {
	const row = database
		.query('SELECT 1 AS shared FROM share_links WHERE memory_id = ? AND user_id = ? AND revoked_at IS NULL LIMIT 1')
		.get(memoryId, userId) as { shared: number } | null
	return { shared: row !== null }
}

export function getSharedMemory(token: string) {
	if (!token || token.length < 20) return null
	const link = database
		.query('SELECT memory_id, user_id FROM share_links WHERE token_hash = ? AND revoked_at IS NULL')
		.get(codeHash(token)) as { memory_id: string; user_id: string } | null
	if (!link) return null
	const row = database
		.query(
			'SELECT id, name, size, created_at, metadata_json, object_key FROM memories WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
		)
		.get(link.memory_id, link.user_id) as {
		id: string
		name: string
		size: number
		created_at: number
		metadata_json: string | null
		object_key: string
	} | null
	if (!row) return null
	let metadata: MemoryMetadata = emptyMetadata()
	if (row.metadata_json) {
		try {
			metadata = { ...metadata, ...JSON.parse(row.metadata_json) }
		} catch {
			// Serve the capture with default metadata rather than failing the shared page.
		}
	}
	return {
		id: row.id,
		name: row.name,
		size: row.size,
		createdAt: new Date(row.created_at).toISOString(),
		objectKey: row.object_key,
		metadata,
	}
}

export interface MemoryMetadata {
	seed: string | null
	x: number | null
	y: number | null
	z: number | null
	dimension: string | null
	worldName: string | null
	serverName: string | null
	biome: string | null
	dayTime: number | null
	raining: boolean | null
	thundering: boolean | null
	thumbnail: string | null
	icon: string | null
	capturedAt: string | null
}

function emptyMetadata(): MemoryMetadata {
	return {
		seed: null,
		x: null,
		y: null,
		z: null,
		dimension: null,
		worldName: null,
		serverName: null,
		biome: null,
		dayTime: null,
		raining: null,
		thundering: null,
		thumbnail: null,
		icon: null,
		capturedAt: null,
	}
}

export function getMemoryFile(userId: string, id: string) {
	return database.query('SELECT object_key, name FROM memories WHERE user_id = ? AND id = ?').get(userId, id) as {
		object_key: string
		name: string
	} | null
}

export function setMemoryThumbnail(userId: string, id: string, thumbnail: string, icon: string | null): boolean {
	const row = database.query('SELECT metadata_json FROM memories WHERE id = ? AND user_id = ?').get(id, userId) as {
		metadata_json: string | null
	} | null
	if (!row) return false
	let metadata: MemoryMetadata = emptyMetadata()
	if (row.metadata_json) {
		try {
			metadata = { ...metadata, ...JSON.parse(row.metadata_json) }
		} catch {
			// Keep the defaults and only store the new thumbnail.
		}
	}
	metadata.thumbnail = thumbnail
	if (icon !== null) metadata.icon = icon
	database
		.query('UPDATE memories SET metadata_json = ? WHERE id = ? AND user_id = ?')
		.run(JSON.stringify(metadata), id, userId)
	return true
}

export function checkPairingCode(userId: string, code: string) {
	const pairing = database
		.query('SELECT expires_at, used_at FROM pairing_codes WHERE user_id = ? AND code_hash = ?')
		.get(userId, codeHash(code)) as { expires_at: number; used_at: number | null } | null
	if (!pairing || pairing.expires_at <= Date.now()) return { status: 'expired' as const }
	return { status: pairing.used_at === null ? ('pending' as const) : ('paired' as const) }
}

export function hasPairedDevice(userId: string) {
	const row = database
		.query('SELECT 1 AS paired FROM devices WHERE user_id = ? AND revoked_at IS NULL LIMIT 1')
		.get(userId) as { paired: number } | null
	return { paired: row !== null }
}

export function addMemory(input: {
	id: string
	userId: string
	deviceId: string
	name: string
	objectKey: string
	size: number
	metadata?: MemoryMetadata
}) {
	database
		.query(
			'INSERT INTO memories (id, user_id, device_id, name, object_key, size, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.run(
			input.id,
			input.userId,
			input.deviceId,
			input.name,
			input.objectKey,
			input.size,
			Date.now(),
			JSON.stringify(input.metadata ?? emptyMetadata())
		)
}
