import { expect, test } from 'bun:test'
import { writeFile } from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import { buildTileBundle, tileGlb } from './test-support/tile-bundle-fixture'
import { frameMetadata, temporalFixture } from './test-support/timelapse-fixture'
import { type FrameManifest, TIMELAPSE_LEASE_MS } from './timelapse-catalog'

const MAX_RANGE = 64 * 1024 * 1024

function bundle() {
	const built = buildTileBundle([
		{ x: -1, z: 0, glb: tileGlb(1, 300 * 1024) },
		{ x: 0, z: 0, glb: tileGlb(2, 200 * 1024) },
		{ x: 0, z: 1, glb: tileGlb(3, 400 * 1024) },
	])
	const dataOffset = 12 + built.bytes.readUInt32LE(8)
	const absolute = (tile: { offset: number }) => dataOffset + tile.offset
	return { ...built, dataOffset, absolute }
}

/** Parts whose byte span intersects [start, start + length), in manifest order. */
function overlapping(manifest: FrameManifest, start: number, length: number): string[] {
	let position = 0
	const keys: string[] = []
	for (const part of manifest.parts) {
		const end = position + part.size
		if (end > start && position < start + length) keys.push(part.objectKey)
		position = end
	}
	return keys
}

test('raw stored bundles return exact tile bytes for first, last and mid-tile ranges', async () => {
	const f = await temporalFixture()
	try {
		const built = bundle(),
			memory = await f.add({}, built.bytes),
			files = f.files(),
			[first, middle, last] = built.manifest.tiles
		if (!(first && middle && last)) throw new Error('Missing tiles')
		expect(await files.readRange(f.key(memory.id), built.absolute(first), first.size)).toEqual(
			built.bytes.subarray(built.absolute(first), built.absolute(first) + first.size)
		)
		expect(await files.readRange(f.key(memory.id), built.absolute(last), last.size)).toEqual(
			built.bytes.subarray(built.absolute(last), built.absolute(last) + last.size)
		)
		const start = built.absolute(middle) + 1000
		expect(await files.readRange(f.key(memory.id), start, middle.size - 2000)).toEqual(
			built.bytes.subarray(start, start + middle.size - 2000)
		)
	} finally {
		await f.close()
	}
})

test('converted frames return identical bytes and never fetch parts before the requested window', async () => {
	const f = await temporalFixture()
	try {
		const built = bundle(),
			memory = await f.add(frameMetadata, built.bytes)
		expect(await f.files().convert(memory.id)).toBe(true)
		const key = f.key(memory.id),
			manifest = f.catalog().manifest(key)
		if (!manifest) throw new Error('Missing manifest')
		expect(manifest.parts.length).toBeGreaterThan(3)
		const reads: string[] = [],
			read = f.objects.read
		f.objects.read = (objectKey, signal) => {
			reads.push(objectKey)
			return read(objectKey, signal)
		}
		const files = f.files()
		const [first, , last] = built.manifest.tiles
		if (!(first && last)) throw new Error('Missing tiles')
		expect(await files.readRange(key, built.absolute(first), first.size)).toEqual(
			built.bytes.subarray(built.absolute(first), built.absolute(first) + first.size)
		)
		const lastStart = built.absolute(last) + 500
		reads.length = 0
		expect(await files.readRange(key, lastStart, last.size - 500)).toEqual(
			built.bytes.subarray(lastStart, lastStart + last.size - 500)
		)
		expect(reads).toEqual(overlapping(manifest, lastStart, last.size - 500))
		expect(reads.length).toBeLessThan(manifest.parts.length)
	} finally {
		await f.close()
	}
})

test('ranges crossing several parts match the bundle bytes exactly', async () => {
	const f = await temporalFixture()
	try {
		const built = bundle(),
			memory = await f.add(frameMetadata, built.bytes)
		await f.files().convert(memory.id)
		const key = f.key(memory.id),
			manifest = f.catalog().manifest(key)
		if (!manifest) throw new Error('Missing manifest')
		const start = built.dataOffset + 50_000,
			length = 600 * 1024
		expect(overlapping(manifest, start, length).length).toBeGreaterThanOrEqual(3)
		expect(await f.files().readRange(key, start, length)).toEqual(built.bytes.subarray(start, start + length))
		expect(await f.files().readRange(key, 0, 1)).toEqual(built.bytes.subarray(0, 1))
	} finally {
		await f.close()
	}
})

test('invalid arguments are rejected before any storage access', async () => {
	const f = await temporalFixture()
	try {
		const built = bundle(),
			memory = await f.add({}, built.bytes),
			files = f.files()
		const invalid: Array<[number, number]> = [
			[-1, 1],
			[0, 0],
			[0, MAX_RANGE + 1],
			[1.5, 1],
			[0, 2.5],
			[0, Number.NaN],
			[0, Number.POSITIVE_INFINITY],
			[Number.MAX_SAFE_INTEGER + 1, 1],
		]
		await Promise.all(
			invalid.map(([start, length]) =>
				expect(files.readRange(f.key(memory.id), start, length)).rejects.toBeInstanceOf(RangeError)
			)
		)
	} finally {
		await f.close()
	}
})

test('a range ending exactly at the object end succeeds while ranges past it fail for raw and converted objects', async () => {
	const f = await temporalFixture()
	try {
		const built = bundle(),
			raw = await f.add({}, built.bytes),
			converted = await f.add(frameMetadata, built.bytes)
		await f.files().convert(converted.id)
		const size = built.bytes.length
		await Promise.all(
			[raw.id, converted.id].map(async id => {
				const key = f.key(id),
					files = f.files()
				expect(await files.readRange(key, size - 10, 10)).toEqual(built.bytes.subarray(size - 10))
				await expect(files.readRange(key, size - 10, 11)).rejects.toThrow()
				await expect(files.readRange(key, size + 1, 1)).rejects.toThrow()
			})
		)
	} finally {
		await f.close()
	}
})

test('aborted range reads reject with the caller reason', async () => {
	const f = await temporalFixture()
	try {
		const built = bundle(),
			memory = await f.add({}, built.bytes)
		await f.files().convert(memory.id)
		const controller = new AbortController()
		controller.abort(new Error('client went away'))
		await expect(f.files().readRange(f.key(memory.id), 0, 10, controller.signal)).rejects.toThrow('client went away')
	} finally {
		await f.close()
	}
})

test('corrupted stored parts fail integrity checks while untouched parts still read', async () => {
	const f = await temporalFixture()
	try {
		const built = bundle(),
			memory = await f.add(frameMetadata, built.bytes)
		await f.files().convert(memory.id)
		const key = f.key(memory.id),
			manifest = f.catalog().manifest(key)
		const head = manifest?.parts[0]
		if (!(manifest && head)) throw new Error('Missing first part')
		const bytes = await f.raw(head.objectKey)
		bytes[10] = (bytes[10] ?? 0) ^ 0xff
		await writeFile(f.local(head.objectKey), bytes)
		await expect(f.files().readRange(key, 0, 100)).rejects.toThrow('integrity')
		const after = head.size + 10
		expect(await f.files().readRange(key, after, 100)).toEqual(built.bytes.subarray(after, after + 100))
	} finally {
		await f.close()
	}
})

test('a converted range whose lease stops renewing aborts instead of hanging', async () => {
	const f = await temporalFixture()
	try {
		const built = bundle(),
			memory = await f.add(frameMetadata, built.bytes)
		await f.files().convert(memory.id)
		let now = 0
		const read = f.objects.read
		f.objects.read = async (objectKey, signal) => {
			now = TIMELAPSE_LEASE_MS
			await new Promise(resolve => setTimeout(resolve, 20))
			return read(objectKey, signal)
		}
		await expect(f.files({ now: () => now, heartbeatMs: 1 }).readRange(f.key(memory.id), 0, 100)).rejects.toThrow()
		expect(f.db.query('SELECT COUNT(*) AS count FROM timelapse_readers').get()).toEqual({ count: 0 })
	} finally {
		await f.close()
	}
})

test('an aborted raw range read stops a stalled stream and releases its reader', async () => {
	const f = await temporalFixture()
	try {
		const built = bundle(),
			memory = await f.add({}, built.bytes)
		const stalled = new PassThrough()
		f.objects.read = async () => stalled
		const controller = new AbortController()
		const pending = f.files().readRange(f.key(memory.id), 0, 100, controller.signal)
		setTimeout(() => controller.abort(new Error('stop reading')), 5)
		await expect(pending).rejects.toThrow('stop reading')
		expect(stalled.destroyed).toBe(true)
		expect(f.db.query('SELECT COUNT(*) AS count FROM capture_readers').get()).toEqual({ count: 0 })
	} finally {
		await f.close()
	}
})
