/** The keys that move through an open list (a menu panel, the language list): the arrows wrap, Home and End jump to the ends. */
export function listKeyIndex(key: string, index: number, count: number): number | null {
	if (count < 1) return null
	if (key === 'ArrowDown') return index < 0 || index >= count - 1 ? 0 : index + 1
	if (key === 'ArrowUp') return index <= 0 ? count - 1 : index - 1
	if (key === 'Home') return 0
	if (key === 'End') return count - 1
	return null
}

/** The keys that move between the bar's menu buttons: left and right wrap, Home and End jump to the ends. */
export function rowKeyIndex(key: string, index: number, count: number): number | null {
	if (key === 'ArrowRight') return listKeyIndex('ArrowDown', index, count)
	if (key === 'ArrowLeft') return listKeyIndex('ArrowUp', index, count)
	if (key === 'Home' || key === 'End') return listKeyIndex(key, index, count)
	return null
}

const fold = (text: string) =>
	text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLocaleLowerCase()

/**
 * Typeahead: the first label after `from` (wrapping) that starts with what was typed, accents and case aside. A
 * single repeated letter cycles through the labels that start with it, as in a native list.
 */
export function typeaheadIndex(labels: readonly string[], typed: string, from: number): number | null {
	const query = fold(typed)
	if (!query) return null
	const repeated = [...query].every(letter => letter === query[0])
	const needle = repeated ? query.slice(0, 1) : query
	const count = labels.length
	const start = (((repeated ? from + 1 : from) % count) + count) % count || 0
	const entries = [...labels.entries()]
	const rotated = [...entries.slice(start), ...entries.slice(0, start)]
	return rotated.find(([, label]) => fold(label).startsWith(needle))?.[0] ?? null
}

const trailingSlashes = /\/+$/
const trimmed = (path: string) => (path.length > 1 ? path.replace(trailingSlashes, '') : path)

/** Whether a link of the bar points at the page on screen (a trailing slash aside). */
export function isCurrentPage(pathname: string, to: string): boolean {
	return trimmed(pathname) === trimmed(to)
}

/** Whether one of a menu's links is the page on screen: its button is marked too. */
export function hasCurrentPage(pathname: string, links: ReadonlyArray<{ to: string } | { href: string }>): boolean {
	return links.some(link => 'to' in link && isCurrentPage(pathname, link.to))
}
