export const NO_CEILING = -1e9

export interface Ceiling {
	data: Float32Array
	width: number
	depth: number
	minX: number
	minZ: number
	cell: number
}

/**
 * Highest surface of each column, like Minecraft's rain heightmap: weather never falls below it. Columns are one
 * block wide unless the area is too large for `maxCells`, in which case they widen evenly.
 */
export class CeilingGrid {
	private readonly ceiling: Ceiling

	constructor(minX: number, minZ: number, maxX: number, maxZ: number, maxCells = 1 << 20) {
		const spanX = Math.max(1, Math.ceil(maxX - Math.floor(minX)))
		const spanZ = Math.max(1, Math.ceil(maxZ - Math.floor(minZ)))
		const cell = Math.max(1, Math.ceil(Math.sqrt((spanX * spanZ) / maxCells)))
		const width = Math.ceil(spanX / cell)
		const depth = Math.ceil(spanZ / cell)
		this.ceiling = {
			data: new Float32Array(width * depth).fill(NO_CEILING),
			width,
			depth,
			minX: Math.floor(minX),
			minZ: Math.floor(minZ),
			cell,
		}
	}

	/** A face covers the column of its centre, up to its highest corner. */
	addTriangle(
		ax: number,
		ay: number,
		az: number,
		bx: number,
		by: number,
		bz: number,
		cx: number,
		cy: number,
		cz: number
	) {
		const { data, width, depth, minX, minZ, cell } = this.ceiling
		const column = Math.floor(((ax + bx + cx) / 3 - minX) / cell)
		const row = Math.floor(((az + bz + cz) / 3 - minZ) / cell)
		if (!(column >= 0 && column < width && row >= 0 && row < depth)) return
		const index = row * width + column
		data[index] = Math.max(data[index] as number, ay, by, cy)
	}

	get value(): Ceiling {
		return this.ceiling
	}
}
