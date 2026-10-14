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
