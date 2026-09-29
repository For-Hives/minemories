import { oc } from '@orpc/contract'
import * as z from 'zod'

export const apiContract = {
	pairing: {
		create: oc.output(
			z.object({
				code: z.string().regex(/^\d{6}$/),
				expiresAt: z.string().datetime(),
			})
		),
		check: oc
			.input(z.object({ code: z.string().regex(/^\d{6}$/) }))
			.output(z.object({ status: z.enum(['pending', 'paired', 'expired']) })),
		status: oc.output(z.object({ paired: z.boolean() })),
	},
	memories: {
		list: oc.output(
			z.array(
				z.object({
					id: z.string().uuid(),
					name: z.string(),
					size: z.number().int().nonnegative(),
					createdAt: z.string().datetime(),
					metadata: z.object({
						seed: z.string().nullable(),
						x: z.number().nullable(),
						y: z.number().nullable(),
						z: z.number().nullable(),
						dimension: z.string().nullable(),
						worldName: z.string().nullable(),
						serverName: z.string().nullable(),
						biome: z.string().nullable(),
						dayTime: z.number().int().nullable(),
						raining: z.boolean().nullable(),
						thundering: z.boolean().nullable(),
						thumbnail: z.string().nullable(),
						capturedAt: z.string().datetime().nullable(),
					}),
				})
			)
		),
	},
}
