import {
	captureIdentityFields,
	captureTime,
	captureTimeKey,
	thumbnailDataUrl,
	validCaptureIdentity,
} from '@minemories/api-contract'
import * as z from 'zod'
import type { MemoryMetadata } from './pairing'

const metadataSchema = z
	.object({
		...captureIdentityFields,
		seed: z.string().max(64).nullable().default(null),
		x: z.number().finite().nullable().default(null),
		y: z.number().finite().nullable().default(null),
		z: z.number().finite().nullable().default(null),
		dimension: z.string().max(128).nullable().default(null),
		worldName: z.string().max(128).nullable().default(null),
		serverName: z.string().max(128).nullable().default(null),
		biome: z.string().max(128).nullable().default(null),
		dayTime: z.number().int().nullable().default(null),
		raining: z.boolean().nullable().default(null),
		thundering: z.boolean().nullable().default(null),
		thumbnail: thumbnailDataUrl.nullable().default(null),
		icon: thumbnailDataUrl.nullable().default(null),
		capturedAt: captureTime.nullable().default(null),
		captureStartedAt: captureTime.nullable().default(null),
		captureFinishedAt: captureTime.nullable().default(null),
	})
	.refine(validCaptureIdentity, 'Incomplete or inconsistent capture identity')
	.refine(
		value =>
			!(value.captureStartedAt && value.captureFinishedAt) ||
			(captureTimeKey(value.captureFinishedAt) ?? '') >= (captureTimeKey(value.captureStartedAt) ?? ''),
		'Capture finishes before it starts'
	)

export function parseMetadata(raw: string | undefined): MemoryMetadata | null {
	let value: unknown = {}
	if (raw) {
		try {
			const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64url').toString('utf8')
			value = JSON.parse(json)
		} catch {
			return null
		}
	}
	const parsed = metadataSchema.safeParse(value)
	return parsed.success ? parsed.data : null
}
