/**
 * Block light as a voxel field, the way Minecraft itself stores it: every captured light spreads a level that drops
 * by one per block, and a block takes the brightest level that reaches it. The viewer samples this volume with one
 * texture fetch per fragment, so hundreds of lights cost the same as one and nothing depends on the camera.
 *
 * Falloff is the game's open-air flood fill (Manhattan distance, so a light is a diamond), without occlusion: walls
 * do not stop it, as they did not stop the point lights it replaces. Levels from different lights combine by the
 * maximum per colour channel, as the game combines light levels, never by a sum (a torch field would blow out).
 */

/** The brightest level a block can emit. */
export const MAX_LIGHT_LEVEL = 15

/** Default texel budget: 4 Mi RGBA8 texels = 16 MiB of GPU memory, however large the capture. */
export const LIGHT_VOLUME_BUDGET = 4 * 1024 * 1024

/** Light sources as flat arrays: positions and linear colours are x/y/z and r/g/b triplets, `levels` one per light. */
export interface LightSources {
	positions: Float32Array
	colours: Float32Array
	levels: Float32Array
}

export interface LightVolume {
	/** World position of the volume's minimum corner, in blocks. */
	origin: [number, number, number]
	/** Blocks per texel along each axis (1 = one texel per block). */
	cell: number
	/** Texels along x, y, z. */
	size: [number, number, number]
	/** RGBA8, x fastest: the brightest level per channel as a fraction of 15; alpha is 255. */
	data: Uint8Array
}

export interface LightVolumeLimits {
	/** Largest number of texels. */
	budget: number
	/** Largest texture side. */
	maxSide: number
}

const defaultLimits: LightVolumeLimits = { budget: LIGHT_VOLUME_BUDGET, maxSide: 256 }

function clampLevel(level: number): number {
	return Math.min(Math.max(level, 0), MAX_LIGHT_LEVEL)
}

/** Smallest whole number of blocks per texel that keeps the volume inside both limits. */
function chooseCell(extent: readonly number[], limits: LightVolumeLimits): number {
	let cell = 1
	const fits = () => {
		const sides = extent.map(blocks => Math.ceil(blocks / cell))
		return (
			sides.every(side => side <= limits.maxSide) && sides.reduce((texels, side) => texels * side, 1) <= limits.budget
		)
	}
	while (!fits()) cell++
	return cell
}

interface LightVolumePlan extends LightVolume {
	/** Indices of the sources that give light. */
	lit: number[]
}

/** Bounds, resolution and an empty volume for the sources that give light, or null when none does. */
function planLightVolume(sources: LightSources, limits: LightVolumeLimits): LightVolumePlan | null {
	const { positions, levels } = sources
	const min = [Infinity, Infinity, Infinity]
	const max = [-Infinity, -Infinity, -Infinity]
	let reach = 0
	const lit: number[] = []
	for (const [index, raw] of levels.entries()) {
		const level = clampLevel(raw)
		const point = [
			positions[index * 3] as number,
			positions[index * 3 + 1] as number,
			positions[index * 3 + 2] as number,
		]
		if (!(level >= 1 && point.every(Number.isFinite))) continue
		lit.push(index)
		reach = Math.max(reach, Math.ceil(level))
		for (const [axis, value] of point.entries()) {
			min[axis] = Math.min(min[axis] as number, value)
			max[axis] = Math.max(max[axis] as number, value)
		}
	}
	if (lit.length === 0) return null
	const origin = min.map(value => Math.floor(value) - reach) as [number, number, number]
	const extent = max.map((value, axis) => Math.floor(value) + reach + 1 - (origin[axis] as number))
	const cell = chooseCell(extent, limits)
	const size = extent.map(blocks => Math.ceil(blocks / cell)) as [number, number, number]
	const data = new Uint8Array(size[0] * size[1] * size[2] * 4)
	for (let texel = 3; texel < data.length; texel += 4) data[texel] = 255
	return { origin, cell, size, data, lit }
}

/** Splats the plan's lit sources `from` (inclusive) `to` (exclusive), counted among the lit ones. */
function splatRange(plan: LightVolumePlan, sources: LightSources, from: number, to: number): void {
	const { positions, colours, levels } = sources
	const { origin, cell, size, data } = plan
	for (const index of plan.lit.slice(from, to)) {
		const centre = [0, 1, 2].map(axis =>
			Math.floor(((positions[index * 3 + axis] as number) - (origin[axis] as number)) / cell)
		) as [number, number, number]
		const colour = [0, 1, 2].map(channel => colours[index * 3 + channel] as number) as [number, number, number]
		splat(data, size, centre, clampLevel(levels[index] as number), cell, colour)
	}
}

/** Voxel light field of the sources, or null when none of them gives light. */
export function buildLightVolume(sources: LightSources, limits: LightVolumeLimits = defaultLimits): LightVolume | null {
	const plan = planLightVolume(sources, limits)
	if (!plan) return null
	splatRange(plan, sources, 0, plan.lit.length)
	return plan
}

/** How long the async builder works before it hands the main thread back, in milliseconds. */
const SLICE_MS = 8

/**
 * The same volume, built in slices of about 8 ms with `yieldToMain` between them, so a few thousand lights never
 * freeze the page. `isCancelled` is checked between slices; a cancelled build resolves to null.
 */
export function buildLightVolumeAsync(
	sources: LightSources,
	yieldToMain: () => Promise<void>,
	isCancelled: () => boolean = () => false,
	limits: LightVolumeLimits = defaultLimits,
	now: () => number = () => performance.now()
): Promise<LightVolume | null> {
	const plan = planLightVolume(sources, limits)
	if (!plan) return Promise.resolve(null)
	const total = plan.lit.length
	const run = async (from: number): Promise<LightVolume | null> => {
		const started = now()
		let next = from
		while (next < total && now() - started < SLICE_MS) {
			const end = Math.min(next + 16, total)
			splatRange(plan, sources, next, end)
			next = end
		}
		await yieldToMain()
		if (isCancelled()) return null
		return next < total ? run(next) : plan
	}
	return run(0)
}

/**
 * Spreads one light over its diamond of texels, keeping the brightest level per channel. The volume is padded by
 * the light's reach on every side, so the diamond never leaves it and needs no bounds checks.
 */
function splat(
	data: Uint8Array,
	[nx, ny]: readonly [number, number, number],
	[cx, cy, cz]: readonly [number, number, number],
	level: number,
	cell: number,
	colour: readonly [number, number, number]
): void {
	const steps = Math.ceil(level / cell) - 1
	const scale = 255 / MAX_LIGHT_LEVEL
	const [red, green, blue] = colour.map(channel => Math.min(Math.max(channel, 0), 1) * scale) as [
		number,
		number,
		number,
	]
	for (let dz = -steps; dz <= steps; dz++) {
		for (let dy = -(steps - Math.abs(dz)); dy <= steps - Math.abs(dz); dy++) {
			const rest = steps - Math.abs(dz) - Math.abs(dy)
			const flat = level - cell * (Math.abs(dz) + Math.abs(dy))
			const row = (((cz + dz) * ny + cy + dy) * nx + cx - rest) * 4
			splatRow(data, row, rest, flat, cell, [red, green, blue])
		}
	}
}

/** One row of the diamond: `2 * rest + 1` texels from `row`, brightest at the middle (level `flat`). */
function splatRow(
	data: Uint8Array,
	row: number,
	rest: number,
	flat: number,
	cell: number,
	[red, green, blue]: readonly [number, number, number]
): void {
	for (let x = -rest, base = row; x <= rest; x++, base += 4) {
		const here = flat - cell * Math.abs(x)
		const r = (here * red + 0.5) | 0,
			g = (here * green + 0.5) | 0,
			b = (here * blue + 0.5) | 0
		if (r > (data[base] as number)) data[base] = r
		if (g > (data[base + 1] as number)) data[base + 1] = g
		if (b > (data[base + 2] as number)) data[base + 2] = b
	}
}

/** An imported light as the viewer holds it: world position, linear colour and the glTF intensity the mod wrote. */
export interface ImportedLight {
	position: { x: number; y: number; z: number }
	color: { r: number; g: number; b: number }
	intensity: number
}

/** The mod writes 100 candela per light level (`GlbScene`); the viewer tints block light the warm torch way. */
const CANDELA_PER_LEVEL = 100
const BLOCK_TINT = [1, 0.82, 0.65] as const

/** Flat arrays for the builder: level = intensity / 100, colour tinted warm. */
export function lightSourcesFrom(lights: readonly ImportedLight[]): LightSources {
	const positions = new Float32Array(lights.length * 3)
	const colours = new Float32Array(lights.length * 3)
	const levels = new Float32Array(lights.length)
	for (const [index, light] of lights.entries()) {
		positions.set([light.position.x, light.position.y, light.position.z], index * 3)
		colours.set(
			[light.color.r * BLOCK_TINT[0], light.color.g * BLOCK_TINT[1], light.color.b * BLOCK_TINT[2]],
			index * 3
		)
		levels[index] = light.intensity / CANDELA_PER_LEVEL
	}
	return { positions, colours, levels }
}
