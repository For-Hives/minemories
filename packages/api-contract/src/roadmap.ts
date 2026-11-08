import * as z from 'zod'

/** Maximum number of issues returned per roadmap column; `more` counts the rest. */
export const ROADMAP_COLUMN_LIMIT = 25
/** Closed roadmap issues stay in the `done` column for this many days. */
export const ROADMAP_DONE_DAYS = 30
/** Maximum number of release notes in `latestRelease`; `more` counts the rest. */
export const ROADMAP_RELEASE_NOTES_LIMIT = 12
/** Area labels copied from GitHub issues, in this fixed order. */
export const roadmapArea = z.enum(['mod', 'api', 'front', 'socials'])

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
/**
 * Group of a release note: `feat` or `New:` -> feature, `fix` or `Fixed:` -> fix, anything else (`Changed:`) -> other.
 */
export const roadmapReleaseNoteType = z.enum(['feature', 'fix', 'other'])
export const roadmapReleaseNote = z.object({
	type: roadmapReleaseNoteType,
	text: z.string(),
	pr: z.number().int().positive().nullable(),
})
/** Where release notes come from: the curated `mod/release-notes/<version>.md` file, or the mod commits. */
export const roadmapReleaseNotesSource = z.enum(['curated', 'commits'])
/**
 * Newest `mod-v*` tag (semver order, a release above its betas) with its curated English notes, or the commits
 * touching `mod/` since the previous one when no curated file exists.
 */
export const roadmapLatestRelease = z.object({
	version: z.string(),
	tag: z.string(),
	date: z.string(),
	prerelease: z.boolean(),
	notes: z.array(roadmapReleaseNote).max(ROADMAP_RELEASE_NOTES_LIMIT),
	more: z.number().int().nonnegative(),
	/** Defaults to `commits` for bodies served before this field. */
	source: roadmapReleaseNotesSource.default('commits'),
	downloadUrl: z.string(),
	changelogUrl: z.string(),
	compareUrl: z.string(),
})
/** Body of `GET /api/roadmap`: GitHub issues labelled `roadmap`, grouped into three columns. */
export const roadmapResponse = z.object({
	updatedAt: z.string(),
	columns: z.object({ planned: roadmapColumn, inProgress: roadmapColumn, done: roadmapColumn }),
	/** Null when no mod tag exists or GitHub never answered; defaults to null for bodies served before this field. */
	latestRelease: roadmapLatestRelease.nullable().default(null),
})

export type RoadmapArea = z.infer<typeof roadmapArea>
export type RoadmapItem = z.infer<typeof roadmapItem>
export type RoadmapColumn = z.infer<typeof roadmapColumn>
export type RoadmapReleaseNoteType = z.infer<typeof roadmapReleaseNoteType>
export type RoadmapReleaseNote = z.infer<typeof roadmapReleaseNote>
export type RoadmapReleaseNotesSource = z.infer<typeof roadmapReleaseNotesSource>
export type RoadmapLatestRelease = z.infer<typeof roadmapLatestRelease>
export type RoadmapResponse = z.infer<typeof roadmapResponse>
