import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'minemories-retention-lifecycle-'))
process.env.DATABASE_PATH = join(directory, 'db.sqlite')
process.env.PAIRING_PEPPER = 'retention-test-pepper-with-at-least-32-characters'
const { database } = await import('./database')
const {
	addMemory,
	createPairingCode,
	exchangePairingCode,
	listTrash,
	trashMemory,
	restoreMemory,
	purgeDeletedMemories,
} = await import('./pairing')
afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})

test('new trash expires at thirty calendar days and restoration removes its previous deadline', () => {
	const pair = exchangePairingCode(createPairingCode('owner').code, 'Fixture')
	if (!pair) throw new Error('Pairing fixture failed')
	for (const id of ['restorable', 'protected']) {
		addMemory({ id, userId: 'owner', deviceId: pair.deviceId, name: id, objectKey: `owner/${id}.glb`, size: 20 })
		expect(trashMemory('owner', id)).toBe(true)
	}
	const entry = listTrash('owner').find(row => row.id === 'restorable')
	if (!entry) throw new Error('Missing trash fixture')
	const deadline = Date.parse(entry.purgeAt)
	expect(deadline - Date.parse(entry.deletedAt)).toBe(2_592_000_000)
	expect(listTrash('other')).toEqual([])
	expect(restoreMemory('other', 'restorable')).toBe(false)
	expect(restoreMemory('owner', 'restorable')).toBe(true)
	expect(database.query('SELECT deleted_at, purge_after FROM memories WHERE id = ?').get('restorable')).toEqual({
		deleted_at: null,
		purge_after: null,
	})
	expect(trashMemory('owner', 'restorable')).toBe(true)
	const next = listTrash('owner').find(row => row.id === 'restorable')
	if (!next) throw new Error('Missing re-trashed fixture')
	const nextDeadline = Date.parse(next.purgeAt)
	database.query('UPDATE memories SET purge_after = ? WHERE id = ?').run(nextDeadline + 86_400_000, 'protected')
	expect(purgeDeletedMemories(nextDeadline - 1)).toEqual([])
	expect(purgeDeletedMemories(nextDeadline)).toEqual(['owner/restorable.glb'])
	expect(listTrash('owner')).toMatchObject([
		{ id: 'protected', purgeAt: new Date(nextDeadline + 86_400_000).toISOString() },
	])
	expect(database.query('SELECT object_key FROM object_deletions').all()).toEqual([
		{ object_key: 'owner/restorable.glb' },
	])
})
