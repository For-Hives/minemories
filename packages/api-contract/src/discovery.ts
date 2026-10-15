import { oc } from '@orpc/contract'
import * as z from 'zod'

export const discoveryCategory = z.enum(['build', 'landscape', 'adventure', 'other'])
export const publicationState = z.enum(['private', 'pending', 'approved', 'rejected', 'revoked'])
const id = z.string().uuid()
export const publicCapture = z.object({
	id,
	title: z.string().max(80),
	description: z.string().max(500),
	category: discoveryCategory,
	thumbnail: z.string().max(96_000).nullable(),
	publishedAt: z.string().datetime(),
	votes: z.number().int().nonnegative(),
	voted: z.boolean(),
})
export const publicationStatus = z.object({
	id: id.nullable(),
	state: publicationState,
	reason: z.string().max(500).nullable(),
})
export const discoveryContract = {
	list: oc
		.input(
			z.object({
				query: z.string().trim().max(80).default(''),
				category: discoveryCategory.optional(),
				sort: z.enum(['recent', 'votes']).default('recent'),
				page: z.number().int().min(0).max(1_000_000).default(0),
			})
		)
		.output(z.object({ items: z.array(publicCapture), hasMore: z.boolean() })),
	review: oc.input(z.object({ id })).output(publicCapture),
	get: oc.input(z.object({ id })).output(publicCapture),
	publish: oc
		.input(
			z.object({
				memoryId: id,
				title: z.string().trim().min(1).max(80),
				description: z.string().trim().max(500),
				category: discoveryCategory,
				thumbnail: z
					.string()
					.max(96_000)
					.regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]*={0,2}$/)
					.nullable(),
				consent: z.literal(true),
			})
		)
		.output(publicationStatus),
	status: oc.input(z.object({ memoryId: id })).output(publicationStatus),
	revoke: oc.input(z.object({ memoryId: id })).output(publicationStatus),
	vote: oc
		.input(z.object({ id, voted: z.boolean() }))
		.output(z.object({ votes: z.number().int().nonnegative(), voted: z.boolean() })),
	report: oc
		.input(z.object({ id, reason: z.string().trim().min(1).max(500) }))
		.output(z.object({ ok: z.literal(true) })),
	moderator: oc.output(z.object({ allowed: z.boolean() })),
	queue: oc
		.input(
			z.object({
				state: z.enum(['pending', 'approved', 'rejected', 'reported']).default('pending'),
				page: z.number().int().min(0).max(1_000_000).default(0),
			})
		)
		.output(
			z.object({
				items: z.array(
					publicCapture.extend({
						memoryId: id,
						state: publicationState,
						reason: z.string().nullable(),
						reports: z.array(
							z.object({ id: z.number().int().positive(), reason: z.string(), createdAt: z.string().datetime() })
						),
					})
				),
				hasMore: z.boolean(),
			})
		),
	moderate: oc
		.input(z.object({ id, decision: z.enum(['approved', 'rejected']), reason: z.string().trim().max(500).default('') }))
		.output(publicationStatus),
}
