import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MemoryMetadata } from './pairing'

const directory = mkdtempSync(join(tmpdir(), 'minemories-link-cards-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'
process.env.BETTER_AUTH_URL = 'https://api.example.test/'

const { app } = await import('./index')
const { database } = await import('./database')
const { addMemory, createPairingCode, createShareLink, exchangePairingCode, revokeShareLink } = await import(
	'./pairing'
)
const { TimelapseIndex } = await import('./timelapse-index')

afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])
const picture = `data:image/jpeg;base64,${jpeg.toString('base64')}`
const identity = {
	worldId: 'c'.repeat(64),
	zoneId: 'd'.repeat(64),
	captureMode: 'around' as const,
	captureBounds: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 2 },
	captureOrigin: { x: 1, y: 1, z: 1 },
	dimension: 'minecraft:overworld',
}

function device(userId: string): string {
	const paired = exchangePairingCode(createPairingCode(userId).code, 'Test device')
	if (!paired) throw new Error('Pairing unexpectedly failed.')
	return paired.deviceId
}

function memory(id: string, userId: string, deviceId: string, metadata: Partial<MemoryMetadata>) {
	addMemory({
		id,
		userId,
		deviceId,
		name: `${id}-capture.glb`,
		objectKey: `${userId}/${id}.glb`,
		size: 7,
		metadata: metadata as MemoryMetadata,
	})
}

const owners = () => database.query('SELECT open_count AS n FROM share_links').all() as { n: number }[]

test('a shared link previews its picture and owner-given name, never its file name or coordinates', async () => {
	const deviceId = device('card-owner')
	memory('card-memory', 'card-owner', deviceId, {
		thumbnail: picture,
		seed: '424242',
		x: 1234,
		y: 64,
		z: -987,
		biome: 'minecraft:plains',
		worldName: 'Secret world',
	})
	const link = createShareLink('card-owner', 'card-memory')
	if (!link) throw new Error('Share link creation unexpectedly failed.')

	const card = await app.request(`/api/cards/shared/${link.token}?lang=fr`)
	expect(card.status).toBe(200)
	expect(card.headers.get('content-type')).toContain('text/html')
	expect(card.headers.get('cache-control')).toBe('private, no-store')
	const html = await card.text()
	// No name given to the place: the translated neutral title, and the build's own picture.
	expect(html).toContain('<html lang="fr">')
	expect(html).toContain('Un lieu Minecraft en 3D, partagé avec toi')
	expect(html).toContain(`content="https://api.example.test/api/cards/shared/${link.token}/image"`)
	expect(html).toContain(`content="https://minemories.net/fr/share/${link.token}"`)
	for (const hidden of ['card-memory-capture', '424242', '1234', '-987', 'plains', 'Secret world', 'card-owner'])
		expect(html).not.toContain(hidden)

	const image = await app.request(`/api/cards/shared/${link.token}/image`)
	expect(image.status).toBe(200)
	expect(image.headers.get('content-type')).toBe('image/jpeg')
	expect(Buffer.from(await image.arrayBuffer()).equals(jpeg)).toBe(true)
	// Robots unfurling the link are not people opening it.
	expect(owners()).toEqual([{ n: 0 }])

	database
		.query(
			"INSERT INTO server_profiles (user_id, server_key, name, cover, updated_at) SELECT 'card-owner', ?, ?, NULL, 0"
		)
		.run(JSON.stringify(['world', 'Secret world', '424242']), 'Le <château> & co')
	const named = await (await app.request(`/api/cards/shared/${link.token}`)).text()
	expect(named).toContain('<title>Le &lt;château&gt; &amp; co</title>')
	expect(named).toContain('<html lang="en">')

	revokeShareLink('card-owner', 'card-memory')
	const stopped = await app.request(`/api/cards/shared/${link.token}`)
	expect(stopped.status).toBe(404)
	const neutral = await stopped.text()
	expect(neutral).toContain('A Minecraft place in 3D, shared with you')
	expect(neutral).toContain('content="https://minemories.net/brand/og-image.png"')
	expect((await app.request(`/api/cards/shared/${link.token}/image`)).status).toBe(404)
})

test('a world link previews the newest snapshot that has a picture', async () => {
	const deviceId = device('world-owner')
	const index = new TimelapseIndex(database)
	for (const [id, day, thumbnail] of [
		['card-world-1', '01', null],
		['card-world-2', '02', picture],
		['card-world-3', '03', null],
	] as const) {
		memory(id, 'world-owner', deviceId, { ...identity, thumbnail, capturedAt: `2026-10-${day}T10:00:00Z` })
		index.put(id)
	}
	const worldKey = index.worldKeyOf('world-owner', 'card-world-1')
	const link = createShareLink('world-owner', 'card-world-3', { scope: 'world', worldKey })
	if (!link) throw new Error('World link creation unexpectedly failed.')
	const image = await app.request(`/api/cards/shared/${link.token}/image`)
	expect(image.status).toBe(200)
	expect(Buffer.from(await image.arrayBuffer()).equals(jpeg)).toBe(true)
})

test('a public card shows only approved publications, with the text their owner consented to', async () => {
	const deviceId = device('public-owner')
	memory('card-public', 'public-owner', deviceId, { thumbnail: picture, seed: '777' })
	const insert = database.query(`INSERT INTO public_publications
 (id, memory_id, user_id, title, description, category, thumbnail, state, submitted_at) VALUES (?, ?, 'public-owner', ?, ?, 'build', ?, ?, 0)`)
	const id = '0f0e0d0c-0b0a-4908-8706-050403020100'
	insert.run(id, 'card-public', 'My "sister\'s" home', `A ${'very '.repeat(80)}big house`, picture, 'pending')

	expect((await app.request(`/api/cards/public/${id}`)).status).toBe(404)
	expect((await app.request(`/api/cards/public/${id}/image`)).status).toBe(404)

	database.query("UPDATE public_publications SET state='approved' WHERE id=?").run(id)
	const card = await app.request(`/api/cards/public/${id}?lang=de`)
	expect(card.status).toBe(200)
	const html = await card.text()
	expect(html).toContain('<title>My &quot;sister&#39;s&quot; home</title>')
	expect(html).toContain(`content="https://minemories.net/de/public/${id}"`)
	expect(html).toMatch(/content="A (very )+very…"/)
	expect(html).not.toContain('777')
	expect((await app.request(`/api/cards/public/${id}/image`)).headers.get('content-type')).toBe('image/jpeg')

	// Without a picture, the site's own image.
	database.query('UPDATE public_publications SET thumbnail=NULL WHERE id=?').run(id)
	expect(await (await app.request(`/api/cards/public/${id}`)).text()).toContain('/brand/og-image.png')
})

test('robots may read the cards, and nothing else on the API', async () => {
	expect(await (await app.request('/robots.txt')).text()).toBe('User-agent: *\nAllow: /api/cards/\nDisallow: /\n')
	const unknown = await app.request('/api/cards/public/not-a-publication?lang=xx')
	expect(unknown.status).toBe(404)
	expect(await unknown.text()).toContain('content="https://minemories.net/public/not-a-publication"')
})
