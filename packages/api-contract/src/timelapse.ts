import { oc } from '@orpc/contract'
import * as z from 'zod'
import { captureBounds, captureOrigin } from './capture-identity'
import { captureTime } from './capture-time'

export const TIMELAPSE_PAGE_FRAMES = 128
export const temporalFrame = z.object({
	id: z.string().uuid(),
	name: z.string(),
	size: z.number().int().positive(),
	at: captureTime,
	timeSource: z.enum(['capture', 'upload']),
	captureStartedAt: captureTime.nullable(),
	captureFinishedAt: captureTime.nullable(),
	origin: captureOrigin,
	bounds: captureBounds,
	dayTime: z.number().int().nullable(),
	seed: z.string().nullable(),
	biome: z.string().nullable(),
})
export const temporalWindow = z.object({
	seriesId: z.string().regex(/^[a-f0-9]{64}$/),
	name: z.string(),
	dimension: z.string().nullable(),
	mode: z.enum(['around', 'selection']),
	totalFrames: z.number().int().positive(),
	totalBytes: z.number().int().positive(),
	frames: z.array(temporalFrame).max(TIMELAPSE_PAGE_FRAMES),
	hasPrevious: z.boolean(),
	hasNext: z.boolean(),
})
export type TemporalFrame = z.infer<typeof temporalFrame>
export type TemporalWindow = z.infer<typeof temporalWindow>
export const timelapseContract = {
	frames: oc
		.input(
			z.object({
				memoryId: z.string().uuid(),
				anchorId: z.string().uuid().optional(),
				direction: z.enum(['around', 'before', 'after']).default('around'),
			})
		)
		.output(temporalWindow),
}
