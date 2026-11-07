/**
 * The public roadmap board served by GET /api/roadmap: GitHub issues labelled "roadmap", split into three columns,
 * plus the latest mod version computed from the repository's mod-v* tags.
 */
import {
	ROADMAP_COLUMN_LIMIT,
	ROADMAP_RELEASE_NOTES_LIMIT,
	type RoadmapArea,
	roadmapArea,
} from '@minemories/api-contract'

export type { RoadmapArea }

export const roadmapColumns = ['inProgress', 'planned', 'done'] as const
export type RoadmapColumnId = (typeof roadmapColumns)[number]
export const roadmapAreas: readonly RoadmapArea[] = roadmapArea.options
/** The API caps each column at this many items and reports the rest as "more". */
export const roadmapColumnCap = ROADMAP_COLUMN_LIMIT
export const roadmapIssuesUrl = 'https://github.com/For-Hives/minemories/issues?q=label%3Aroadmap'
const repositoryUrl = 'https://github.com/For-Hives/minemories'
const issueUrlPrefix = `${repositoryUrl}/issues/`
/** The API caps the notes of the latest release at this many and reports the rest as "more". */
export const releaseNoteCap = ROADMAP_RELEASE_NOTES_LIMIT
const modTagPattern = /^mod-v(\d+\.\d+\.\d+(?:-beta\.\d+)?)$/
const compareUrlPattern =
	/^https:\/\/github\.com\/For-Hives\/minemories\/(?:compare\/mod-v[\w.-]+\.\.\.mod-v[\w.-]+|tree\/mod-v[\w.-]+)$/

export interface RoadmapItem {
	number: number
	title: string
	url: string
	areas: RoadmapArea[]
	updatedAt: string
	closedAt: string | null
}
export interface RoadmapColumn {
	items: RoadmapItem[]
	more: number
}
export const releaseNoteTypes = ['feature', 'fix', 'other'] as const
export type ReleaseNoteType = (typeof releaseNoteTypes)[number]
export interface ReleaseNote {
	type: ReleaseNoteType
	text: string
	/** Pull request number, linked to this repository only. */
	pr: number | null
}
/** The newest mod-v* tag on GitHub and the mod commits it brought since the previous tag. */
export interface LatestRelease {
	version: string
	tag: string
	date: string
	prerelease: boolean
	notes: ReleaseNote[]
	more: number
	compareUrl: string
}
export interface Roadmap {
	updatedAt: string
	columns: Record<RoadmapColumnId, RoadmapColumn>
	latestRelease: LatestRelease | null
}

type Fields = Record<string, unknown>
const isRecord = (value: unknown): value is Fields => typeof value === 'object' && value !== null
const isDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const isArea = (value: unknown): value is RoadmapArea => roadmapAreas.includes(value as RoadmapArea)

/** One card, or null when a field is missing or unusable: the board keeps the other cards. */
export function parseRoadmapItem(value: unknown): RoadmapItem | null {
	if (!isRecord(value)) return null
	const { number, title, url, areas, updatedAt, closedAt } = value
	if (!isCount(number) || number === 0 || typeof title !== 'string' || !title.trim()) return null
	if (!(isDate(updatedAt) && (closedAt === null || closedAt === undefined || isDate(closedAt)))) return null
	// Links only ever point at this repository's issues, whatever the response says.
	const expected = `${issueUrlPrefix}${number}`
	return {
		number,
		title: title.trim(),
		url: url === expected ? url : expected,
		areas: Array.isArray(areas) ? [...new Set(areas.filter(isArea))] : [],
		updatedAt,
		closedAt: closedAt ?? null,
	}
}

function parseColumn(value: unknown): RoadmapColumn {
	if (!(isRecord(value) && Array.isArray(value.items))) throw new Error('Invalid roadmap column')
	const items = value.items.flatMap(item => parseRoadmapItem(item) ?? [])
	const hidden = Math.max(0, items.length - roadmapColumnCap)
	return {
		items: items.slice(0, roadmapColumnCap),
		more: (isCount(value.more) ? value.more : 0) + hidden,
	}
}

export const pullRequestUrl = (pr: number) => `${repositoryUrl}/pull/${pr}`

/** One release note, or null when its text is unusable; an unknown type counts as "other". */
export function parseReleaseNote(value: unknown): ReleaseNote | null {
	if (!(isRecord(value) && typeof value.text === 'string' && value.text.trim())) return null
	const type = releaseNoteTypes.includes(value.type as ReleaseNoteType) ? (value.type as ReleaseNoteType) : 'other'
	const pr = isCount(value.pr) && value.pr > 0 ? value.pr : null
	return { type, text: value.text.trim(), pr }
}

/** The latest mod version, or null when it is missing or unusable: the board does not depend on it. */
export function parseLatestRelease(value: unknown): LatestRelease | null {
	if (!(isRecord(value) && typeof value.tag === 'string' && isDate(value.date))) return null
	const version = modTagPattern.exec(value.tag)?.[1]
	if (!version || (value.version !== undefined && value.version !== version)) return null
	const notes = Array.isArray(value.notes) ? value.notes.flatMap(note => parseReleaseNote(note) ?? []) : []
	const hidden = Math.max(0, notes.length - releaseNoteCap)
	// Like issue links, the compare link only ever points at this repository.
	const compareUrl =
		typeof value.compareUrl === 'string' && compareUrlPattern.test(value.compareUrl)
			? value.compareUrl
			: `${repositoryUrl}/tree/${value.tag}`
	return {
		version,
		tag: value.tag,
		date: value.date,
		prerelease: typeof value.prerelease === 'boolean' ? value.prerelease : version.includes('-'),
		notes: notes.slice(0, releaseNoteCap),
		more: (isCount(value.more) ? value.more : 0) + hidden,
		compareUrl,
	}
}

/** Validates the API response; throws when the board itself is unusable. */
export function parseRoadmap(data: unknown): Roadmap {
	if (!(isRecord(data) && isDate(data.updatedAt) && isRecord(data.columns))) throw new Error('Invalid roadmap')
	const columns = data.columns
	return {
		updatedAt: data.updatedAt,
		columns: {
			inProgress: parseColumn(columns.inProgress),
			planned: parseColumn(columns.planned),
			done: parseColumn(columns.done),
		},
		latestRelease: parseLatestRelease(data.latestRelease),
	}
}

/** The date a card shows: when it was closed for the done column, its last activity otherwise. */
export function roadmapItemDate(item: RoadmapItem, column: RoadmapColumnId): string {
	return column === 'done' && item.closedAt ? item.closedAt : item.updatedAt
}
