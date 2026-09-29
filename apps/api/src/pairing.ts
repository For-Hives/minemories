import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { database } from './database'

const pairingPepper = process.env.PAIRING_PEPPER ?? process.env.BETTER_AUTH_SECRET
if (!pairingPepper || pairingPepper.length < 32) {
	throw new Error('PAIRING_PEPPER must contain at least 32 characters.')
}

const CODE_LIFETIME_MS = 5 * 60 * 1000
const codeHash = (value: string) => createHmac('sha256', pairingPepper).update(value).digest('hex')

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
		.query('SELECT id, name, size, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC')
		.all(userId) as Array<{ id: string; name: string; size: number; created_at: number }>

	return rows.map(row => ({
		id: row.id,
		name: row.name,
		size: row.size,
		createdAt: new Date(row.created_at).toISOString(),
	}))
}

export function getMemoryFile(userId: string, id: string) {
	return database.query('SELECT object_key, name FROM memories WHERE user_id = ? AND id = ?').get(userId, id) as {
		object_key: string
		name: string
	} | null
}

export function checkPairingCode(userId: string, code: string) {
	const pairing = database
		.query('SELECT expires_at, used_at FROM pairing_codes WHERE user_id = ? AND code_hash = ?')
		.get(userId, codeHash(code)) as { expires_at: number; used_at: number | null } | null
	if (!pairing || pairing.expires_at <= Date.now()) return { status: 'expired' as const }
	return { status: pairing.used_at === null ? ('pending' as const) : ('paired' as const) }
}

export function addMemory(input: {
	id: string
	userId: string
	deviceId: string
	name: string
	objectKey: string
	size: number
}) {
	database
		.query(
			'INSERT INTO memories (id, user_id, device_id, name, object_key, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.run(input.id, input.userId, input.deviceId, input.name, input.objectKey, input.size, Date.now())
}
