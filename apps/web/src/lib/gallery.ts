interface Capture {
	id: string
	metadata: { worldName: string | null; serverName: string | null; seed: string | null }
}

/** One entry per timeline (its latest capture); captures outside any timeline are kept as they are. */
export function collapseTimelines<T extends { id: string; timeline?: { latestId: string } | undefined }>(
	captures: T[]
): T[] {
	return captures.filter(capture => !capture.timeline || capture.timeline.latestId === capture.id)
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

interface LocatedCapture {
	id: string
	metadata: { x: number | null; y: number | null; z: number | null }
}

export interface CaptureStack<T> {
	key: string
	x: number | null
	y: number | null
	z: number | null
	captures: T[]
}

export function stackCaptures<T extends LocatedCapture>(captures: T[], threshold = 64): CaptureStack<T>[] {
	const stacks: CaptureStack<T>[] = []
	let unknown: CaptureStack<T> | null = null
	for (const capture of captures) {
		unknown = placeCapture(stacks, unknown, capture, threshold)
	}
	return stacks
}

function placeCapture<T extends LocatedCapture>(
	stacks: CaptureStack<T>[],
	unknown: CaptureStack<T> | null,
	capture: T,
	threshold: number
): CaptureStack<T> | null {
	const { x, y, z } = capture.metadata
	if (x === null || z === null) return placeUnknown(stacks, unknown, capture)
	const target = findNearbyStack(stacks, x, z, threshold)
	if (target) {
		target.captures.push(capture)
		return unknown
	}
	stacks.push({ key: `at-${x}-${y ?? 0}-${z}`, x, y, z, captures: [capture] })
	return unknown
}

function placeUnknown<T extends LocatedCapture>(
	stacks: CaptureStack<T>[],
	unknown: CaptureStack<T> | null,
	capture: T
): CaptureStack<T> {
	let bucket = unknown
	if (!bucket) {
		bucket = { key: 'unknown', x: null, y: null, z: null, captures: [] }
		stacks.push(bucket)
	}
	bucket.captures.push(capture)
	return bucket
}

function findNearbyStack<T>(
	stacks: CaptureStack<T>[],
	x: number,
	z: number,
	threshold: number
): CaptureStack<T> | null {
	for (const stack of stacks) {
		if (stack.x === null || stack.z === null) continue
		const dx = x - stack.x
		const dz = z - stack.z
		if (dx * dx + dz * dz <= threshold * threshold) return stack
	}
	return null
}
