/**
 * Many-light handling for the viewer. A capture can hold hundreds of torches, but the renderer pays per live
 * light in every fragment and recompiles every material when that count changes. So the scene keeps a constant
 * pool of real lights and this module decides, from plain numbers, which emitters the pool shows: neighbours are
 * merged into one emitter, the pool follows the view, and a light that enters or leaves fades instead of popping.
 */

export interface Emitter {
	x: number
	y: number
	z: number
	/** Linear colour. */
	r: number
	g: number
	b: number
	intensity: number
	distance: number
}

export interface Point3 {
	x: number
	y: number
	z: number
}

/** One live light of the pool: `level` (0-1) scales the intensity of `emitter`; a free slot has level 0. */
export interface PoolSlot {
	emitter: Emitter | null
	level: number
}

interface Cluster {
	weight: number
	x: number
	y: number
	z: number
	r: number
	g: number
	b: number
	distance: number
	members: Emitter[]
}

const CLUSTER_CELL = 4
/** Relevance bonus of a light already shown: a rival must clearly beat it before the pool swaps them. */
const STICKINESS = 1.4

/**
 * Merges the emitters sharing a grid cell into one: intensity-weighted centroid and colour, summed intensity,
 * and a reach that covers the whole group. A field of torches becomes a few area-like lights.
 */
export function mergeEmitters(emitters: readonly Emitter[], cell = CLUSTER_CELL): Emitter[] {
	const clusters = new Map<string, Cluster>()
	for (const emitter of emitters) {
		const key = `${Math.floor(emitter.x / cell)},${Math.floor(emitter.y / cell)},${Math.floor(emitter.z / cell)}`
		let cluster = clusters.get(key)
		if (!cluster) {
			cluster = { weight: 0, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, distance: 0, members: [] }
			clusters.set(key, cluster)
		}
		const weight = Math.max(emitter.intensity, 1e-6)
		cluster.weight += weight
		cluster.x += emitter.x * weight
		cluster.y += emitter.y * weight
		cluster.z += emitter.z * weight
		cluster.r += emitter.r * weight
		cluster.g += emitter.g * weight
		cluster.b += emitter.b * weight
		cluster.members.push(emitter)
	}
	return [...clusters.values()].map(cluster => {
		const { weight, members } = cluster
		const x = cluster.x / weight,
			y = cluster.y / weight,
			z = cluster.z / weight
		let reach = 0
		let intensity = 0
		let distance = 0
		for (const member of members) {
			intensity += member.intensity
			distance = Math.max(distance, member.distance)
			reach = Math.max(reach, Math.hypot(member.x - x, member.y - y, member.z - z))
		}
		return {
			x,
			y,
			z,
			r: cluster.r / weight,
			g: cluster.g / weight,
			b: cluster.b / weight,
			intensity,
			distance: distance + reach,
		}
	})
}

function relevance(emitter: Emitter, focus: Point3): number {
	const dx = emitter.x - focus.x,
		dy = emitter.y - focus.y,
		dz = emitter.z - focus.z
	return emitter.intensity / (1 + (dx * dx + dy * dy + dz * dz) / 400)
}

interface Slot extends PoolSlot {
	/** Index in the emitter list this slot shows, -1 for a free or fading-out one. */
	held: number
}

interface Pick {
	index: number
	emitter: Emitter
	score: number
}

const placeOf = (emitter: Emitter): string => `${emitter.x},${emitter.y},${emitter.z}`

/**
 * A fixed number of lights that follow the view. `update` re-picks the most relevant emitters around the focus
 * (the ones already shown get a head start, so lights do not swap back and forth at a tie) and eases every light's
 * level, so a source appears and disappears over `fadeSeconds` instead of popping.
 */
export class LightPool {
	readonly slots: readonly PoolSlot[]
	private readonly all: Slot[]
	private emitters: Emitter[] = []
	private readonly fadeSeconds: number

	constructor(size = 12, fadeSeconds = 0.4) {
		this.all = Array.from({ length: size }, () => ({ emitter: null, level: 0, held: -1 }))
		this.slots = this.all
		this.fadeSeconds = fadeSeconds
	}

	/** Replaces the emitters; a light that still exists at the same place keeps its slot and level. */
	setEmitters(emitters: readonly Emitter[]): void {
		const merged = mergeEmitters(emitters)
		const byPlace = new Map(merged.map((emitter, index) => [placeOf(emitter), index]))
		for (const slot of this.all) {
			const index = slot.emitter && slot.held !== -1 ? byPlace.get(placeOf(slot.emitter)) : undefined
			slot.held = index ?? -1
			const next = index === undefined ? undefined : merged[index]
			if (next) slot.emitter = next
		}
		this.emitters = merged
	}

	/** Moves the pool towards the best emitters for `focus`; a huge `seconds` settles it at once. */
	update(focus: Point3, seconds: number): void {
		const wanted = this.best(focus)
		for (const slot of this.all) if (!wanted.some(pick => pick.index === slot.held)) slot.held = -1
		for (const pick of wanted) this.claim(pick)
		const step = seconds / this.fadeSeconds
		for (const slot of this.all) {
			if (slot.held !== -1) slot.level = Math.min(slot.level + step, 1)
			else slot.level = Math.max(slot.level - step, 0)
			if (slot.held === -1 && slot.level === 0) slot.emitter = null
		}
	}

	/** Gives a picked emitter a slot: the one still fading it out, else a free one; none yet means it waits. */
	private claim({ index, emitter }: Pick): void {
		if (this.all.some(slot => slot.held === index)) return
		const slot =
			this.all.find(candidate => candidate.held === -1 && candidate.emitter === emitter) ??
			this.all.find(candidate => candidate.held === -1 && candidate.level === 0)
		if (!slot) return
		slot.held = index
		slot.emitter = emitter
	}

	/** The `slots.length` most relevant emitters, best first. */
	private best(focus: Point3): Pick[] {
		const shown = new Set(this.all.map(slot => slot.held))
		const top: Pick[] = []
		for (const [index, emitter] of this.emitters.entries()) {
			const score = relevance(emitter, focus) * (shown.has(index) ? STICKINESS : 1)
			if (top.length === this.all.length && top.every(pick => score <= pick.score)) continue
			const at = top.findIndex(pick => pick.score < score)
			top.splice(at === -1 ? top.length : at, 0, { index, emitter, score })
			if (top.length > this.all.length) top.pop()
		}
		return top
	}
}
