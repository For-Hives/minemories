/**
 * Runs `task` on each item one after the other, in order, and resolves the results in that order.
 * For work that must not overlap (builds, uploads, writes to one file); independent work uses `Promise.all`.
 */
export function mapSequentially(items, task) {
	return items.reduce(async (previous, item, index) => {
		const results = await previous
		results.push(await task(item, index))
		return results
	}, Promise.resolve([]))
}
