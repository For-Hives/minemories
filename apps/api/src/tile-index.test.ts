import { expect, test } from 'bun:test'
import { buildTileBundle, tileGlb } from './test-support/tile-bundle-fixture'
import { temporalFixture } from './test-support/timelapse-fixture'
import type { TileBundleLayout } from './tile-bundle'
import { TileIndex } from './tile-index'

function layoutOf(tiles: Parameters<typeof buildTileBundle>[0]): { bytes: Buffer; layout: TileBundleLayout } {
	const built = buildTileBundle(tiles)
	return { bytes: built.bytes, layout: { manifest: built.manifest, dataOffset: 12 + built.bytes.readUInt32LE(8) } }
}

const threeTiles = () =>
	layoutOf([
		{ x: 0, z: 0, glb: tileGlb(1) },
		{ x: -1, z: 0, glb: tileGlb(2), quads: 9 },
		{ x: 0, z: -2, glb: tileGlb(3) },
	])

test('put then list and locate expose ordered tiles with absolute offsets', async () => {
	const f = await temporalFixture()
	try {
		const index = new TileIndex(f.db),
			{ layout } = threeTiles(),
			memory = await f.add({}, Buffer.alloc(4))
		index.put(memory.id, layout)
		expect(index.count(memory.id)).toBe(3)
		expect(index.list('owner', memory.id)).toEqual({
			memoryId: memory.id,
			tileChunks: 8,
			tiles: layout.manifest.tiles.map(({ x, z, size, sha256, quads }) => ({ x, z, size, sha256, quads })),
		})
		expect(index.list('owner', memory.id)?.tiles.map(tile => [tile.x, tile.z])).toEqual([
			[-1, 0],
			[0, -2],
			[0, 0],
		])
		for (const tile of layout.manifest.tiles)
			expect(index.locate('owner', memory.id, tile.x, tile.z)).toEqual({
				objectKey: f.key(memory.id),
				offset: layout.dataOffset + tile.offset,
				size: tile.size,
				sha256: tile.sha256,
			})
	} finally {
		await f.close()
	}
})

test('other users, trashed memories, unknown memories and tiles never resolve', async () => {
	const f = await temporalFixture()
	try {
		const index = new TileIndex(f.db),
			{ layout } = threeTiles(),
			memory = await f.add({}, Buffer.alloc(4))
		index.put(memory.id, layout)
		expect(index.list('intruder', memory.id)).toBeNull()
		expect(index.locate('intruder', memory.id, 0, 0)).toBeNull()
		f.db.query('UPDATE memories SET deleted_at=1 WHERE id=?').run(memory.id)
		expect(index.list('owner', memory.id)).toBeNull()
		expect(index.locate('owner', memory.id, 0, 0)).toBeNull()
		f.db.query('UPDATE memories SET deleted_at=NULL WHERE id=?').run(memory.id)
		expect(index.locate('owner', memory.id, 0, 0)).not.toBeNull()
		expect(index.list('owner', 'missing')).toBeNull()
		expect(index.locate('owner', memory.id, 9, 9)).toBeNull()
		expect(index.count('missing')).toBe(0)
		const bare = await f.add({}, Buffer.alloc(4))
		expect(index.list('owner', bare.id)).toBeNull()
	} finally {
		await f.close()
	}
})

test('deleting a memory cascades to its tiles and put replaces previous rows', async () => {
	const f = await temporalFixture()
	try {
		const index = new TileIndex(f.db),
			memory = await f.add({}, Buffer.alloc(4))
		index.put(memory.id, threeTiles().layout)
		const smaller = layoutOf([{ x: 5, z: 5, glb: tileGlb(4) }]).layout
		f.db.transaction(() => index.put(memory.id, smaller))()
		expect(index.count(memory.id)).toBe(1)
		expect(index.locate('owner', memory.id, 0, 0)).toBeNull()
		expect(index.locate('owner', memory.id, 5, 5)).not.toBeNull()
		f.db.query('DELETE FROM memories WHERE id=?').run(memory.id)
		expect(index.count(memory.id)).toBe(0)
	} finally {
		await f.close()
	}
})

test('tile rows survive a database restart', async () => {
	const f = await temporalFixture()
	try {
		const memory = await f.add({}, Buffer.alloc(4))
		new TileIndex(f.db).put(memory.id, threeTiles().layout)
		f.restart()
		expect(new TileIndex(f.db).count(memory.id)).toBe(3)
		expect(new TileIndex(f.db).locate('owner', memory.id, -1, 0)).not.toBeNull()
	} finally {
		await f.close()
	}
})

test('assembly lists every tile in (x, z) order without an owner and with the stored object', async () => {
	const f = await temporalFixture()
	try {
		const index = new TileIndex(f.db),
			{ layout } = threeTiles(),
			memory = await f.add({}, Buffer.alloc(4))
		index.put(memory.id, layout)
		const assembly = index.assembly(memory.id)
		expect(assembly).toEqual({
			memoryId: memory.id,
			tileChunks: 8,
			tiles: layout.manifest.tiles.map(tile => ({
				x: tile.x,
				z: tile.z,
				offset: layout.dataOffset + tile.offset,
				size: tile.size,
				sha256: tile.sha256,
			})),
			objectKey: f.key(memory.id),
			metadataJson: expect.any(String),
		})
		expect(assembly?.tiles.map(tile => [tile.x, tile.z])).toEqual([
			[-1, 0],
			[0, -2],
			[0, 0],
		])
		expect(index.assembly('missing')).toBeNull()
		const bare = await f.add({}, Buffer.alloc(4))
		expect(index.assembly(bare.id)).toBeNull()
		f.db.query('UPDATE memories SET deleted_at=1 WHERE id=?').run(memory.id)
		expect(index.assembly(memory.id)).toBeNull()
	} finally {
		await f.close()
	}
})

test('locateTile resolves a tile without an owner but never a trashed capture', async () => {
	const f = await temporalFixture()
	try {
		const index = new TileIndex(f.db),
			{ layout } = threeTiles(),
			memory = await f.add({}, Buffer.alloc(4))
		index.put(memory.id, layout)
		const tile = layout.manifest.tiles.find(candidate => candidate.x === 0 && candidate.z === 0)
		if (!tile) throw new Error('Missing fixture tile')
		expect(index.locateTile(memory.id, 0, 0)).toEqual({
			objectKey: f.key(memory.id),
			offset: layout.dataOffset + tile.offset,
			size: tile.size,
			sha256: tile.sha256,
		})
		expect(index.locateTile(memory.id, 9, 9)).toBeNull()
		expect(index.locateTile('missing', 0, 0)).toBeNull()
		f.db.query('UPDATE memories SET deleted_at=1 WHERE id=?').run(memory.id)
		expect(index.locateTile(memory.id, 0, 0)).toBeNull()
	} finally {
		await f.close()
	}
})
