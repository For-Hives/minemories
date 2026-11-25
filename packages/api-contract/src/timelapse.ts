import { oc } from '@orpc/contract'
import * as z from 'zod'
import { captureBounds, captureOrigin, captureWorldScope } from './capture-identity'
import { captureTime } from './capture-time'
import { thumbnailDataUrl } from './thumbnail'

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
	scope: captureWorldScope,
	totalFrames: z.number().int().positive(),
	totalBytes: z.number().int().positive(),
	frames: z.array(temporalFrame).max(TIMELAPSE_PAGE_FRAMES),
	hasPrevious: z.boolean(),
	hasNext: z.boolean(),
})
export const WORLD_EVOLUTION_FRAMES = 512
export const worldEvolution = z.object({
	worldKey: z.string().regex(/^[a-f0-9]{64}$/),
	name: z.string(),
	dimension: z.string().nullable(),
	scope: captureWorldScope,
	totalFrames: z.number().int().positive(),
	totalBytes: z.number().int().positive(),
	frames: z.array(temporalFrame).max(WORLD_EVOLUTION_FRAMES),
	truncated: z.boolean(),
})
/** One capture of a shared world: what the owner sees, plus its small picture, which a visitor cannot list. */
export const sharedWorldFrame = temporalFrame.extend({ image: thumbnailDataUrl.nullable() })
/**
 * The world a world share link opens: the owner's captures, oldest first. No owner-scoped key, and every name is the
 * place's name, never a capture's file name.
 */
export const sharedWorld = worldEvolution.omit({ worldKey: true }).extend({
	frames: z.array(sharedWorldFrame).max(WORLD_EVOLUTION_FRAMES),
})
export type WorldEvolution = z.infer<typeof worldEvolution>
export type SharedWorld = z.infer<typeof sharedWorld>
export type SharedWorldFrame = z.infer<typeof sharedWorldFrame>
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
	world: oc.input(z.object({ memoryId: z.string().uuid() })).output(worldEvolution),
	/** Open to anyone holding an active world link; its files keep going through `/api/shared/:token/file`. */
	shared: oc
		.input(
			z.object({
				token: z
					.string()
					.min(20)
					.max(200)
					.regex(/^[A-Za-z0-9_-]+$/),
			})
		)
		.output(sharedWorld),
}
