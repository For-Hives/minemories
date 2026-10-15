import { describe, expect, test } from 'bun:test'
import { parseMetadata } from './memory-metadata'

describe('capture metadata interval', () => {
	test('keeps old metadata compatible and defaults missing interval values', () => {
		expect(parseMetadata(undefined)?.captureStartedAt).toBeNull()
		expect(parseMetadata('{}')?.captureFinishedAt).toBeNull()
		const old = { capturedAt: '2026-10-14T12:00:00Z', worldName: 'Old capture' }
		expect(parseMetadata(Buffer.from(JSON.stringify(old)).toString('base64url'))?.capturedAt).toBe(old.capturedAt)
		expect(parseMetadata(JSON.stringify({ captureFinishedAt: old.capturedAt }))?.captureFinishedAt).toBe(old.capturedAt)
	})

	test('retains a progressive capture interval including fractional UTC timestamps', () => {
		const input = {
			captureStartedAt: '2026-10-14T12:00:00.123456789Z',
			captureFinishedAt: '2026-10-14T12:00:10.123456789Z',
		}
		const result = parseMetadata(JSON.stringify(input))
		expect(result?.captureStartedAt).toBe(input.captureStartedAt)
		expect(result?.captureFinishedAt).toBe(input.captureFinishedAt)
	})

	test('rejects invalid or reversed intervals rather than storing misleading dates', () => {
		expect(parseMetadata('{invalid json')).toBeNull()
		expect(parseMetadata(JSON.stringify({ captureStartedAt: 'yesterday' }))).toBeNull()
		expect(parseMetadata(JSON.stringify({ captureFinishedAt: 'x'.repeat(1000) }))).toBeNull()
		expect(
			parseMetadata(
				JSON.stringify({
					captureStartedAt: '2026-10-14T12:00:10Z',
					captureFinishedAt: '2026-10-14T12:00:00Z',
				})
			)
		).toBeNull()
	})
})

const frameIdentity = {
	worldId: 'a'.repeat(64),
	zoneId: 'b'.repeat(64),
	captureMode: 'around',
	captureBounds: { minX: -2, minY: -64, minZ: -2, maxX: 2, maxY: 319, maxZ: 2 },
	captureOrigin: { x: 0, y: 127, z: 0 },
}
test('retains a complete timeline identity and leaves legacy uploads untagged', () => {
	expect(parseMetadata('{}')).not.toHaveProperty('worldId')
	expect(parseMetadata(JSON.stringify(frameIdentity))).toMatchObject(frameIdentity)
})
test('refuses partial, malformed, oversized or misaligned frame identities', () => {
	for (const key of Object.keys(frameIdentity)) {
		const partial: Record<string, unknown> = { ...frameIdentity }
		delete partial[key]
		expect(parseMetadata(JSON.stringify(partial))).toBeNull()
	}
	for (const worldId of ['', 'a'.repeat(63), 'A'.repeat(64), null])
		expect(parseMetadata(JSON.stringify({ ...frameIdentity, worldId }))).toBeNull()
	for (const captureBounds of [
		{ ...frameIdentity.captureBounds, minX: 3 },
		{ ...frameIdentity.captureBounds, maxY: 10000 },
		{ ...frameIdentity.captureBounds, maxX: 300 },
		{ ...frameIdentity.captureBounds, maxZ: 300 },
		{ minX: 0, minY: 0, minZ: 0, maxX: 256, maxY: 1023, maxZ: 256 },
	])
		expect(parseMetadata(JSON.stringify({ ...frameIdentity, captureBounds }))).toBeNull()
	expect(parseMetadata(JSON.stringify({ ...frameIdentity, captureOrigin: { x: 1, y: 127, z: 0 } }))).toBeNull()
	expect(parseMetadata(JSON.stringify({ ...frameIdentity, captureMode: 'inferred' }))).toBeNull()
})
