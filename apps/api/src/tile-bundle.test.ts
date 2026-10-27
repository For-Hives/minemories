import { afterAll, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tileManifest } from '@minemories/api-contract'
import { externalGlbs } from './test-support/glb-fixture'
import { buildTileBundle, packTileBundle, sha256Hex, tileGlb } from './test-support/tile-bundle-fixture'
import { isTileBundle, validateTileBundle } from './tile-bundle'
import { validateUploadFile } from './upload-files'

const dir = await mkdtemp(join(tmpdir(), 'minemories-tile-bundle-'))
afterAll(() => rm(dir, { recursive: true, force: true }))

let counter = 0
async function write(bytes: Buffer): Promise<string> {
	counter += 1
	const path = join(dir, `bundle-${counter}.mmtiles`)
	await writeFile(path, bytes)
	return path
}

function manifestLength(bytes: Buffer): number {
	return bytes.readUInt32LE(8)
}

function dataOf(bytes: Buffer): Buffer {
	return bytes.subarray(12 + manifestLength(bytes))
}

function manifestJson(bytes: Buffer): Record<string, unknown> {
	return JSON.parse(bytes.subarray(12, 12 + manifestLength(bytes)).toString('utf8'))
}

async function expectRejected(bytes: Buffer, options: { size?: number; sha256?: string } = {}) {
	const path = await write(bytes)
	const size = options.size ?? bytes.length
	expect(await validateTileBundle(path, size, options.sha256 ?? sha256Hex(bytes))).toBeNull()
}

const sample = () =>
	buildTileBundle([
		{ x: 0, z: 0 },
		{ x: -1, z: 0, quads: 4 },
		{ x: 0, z: 1 },
	])

test('accepts a valid bundle and returns its layout', async () => {
	const bundle = sample()
	const path = await write(bundle.bytes)
	const layout = await validateTileBundle(path, bundle.bytes.length, bundle.sha256)
	expect(layout).toEqual({ manifest: bundle.manifest, dataOffset: 12 + manifestLength(bundle.bytes) })
	expect(tileManifest.safeParse(layout?.manifest).success).toBe(true)
})

test('rejects wrong magic and wrong version', async () => {
	const magic = Buffer.from(sample().bytes)
	magic.write('NMTB', 0, 'ascii')
	expect(isTileBundle(magic)).toBe(false)
	await expectRejected(magic)

	const version = Buffer.from(sample().bytes)
	version.writeUInt32LE(2, 4)
	await expectRejected(version)
})

test('rejects truncated files and size mismatches', async () => {
	const bytes = sample().bytes
	await expectRejected(bytes.subarray(0, bytes.length - 4))
	await expectRejected(bytes.subarray(0, 8))
	await expectRejected(bytes, { size: bytes.length + 4 })
	await expectRejected(bytes, { size: bytes.length - 2 })
})

test('rejects impossible manifest lengths', async () => {
	await Promise.all(
		[0, manifestLength(sample().bytes) + 1, 0xffffffff, 2 * 1024 * 1024].map(length => {
			const bytes = Buffer.from(sample().bytes)
			bytes.writeUInt32LE(length, 8)
			return expectRejected(bytes)
		})
	)
	const beyond = Buffer.from(sample().bytes)
	beyond.writeUInt32LE(beyond.length, 8)
	await expectRejected(beyond)
})

test('rejects a manifest that is not JSON or fails the schema', async () => {
	const data = dataOf(sample().bytes)
	await expectRejected(packTileBundle('not json!', data))
	await expectRejected(packTileBundle(JSON.stringify({ ...manifestJson(sample().bytes), format: 'other' }), data))
})

test('rejects hand-crafted tile offsets that do not match cumulative sizes', async () => {
	const bundle = sample()
	const manifest = manifestJson(bundle.bytes) as { tiles: { offset: number }[] }
	const [, second] = manifest.tiles
	if (!second) throw new Error('Missing second tile')
	second.offset += 4
	await expectRejected(packTileBundle(JSON.stringify(manifest), dataOf(bundle.bytes)))
})

test('rejects trailing bytes after the last tile', async () => {
	await expectRejected(Buffer.concat([sample().bytes, Buffer.alloc(4)]))
})

test('rejects a tile whose bytes were altered', async () => {
	const bytes = Buffer.from(sample().bytes)
	bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 0x01, bytes.length - 1)
	await expectRejected(bytes)
})

test('rejects a tile that is not a valid GLB even with a correct digest', async () => {
	const bad = externalGlbs()[0] as Buffer
	await expectRejected(buildTileBundle([{ x: 0, z: 0, glb: bad }]).bytes)
})

test('rejects a wrong whole-file digest', async () => {
	const bundle = sample()
	await expectRejected(bundle.bytes, { sha256: '0'.repeat(64) })
})

test('detects the MMTB magic from the head bytes only', () => {
	expect(isTileBundle(sample().bytes)).toBe(true)
	expect(isTileBundle(Buffer.from('MMT'))).toBe(false)
	expect(isTileBundle(Buffer.from('XMMTB'))).toBe(false)
	expect(isTileBundle(Buffer.alloc(0))).toBe(false)
})

test('upload GLB validation still accepts self-contained GLBs and rejects external URIs', async () => {
	const valid = tileGlb(7)
	const validPath = await write(valid)
	expect(await validateUploadFile(validPath, valid.length, sha256Hex(valid))).toBe(true)
	expect(await validateUploadFile(validPath, valid.length + 4, sha256Hex(valid))).toBe(false)

	const external = externalGlbs()[0] as Buffer
	const externalPath = await write(external)
	expect(await validateUploadFile(externalPath, external.length, sha256Hex(external))).toBe(false)
})
