import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'minemories-pairing-'))
process.env.DATABASE_PATH = join(temporaryDirectory, 'test.sqlite')
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'

const { database } = await import('./database')
const {
	addMemory,
	checkPairingCode,
	createPairingCode,
	exchangePairingCode,
	getDeviceFromToken,
	getMemoryFile,
	listMemories,
} = await import('./pairing')

afterAll(() => {
	database.close()
	rmSync(temporaryDirectory, { recursive: true, force: true })
})

test('a code is six digits, expires in five minutes and is stored as a hash', () => {
	const before = Date.now()
	const { code, expiresAt } = createPairingCode('user-a')
	const after = Date.now()
	const stored = database.query('SELECT code_hash FROM pairing_codes WHERE user_id = ?').get('user-a') as {
		code_hash: string
	}

	expect(code).toMatch(/^\d{6}$/)
	expect(Date.parse(expiresAt)).toBeGreaterThanOrEqual(before + 300_000)
	expect(Date.parse(expiresAt)).toBeLessThanOrEqual(after + 300_000)
	expect(stored.code_hash).not.toBe(code)
	expect(checkPairingCode('user-a', code)).toEqual({ status: 'pending' })
	expect(checkPairingCode('user-b', code)).toEqual({ status: 'expired' })
})

test('exchange consumes the code once and grants a scoped device token', () => {
	const { code } = createPairingCode('user-b')
	const paired = exchangePairingCode(code, 'My mod')
	expect(paired).not.toBeNull()
	if (!paired) throw new Error('Pairing unexpectedly failed.')

	expect(checkPairingCode('user-b', code)).toEqual({ status: 'paired' })
	expect(exchangePairingCode(code, 'Second device')).toBeNull()
	expect(getDeviceFromToken(paired.deviceToken)).toMatchObject({
		id: paired.deviceId,
		userId: 'user-b',
		name: 'My mod',
	})
	expect(getDeviceFromToken('invalid')).toBeNull()

	const stored = database.query('SELECT token_hash FROM devices WHERE id = ?').get(paired.deviceId) as {
		token_hash: string
	}
	expect(stored.token_hash).not.toBe(paired.deviceToken)

	addMemory({
		id: 'memory-1',
		userId: 'user-b',
		deviceId: paired.deviceId,
		name: 'Capture',
		objectKey: 'user-b/memory-1.glb',
		size: 42,
	})
	expect(listMemories('user-b')).toMatchObject([{ id: 'memory-1', size: 42 }])
	expect(listMemories('user-a')).toEqual([])
	expect(getMemoryFile('user-b', 'memory-1')).toEqual({
		object_key: 'user-b/memory-1.glb',
		name: 'Capture',
	})
	expect(getMemoryFile('user-a', 'memory-1')).toBeNull()
})

test('replacing a pending code does not report a pairing', () => {
	const first = createPairingCode('user-c')
	const second = createPairingCode('user-c')
	expect(checkPairingCode('user-c', first.code)).toEqual({ status: 'expired' })
	expect(exchangePairingCode(first.code, 'Old code')).toBeNull()
	expect(checkPairingCode('user-c', second.code)).toEqual({ status: 'pending' })
})

test('expired codes and revoked tokens cannot be used', () => {
	const { code } = createPairingCode('user-d')
	database.query('UPDATE pairing_codes SET expires_at = ? WHERE user_id = ?').run(Date.now(), 'user-d')
	expect(checkPairingCode('user-d', code)).toEqual({ status: 'expired' })
	expect(exchangePairingCode(code, 'Too late')).toBeNull()

	const activeCode = createPairingCode('user-d')
	const paired = exchangePairingCode(activeCode.code, 'Revoked')
	if (!paired) throw new Error('Pairing unexpectedly failed.')
	database.query('UPDATE devices SET revoked_at = ? WHERE id = ?').run(Date.now(), paired.deviceId)
	expect(getDeviceFromToken(paired.deviceToken)).toBeNull()
})
