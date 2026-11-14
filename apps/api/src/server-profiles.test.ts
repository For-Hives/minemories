import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serverKey } from '@minemories/api-contract'
import { migrateServerProfiles, ServerProfiles } from './server-profiles'

const resources: { db: Database; path: string }[] = []
afterEach(() => {
	for (const resource of resources.splice(0)) {
		resource.db.close()
		rmSync(resource.path, { recursive: true, force: true })
	}
})

const image = (letter: string) => `data:image/jpeg;base64,${letter.repeat(64)}`

/** As the API stores it: absent, raw text (to test unreadable rows) or JSON. */
function stored(metadata: unknown): string | null {
	if (metadata === undefined) return null
	return typeof metadata === 'string' ? metadata : JSON.stringify(metadata)
}

function fixture() {
	const path = mkdtempSync(join(tmpdir(), 'minemories-server-profiles-'))
	const db = new Database(join(path, 'db.sqlite'))
	resources.push({ db, path })
	db.exec('CREATE TABLE memories(id TEXT PRIMARY KEY, user_id TEXT, metadata_json TEXT, deleted_at INTEGER)')
	migrateServerProfiles(db)
	migrateServerProfiles(db)
	let now = 1000
	const profiles = new ServerProfiles(db, () => now++)
	const memory = (id: string, user: string, metadata: unknown, deleted: number | null = null) =>
		db.query('INSERT INTO memories VALUES (?, ?, ?, ?)').run(id, user, stored(metadata), deleted)
	const metadataOf = (id: string) =>
		JSON.parse(
			(db.query('SELECT metadata_json FROM memories WHERE id = ?').get(id) as { metadata_json: string }).metadata_json
		)
	return { db, profiles, memory, metadataOf }
}

test('a chosen view becomes the capture picture, kept for good, and its server picture; renaming is per owner', () => {
	const { profiles, memory, metadataOf } = fixture()
	memory('a', 'owner', { serverName: 'Lalaland', thumbnail: image('A'), icon: image('I'), biome: 'plains' })
	memory('b', 'owner', { serverName: 'Lalaland' })
	const key = serverKey({ worldName: null, serverName: 'Lalaland', seed: null })
	expect(profiles.forMemory('owner', 'a')).toEqual({ key, name: null, cover: null, defaultName: 'Lalaland' })
	expect(profiles.setCover('owner', 'a', image('C'))).toBe(true)
	expect(metadataOf('a')).toEqual({
		serverName: 'Lalaland',
		thumbnail: image('C'),
		icon: image('I'),
		biome: 'plains',
		thumbnailChosen: true,
	})
	expect(profiles.list('owner')).toEqual([{ key, name: null, cover: image('C') }])
	// Another capture of the same server shares the profile; a new picture replaces the server's.
	expect(profiles.setCover('owner', 'b', image('D'), 'Lalaland, our town')).toBe(true)
	expect(profiles.forMemory('owner', 'a')).toMatchObject({ name: 'Lalaland, our town', cover: image('D') })
	expect(profiles.nameForMemory('owner', 'a')).toBe('Lalaland, our town')
	// Without a name the server keeps its name; `null` gives back the game's.
	profiles.setCover('owner', 'a', image('E'))
	expect(profiles.forMemory('owner', 'a')).toMatchObject({ name: 'Lalaland, our town', cover: image('E') })
	profiles.setCover('owner', 'a', image('E'), null)
	expect(profiles.forMemory('owner', 'a')).toMatchObject({ name: null })
	profiles.rename('owner', key, 'Town')
	profiles.rename('owner', key, 'Town again')
	expect(profiles.list('owner')).toEqual([{ key, name: 'Town again', cover: image('E') }])
	expect(profiles.list('someone else')).toEqual([])
})

test('only the owner of a capture in their gallery can read or picture its server', () => {
	const { profiles, memory } = fixture()
	memory('mine', 'owner', { worldName: 'Home', seed: '42' })
	memory('trashed', 'owner', { worldName: 'Home', seed: '42' }, 5)
	expect(profiles.setCover('intruder', 'mine', image('X'))).toBe(false)
	expect(profiles.forMemory('intruder', 'mine')).toBeNull()
	expect(profiles.nameForMemory('intruder', 'mine')).toBeNull()
	expect(profiles.setCover('owner', 'trashed', image('X'))).toBe(false)
	expect(profiles.forMemory('owner', 'missing')).toBeNull()
	expect(profiles.forMemory('owner', 'mine')).toMatchObject({
		key: JSON.stringify(['world', 'Home', '42']),
		defaultName: 'Home',
	})
	expect(profiles.nameForMemory('owner', 'mine')).toBeNull()
})

test('captures without readable metadata still group under the default server', () => {
	const { profiles, memory, metadataOf } = fixture()
	memory('none', 'owner', undefined)
	memory('broken', 'owner', '{broken')
	memory('odd', 'owner', '[1,2]')
	memory('null', 'owner', 'null')
	const key = JSON.stringify(['server', null])
	for (const id of ['none', 'broken', 'odd', 'null'])
		expect(profiles.forMemory('owner', id)).toMatchObject({ key, defaultName: 'Other captures' })
	expect(profiles.setCover('owner', 'broken', image('Z'))).toBe(true)
	expect(metadataOf('broken')).toEqual({ thumbnail: image('Z'), thumbnailChosen: true })
})
