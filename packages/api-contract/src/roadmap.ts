import * as z from 'zod'

/** Maximum number of issues returned per roadmap column; `more` counts the rest. */
export const ROADMAP_COLUMN_LIMIT = 25
/** Closed roadmap issues stay in the `done` column for this many days. */
export const ROADMAP_DONE_DAYS = 30
/** Area labels copied from GitHub issues, in this fixed order. */
export const roadmapArea = z.enum(['mod', 'api', 'front'])

export const roadmapItem = z.object({
	number: z.number().int().positive(),
	title: z.string(),
	url: z.string(),
	areas: z.array(roadmapArea),
	updatedAt: z.string(),
	closedAt: z.string().nullable(),
})
export const roadmapColumn = z.object({
	items: z.array(roadmapItem).max(ROADMAP_COLUMN_LIMIT),
	more: z.number().int().nonnegative(),
})
/** Body of `GET /api/roadmap`: GitHub issues labelled `roadmap`, grouped into three columns. */
export const roadmapResponse = z.object({
	updatedAt: z.string(),
	columns: z.object({ planned: roadmapColumn, inProgress: roadmapColumn, done: roadmapColumn }),
})

export type RoadmapArea = z.infer<typeof roadmapArea>
export type RoadmapItem = z.infer<typeof roadmapItem>
export type RoadmapColumn = z.infer<typeof roadmapColumn>
export type RoadmapResponse = z.infer<typeof roadmapResponse>
