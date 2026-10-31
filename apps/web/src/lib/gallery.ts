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
	for (const stack of stacks) anchorStack(stack)
	return stacks
}

/** The key follows the oldest capture so a custom area name survives each newer capture joining the stack. */
function anchorStack<T extends LocatedCapture>(stack: CaptureStack<T>) {
	const oldest = stack.captures.at(-1)
	if (!oldest || stack.x === null) return
	const { x, y } = oldest.metadata
	stack.key = `at-${x}-${y ?? 0}-${oldest.metadata.z}`
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

interface IdentifiedCapture {
	id: string
	metadata: { worldId?: string | null | undefined; worldScope?: string | null | undefined; dimension: string | null }
}

export interface WorldBundle<T> {
	key: string
	dimension: string | null
	captures: T[]
}

/** Identified captures of one world and dimension form a single evolving world, whatever their zone. */
export function bundleWorlds<T extends IdentifiedCapture>(
	captures: T[],
	identified: (capture: T) => boolean
): { worlds: WorldBundle<T>[]; others: T[] } {
	const worlds = new Map<string, WorldBundle<T>>()
	const others: T[] = []
	for (const capture of captures) {
		if (!identified(capture)) {
			others.push(capture)
			continue
		}
		const { worldId, worldScope, dimension } = capture.metadata
		const key = JSON.stringify([worldId, worldScope ?? 'world', dimension])
		const world = worlds.get(key) ?? { key, dimension, captures: [] }
		world.captures.push(capture)
		worlds.set(key, world)
	}
	return { worlds: [...worlds.values()], others }
}

interface DatedCapture {
	id: string
	createdAt: string
	metadata: { capturedAt: string | null }
}

function captureStamp(capture: DatedCapture): number {
	const stamp = Date.parse(capture.metadata.capturedAt ?? capture.createdAt)
	return Number.isNaN(stamp) ? 0 : stamp
}

/** The snapshot the single "View" action opens: the most recently captured one, newest upload winning ties. */
export function latestCapture<T extends DatedCapture>(captures: T[]): T | undefined {
	let latest: T | undefined
	for (const capture of captures) if (!latest || captureStamp(capture) > captureStamp(latest)) latest = capture
	return latest
}

/** One viewer URL per area: the timeline is part of the viewer as soon as the area holds several snapshots. */
export function viewPath(id: string, timeline: boolean): string {
	return `/viewer?memory=${encodeURIComponent(id)}${timeline ? '&timelapse=1' : ''}`
}

export interface CaptureArea<T> {
	stack: CaptureStack<T>
	/** An evolving world: its captures replay as one timeline instead of standing alone. */
	evolving: boolean
}

/** Identified captures of one world form a single evolving area; the others stay grouped by position. */
export function captureAreas<T extends IdentifiedCapture & LocatedCapture>(
	captures: T[],
	identified: (capture: T) => boolean
): CaptureArea<T>[] {
	const { worlds, others } = bundleWorlds(captures, identified)
	return [
		...worlds.map(world => ({
			stack: { key: `world:${world.key}`, x: null, y: null, z: null, captures: world.captures },
			evolving: true,
		})),
		...stackCaptures(others).map(stack => ({ stack, evolving: false })),
	]
}

/** `minecraft:snowy_taiga` → `Snowy taiga`; modded namespaces are dropped the same way. */
export function biomeLabel(biome: string): string {
	const words = biome
		.slice(biome.lastIndexOf(':') + 1)
		.replaceAll('_', ' ')
		.trim()
	return words.charAt(0).toUpperCase() + words.slice(1)
}

export function blockCoordinates(metadata: { x: number | null; y: number | null; z: number | null }) {
	const { x, y, z } = metadata
	if (x === null || z === null) return null
	return { x: Math.floor(x), y: y === null ? null : Math.floor(y), z: Math.floor(z) }
}
