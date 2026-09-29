interface Capture {
	id: string
	metadata: { worldName: string | null; serverName: string | null; seed: string | null }
}

export function groupCaptures<T extends Capture>(captures: T[]) {
	const groups = new Map<string, { key: string; name: string; captures: T[] }>()
	for (const capture of captures) {
		const { worldName, serverName, seed } = capture.metadata
		const name = worldName || serverName || 'Other captures'
		const key = JSON.stringify(worldName ? ['world', worldName, seed] : ['server', serverName])
		let group = groups.get(key)
		if (!group) {
			group = { key, name, captures: [] }
			groups.set(key, group)
		}
		group.captures.push(capture)
	}
	return [...groups.values()]
}
