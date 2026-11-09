/** Runs `task` on each item one after the other, in order, for steps that depend on the previous one's effects. */
export function mapSequentially<Item, Result>(
	items: readonly Item[],
	task: (item: Item, index: number) => Promise<Result>
): Promise<Result[]> {
	return items.reduce<Promise<Result[]>>(async (previous, item, index) => {
		const results = await previous
		results.push(await task(item, index))
		return results
	}, Promise.resolve([]))
}
