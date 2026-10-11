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
	createShareLink,
	deleteMemory,
	exchangePairingCode,
	getDeviceFromToken,
	getMemoryFile,
	getSharedMemory,
	hasPairedDevice,
	listMemories,
	listTrash,
	purgeDeletedMemories,
	renameMemory,
	restoreMemory,
	revokeShareLink,
	shareStatus,
	setMemoryThumbnail,
	trashMemory,
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

test('paired devices are reported until revoked', () => {
	expect(hasPairedDevice('user-e')).toEqual({ paired: false })
	const { code } = createPairingCode('user-e')
	const paired = exchangePairingCode(code, 'Tablet')
	if (!paired) throw new Error('Pairing unexpectedly failed.')
	expect(hasPairedDevice('user-e')).toEqual({ paired: true })
	database.query('UPDATE devices SET revoked_at = ? WHERE id = ?').run(Date.now(), paired.deviceId)
	expect(hasPairedDevice('user-e')).toEqual({ paired: false })
})

test('trash hides snapshots for thirty days before the purge removes them', () => {
	const { code } = createPairingCode('user-h')
	const paired = exchangePairingCode(code, 'Trash device')
	if (!paired) throw new Error('Pairing unexpectedly failed.')
	addMemory({
		id: 'trash-1',
		userId: 'user-h',
		deviceId: paired.deviceId,
		name: 'Old name',
		objectKey: 'user-h/trash-1.glb',
		size: 9,
	})

	expect(renameMemory('user-h', 'trash-1', 'Cabin above the ravine')).toBe(true)
	expect(listMemories('user-h')[0]?.name).toBe('Cabin above the ravine')
	expect(renameMemory('user-g', 'trash-1', 'Hijacked')).toBe(false)
	expect(renameMemory('user-h', 'missing', 'Ghost')).toBe(false)

	expect(trashMemory('user-h', 'trash-1')).toBe(true)
	expect(trashMemory('user-h', 'trash-1')).toBe(false)
	expect(trashMemory('user-g', 'trash-1')).toBe(false)
	expect(listMemories('user-h')).toEqual([])
	expect(listTrash('user-h')).toMatchObject([{ id: 'trash-1' }])
	expect(renameMemory('user-h', 'trash-1', 'Trashed rename')).toBe(false)
	expect(restoreMemory('user-g', 'trash-1')).toBe(false)
	expect(restoreMemory('user-h', 'trash-1')).toBe(true)
	expect(restoreMemory('user-h', 'trash-1')).toBe(false)
	expect(listMemories('user-h')).toMatchObject([{ id: 'trash-1' }])

	expect(deleteMemory('user-g', 'trash-1')).toBeNull()
	expect(deleteMemory('user-h', 'missing')).toBeNull()
	expect(trashMemory('user-h', 'trash-1')).toBe(true)
	database
		.query('UPDATE memories SET deleted_at = ?, purge_after = ? WHERE id = ?')
		.run(Date.now() - 31 * 86_400_000, Date.now() - 86_400_000, 'trash-1')
	expect(purgeDeletedMemories()).toEqual(['user-h/trash-1.glb'])
	expect(
		database.query('SELECT object_key FROM object_deletions WHERE object_key = ?').get('user-h/trash-1.glb')
	).toEqual({ object_key: 'user-h/trash-1.glb' })
	expect(purgeDeletedMemories()).toEqual([])
	expect(listTrash('user-h')).toEqual([])
	expect(listMemories('user-h')).toEqual([])
})

test('deleting metadata and queueing its object are atomic and revoke shared access', () => {
	const { code } = createPairingCode('delete-owner')
	const paired = exchangePairingCode(code, 'Fixture')
	if (!paired) throw new Error('Pairing fixture failed')
	addMemory({
		id: 'delete-atomic',
		userId: 'delete-owner',
		deviceId: paired.deviceId,
		name: 'Cabin',
		objectKey: 'delete-owner/atomic.glb',
		size: 9,
	})
	const link = createShareLink('delete-owner', 'delete-atomic')
	if (!link) throw new Error('Share fixture failed')
	database.exec(
		`CREATE TRIGGER reject_deletion BEFORE INSERT ON object_deletions BEGIN SELECT RAISE(ABORT, 'fixture failure'); END`
	)
	try {
		expect(() => deleteMemory('delete-owner', 'delete-atomic')).toThrow('fixture failure')
		expect(getMemoryFile('delete-owner', 'delete-atomic')).not.toBeNull()
		expect(getSharedMemory(link.token)).not.toBeNull()
	} finally {
		database.exec('DROP TRIGGER reject_deletion')
	}
	expect(deleteMemory('other-owner', 'delete-atomic')).toBeNull()
	expect(deleteMemory('delete-owner', 'delete-atomic')).toBe('delete-owner/atomic.glb')
	expect(getMemoryFile('delete-owner', 'delete-atomic')).toBeNull()
	expect(getSharedMemory(link.token)).toBeNull()
	expect(
		database.query('SELECT object_key FROM object_deletions WHERE object_key = ?').get('delete-owner/atomic.glb')
	).toEqual({ object_key: 'delete-owner/atomic.glb' })
})

test('purge rolls back its queue entries when metadata deletion fails', () => {
	const { code } = createPairingCode('purge-owner')
	const paired = exchangePairingCode(code, 'Fixture')
	if (!paired) throw new Error('Pairing fixture failed')
	addMemory({
		id: 'purge-atomic',
		userId: 'purge-owner',
		deviceId: paired.deviceId,
		name: 'Cabin',
		objectKey: 'purge-owner/atomic.glb',
		size: 9,
	})
	database.query('UPDATE memories SET deleted_at = 0 WHERE id = ?').run('purge-atomic')
	database.exec(
		`CREATE TRIGGER reject_purge BEFORE DELETE ON memories WHEN OLD.id = 'purge-atomic' BEGIN SELECT RAISE(ABORT, 'purge failure'); END`
	)
	try {
		expect(() => purgeDeletedMemories()).toThrow('purge failure')
		expect(getMemoryFile('purge-owner', 'purge-atomic')).not.toBeNull()
		expect(
			database.query('SELECT object_key FROM object_deletions WHERE object_key = ?').get('purge-owner/atomic.glb')
		).toBeNull()
	} finally {
		database.exec('DROP TRIGGER reject_purge')
	}
	expect(purgeDeletedMemories()).toContain('purge-owner/atomic.glb')
	expect(getMemoryFile('purge-owner', 'purge-atomic')).toBeNull()
})

test('share links open one snapshot without an account until revoked', () => {
	const { code } = createPairingCode('user-i')
	const paired = exchangePairingCode(code, 'Share device')
	if (!paired) throw new Error('Pairing unexpectedly failed.')
	addMemory({
		id: 'share-1',
		userId: 'user-i',
		deviceId: paired.deviceId,
		name: 'Shared cabin',
		objectKey: 'user-i/share-1.glb',
		size: 7,
		metadata: { worldName: 'Home', seed: '42' },
	} as Parameters<typeof addMemory>[0])

	expect(shareStatus('user-i', 'share-1')).toEqual({ shared: false })
	const link = createShareLink('user-i', 'share-1')
	if (!link) throw new Error('Share link creation unexpectedly failed.')
	expect(shareStatus('user-i', 'share-1')).toEqual({ shared: true })
	expect(getSharedMemory('short')).toBeNull()
	expect(getSharedMemory('A'.repeat(43))).toBeNull()
	expect(getSharedMemory(link.token)).toMatchObject({ id: 'share-1', name: 'Shared cabin' })
	expect(createShareLink('user-j', 'share-1')).toBeNull()
	revokeShareLink('user-i', 'share-1')
	revokeShareLink('user-i', 'share-1')
	expect(shareStatus('user-i', 'share-1')).toEqual({ shared: false })
	expect(getSharedMemory(link.token)).toBeNull()

	expect(trashMemory('user-i', 'share-1')).toBe(true)
	expect(createShareLink('user-i', 'share-1')).toBeNull()
	database.query('UPDATE memories SET metadata_json = ? WHERE id = ?').run('{broken', 'share-1')
	expect(restoreMemory('user-i', 'share-1')).toBe(true)
	const rotated = createShareLink('user-i', 'share-1')
	if (!rotated) throw new Error('Share link recreation unexpectedly failed.')
	expect(getSharedMemory(rotated.token)).toMatchObject({ id: 'share-1' })
})

test('model-rendered thumbnails persist on the owner memory only', () => {
	const { code } = createPairingCode('user-f')
	const paired = exchangePairingCode(code, 'Thumbnail device')
	if (!paired) throw new Error('Pairing unexpectedly failed.')
	addMemory({
		id: 'thumb-1',
		userId: 'user-f',
		deviceId: paired.deviceId,
		name: 'Capture',
		objectKey: 'user-f/thumb-1.glb',
		size: 8,
	})
	const jpeg = `data:image/jpeg;base64,${'A'.repeat(64)}`
	expect(setMemoryThumbnail('user-f', 'thumb-1', jpeg, null)).toBe(true)
	expect(listMemories('user-f')[0]).toMatchObject({ metadata: { thumbnail: jpeg, icon: null } })
	expect(setMemoryThumbnail('user-g', 'thumb-1', jpeg, null)).toBe(false)
	expect(setMemoryThumbnail('user-f', 'missing', jpeg, null)).toBe(false)
	database.query('UPDATE memories SET metadata_json = ? WHERE id = ?').run('{broken', 'thumb-1')
	expect(setMemoryThumbnail('user-f', 'thumb-1', jpeg, jpeg)).toBe(true)
	expect(listMemories('user-f')[0]).toMatchObject({ metadata: { thumbnail: jpeg, icon: jpeg } })
})
