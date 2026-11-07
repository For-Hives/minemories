/** The public roadmap board served by GET /api/roadmap: GitHub issues labelled "roadmap", split into three columns. */
import { ROADMAP_COLUMN_LIMIT, type RoadmapArea, roadmapArea } from '@minemories/api-contract'

export type { RoadmapArea }

export const roadmapColumns = ['inProgress', 'planned', 'done'] as const
export type RoadmapColumnId = (typeof roadmapColumns)[number]
export const roadmapAreas: readonly RoadmapArea[] = roadmapArea.options
/** The API caps each column at this many items and reports the rest as "more". */
export const roadmapColumnCap = ROADMAP_COLUMN_LIMIT
export const roadmapIssuesUrl = 'https://github.com/For-Hives/minemories/issues?q=label%3Aroadmap'
const issueUrlPrefix = 'https://github.com/For-Hives/minemories/issues/'

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
export interface Roadmap {
	updatedAt: string
	columns: Record<RoadmapColumnId, RoadmapColumn>
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
	}
}

/** The date a card shows: when it was closed for the done column, its last activity otherwise. */
export function roadmapItemDate(item: RoadmapItem, column: RoadmapColumnId): string {
	return column === 'done' && item.closedAt ? item.closedAt : item.updatedAt
}
