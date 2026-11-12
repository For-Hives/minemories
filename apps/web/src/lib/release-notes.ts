/*
 * The curated mod release notes (mod/release-notes/<version>.md), read at build time for /versions. Same rules as
 * scripts/discord/release-info.mjs and apps/api/src/mod-release.ts: one `- New: …`, `- Fixed: …` or `- Changed: …` line
 * per note (marker case ignored), an optional trailing `(#123)` pull request, every other line ignored, the author's
 * order kept, at most twelve notes. All three are checked against scripts/discord/fixtures/curated-notes.json.
 */

export type NoteType = 'feature' | 'fix' | 'other'
export interface ReleaseNote {
	type: NoteType
	text: string
	pr: number | null
}
export interface ReleaseNotes {
	notes: ReleaseNote[]
	more: number
}
export interface NotedRelease {
	version: string
	notes: ReleaseNote[]
}

const notesCap = 12
const maxChars = 64 * 1024
const noteLine = /^\s*-\s+(new|fixed|changed):\s*(.*)$/i
const pullRequest = /\(#([1-9]\d{0,8})\)$/
const lineBreak = /\r?\n/
const types: Record<string, NoteType> = { new: 'feature', fixed: 'fix', changed: 'other' }

/** The notes of one file, or null when it holds none. */
export function parseReleaseNotes(markdown: string): ReleaseNotes | null {
	const notes: ReleaseNote[] = []
	for (const line of markdown.slice(0, maxChars).split(lineBreak)) {
		const match = noteLine.exec(line)
		if (!match) continue
		const body = (match[2] as string).trimEnd()
		const pr = pullRequest.exec(body)
		const text = (pr ? body.slice(0, pr.index) : body).trim()
		if (text)
			notes.push({ type: types[(match[1] as string).toLowerCase()] as NoteType, text, pr: pr ? Number(pr[1]) : null })
	}
	if (notes.length === 0) return null
	return { notes: notes.slice(0, notesCap), more: Math.max(0, notes.length - notesCap) }
}

const numericPart = /^\d+$/
function compareParts(a: string[], b: string[]): number {
	for (let index = 0; index < Math.max(a.length, b.length); index++) {
		const [x, y] = [a[index], b[index]]
		if (x === y) continue
		if (x === undefined) return -1
		if (y === undefined) return 1
		return numericPart.test(x) && numericPart.test(y) ? Number(x) - Number(y) : x.localeCompare(y)
	}
	return 0
}
/** Semantic version order: 0.37.0-beta.1 is newer than 0.36.5-beta.1, and a release is newer than its betas. */
export function compareModVersions(a: string, b: string): number {
	const [coreA = '', preA] = a.split('-', 2)
	const [coreB = '', preB] = b.split('-', 2)
	const core = compareParts(coreA.split('.'), coreB.split('.'))
	if (core !== 0) return core
	if (preA === preB) return 0
	if (preA === undefined) return 1
	if (preB === undefined) return -1
	return compareParts(preA.split('.'), preB.split('.'))
}

const fileVersion = /([^/]+)\.md$/
/** Every release with notes, newest first, from a map of file paths to Markdown (the README and empty files are skipped). */
export function releaseHistory(files: Record<string, string>): NotedRelease[] {
	return Object.entries(files)
		.flatMap(([path, markdown]) => {
			const version = fileVersion.exec(path)?.[1]
			const parsed = version && version !== 'README' ? parseReleaseNotes(markdown) : null
			return version && parsed ? [{ version, notes: parsed.notes }] : []
		})
		.sort((a, b) => compareModVersions(b.version, a.version))
}
